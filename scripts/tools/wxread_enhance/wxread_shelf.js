/*
------------------------------------------
@Description: 微信读书 · 订阅列表增强与专属自动入架流程
@Author: TomCatXue
@Version: 2.1.0
@Date: 2026-10-02 09:00
------------------------------------------
核心架构与原则：
  1. 严格分离三大功能：
     - 微信读书原生订阅：仅作为收藏，已上架与待上架图书全开放订阅按钮；订阅后不自动入架、不修改原书状态。
     - 微信读书官方加入书架（详情页/搜索页）：保持官方原生行为，不篡改、不转发、不触发Bot。
     - 订阅列表加入书架：唯一允许触发自动流程的入口（source = subscription_list_add）。
  2. 修复状态污染 Bug：
     - 严禁将 offshelfBooks 转移至 onshelfBooks；
     - 严禁篡改 soldout、soldoutType；真实保留图书上下架状态。
  3. 订阅列表（已上架书与待上架书）按钮全量呈现：
     - 结合真实书架同步缓存与自动入架库，精准识别每本书的在架状态；
     - 在架显示：[已加入书架]；未在架显示：[加入书架]；
     - 任务执行状态机动态呈现：[处理中 0%] -> [处理中 50%] -> [已加入书架] / [失败 重试]。
  4. 修复批量加入与删除复现 Bug：
     - 单书精准处理：仅针对当前点击的单一 bookId 生成任务；
     - 物理隔离存储体系：
       * weread_subscribed_books: 订阅关系快照；
       * weread_auto_shelf_tasks: 自动流程任务状态机 (pending/processing/completed/failed)；
       * weread_auto_shelf_books: 已完成自动流程的正式入架书籍；
       * weread_real_shelf_books: 官方真实书架在架索引缓存；
       * weread_bot_config: 用户自定义的 Bot/API 配置，无硬编码。
     - 联动清理：/shelf/delete 与 /shelf/sync(removed) 实时剔除已删书籍，杜绝复现。
  5. 按钮驱动实时反馈：
     - 全程禁止任何 Loon 通知、系统弹窗、Toast 与外部打点；
     - 所有任务进度与结果纯粹通过订阅列表中该书的按钮文案反馈。
*/

const SCRIPT_NAME = "微信读书·订阅增强";
const SCRIPT_VERSION = "2.1.0";
const $ = new Env(SCRIPT_NAME);

// ============================================================
// 持久化存储工具函数
// ============================================================
function getStorage(key) {
  if (typeof $persistentStore !== "undefined" && $persistentStore.read) {
    return $persistentStore.read(key);
  }
  return null;
}

function setStorage(val, key) {
  if (typeof $persistentStore !== "undefined" && $persistentStore.write) {
    return $persistentStore.write(val, key);
  }
}

function getJsonStorage(key, defaultVal) {
  try {
    const raw = getStorage(key);
    return raw ? JSON.parse(raw) : (defaultVal || {});
  } catch (e) {
    return defaultVal || {};
  }
}

function setJsonStorage(val, key) {
  try {
    setStorage(JSON.stringify(val), key);
  } catch (e) {}
}

// ============================================================
// 插件参数解析 (兼容 Loon 各种传参形态)
// ============================================================
function getArgumentValue(argKey, index) {
  if (typeof $argument === "undefined" || !$argument) return "";
  if (typeof $argument === "object") {
    return $argument[argKey] || "";
  }
  if (typeof $argument === "string") {
    let trimmed = $argument.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    const parts = trimmed.split(",").map(p => p.trim());
    if (typeof index === "number" && parts.length > index) {
      return parts[index];
    }
    if (argKey) {
      const match = trimmed.match(new RegExp("(?:^|[&,;\\s])" + argKey + "=([^&,;\\s]+)"));
      if (match) return decodeURIComponent(match[1]);
    }
  }
  return "";
}

// 动态读取并同步 Bot 配置
function loadBotConfig() {
  let stored = getJsonStorage("weread_bot_config", {
    enable: false,
    apiUrl: "",
    token: "",
    chatId: ""
  });

  const argEnable = getArgumentValue("weread_bot_enable", 0);
  const argApiUrl = getArgumentValue("weread_bot_api_url", 1);
  const argToken = getArgumentValue("weread_bot_token", 2);
  const argChatId = getArgumentValue("weread_bot_chat_id", 3);

  let updated = false;
  if (argEnable !== "") {
    stored.enable = (argEnable === "true" || argEnable === true);
    updated = true;
  }
  if (argApiUrl) {
    stored.apiUrl = argApiUrl;
    updated = true;
  }
  if (argToken) {
    stored.token = argToken;
    updated = true;
  }
  if (argChatId) {
    stored.chatId = argChatId;
    updated = true;
  }

  if (updated) {
    setJsonStorage(stored, "weread_bot_config");
  }
  return stored;
}

// Base64 编解码辅助
function b64decode(str) {
  if (!str) return str;
  try { if (typeof $base64 !== "undefined" && $base64.decode) return $base64.decode(str); } catch (e) {}
  try { if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8"); } catch (e) {}
  try { if (typeof atob !== "undefined") return decodeURIComponent(atob(str).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")); } catch (e) {}
  return str;
}

// 生成规范任务 ID: WR + YYYYMMDD + 4位序号/随机数
function generateTaskId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `WR${yyyy}${mm}${dd}${rand}`;
}

// ============================================================
// 主程序执行流程
// ============================================================
(function main() {
  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
  const isRequest = (typeof $response === "undefined");

  // =========================================================================
  // 分支 1：REQUEST 请求阶段拦截
  // =========================================================================
  if (isRequest) {
    // -----------------------------------------------------------------------
    // 1.1 /shelf/add：严格区分来源，仅对订阅列表专属加入执行自动流程
    // -----------------------------------------------------------------------
    if (/\/shelf\/add/i.test(url)) {
      try {
        let reqBodyStr = (typeof $request !== "undefined" && $request.body) ? $request.body : "";
        if (reqBodyStr) {
          try { reqBodyStr = b64decode(reqBodyStr); } catch (e) {}
          const reqJson = JSON.parse(reqBodyStr);
          const addIds = reqJson.bookIds || (reqJson.bookId ? [reqJson.bookId] : []);
          const targetBookId = (Array.isArray(addIds) && addIds.length > 0) ? String(addIds[0]) : "";

          if (targetBookId) {
            const pageContext = getJsonStorage("weread_page_context", {});
            const subscribedMap = getJsonStorage("weread_subscribed_books", {});
            const now = Math.floor(Date.now() / 1000);

            const isExplicitSource = (reqJson.source === "subscription_list_add" || /[?&]source=subscription_list_add/i.test(url));
            const isContextualSubscription = (
              pageContext.currentPage === "subscription_list" &&
              Boolean(subscribedMap[targetBookId]) &&
              (now - (pageContext.subscriptionVisitedAt || 0) < 600) &&
              (pageContext.lastDetailBookId !== targetBookId)
            );

            // 唯一允许触发条件：来自订阅列表
            if (isExplicitSource || isContextualSubscription) {
              const bookInfo = subscribedMap[targetBookId] || {};
              const title = bookInfo.title || `书籍 (${targetBookId})`;
              const author = bookInfo.author || "微信读书";
              const isbn = bookInfo.isbn || "";

              // 检查任务防重：若任务已处于 processing 或 completed，严禁重复提交
              let taskMap = getJsonStorage("weread_auto_shelf_tasks", {});
              let existingTask = taskMap[targetBookId];
              if (existingTask && (existingTask.status === "processing" || existingTask.status === "completed")) {
                $done({
                  response: {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ succ: 1, taskId: existingTask.taskId, status: existingTask.status })
                  }
                });
                return;
              }

              // 创建新任务
              const taskId = generateTaskId();
              const newTask = {
                taskId: taskId,
                bookId: targetBookId,
                title: title,
                author: author,
                status: "pending",
                progress: 0,
                source: "subscription_list_add",
                createdAt: now,
                updatedAt: now
              };
              taskMap[targetBookId] = newTask;
              setJsonStorage(taskMap, "weread_auto_shelf_tasks");

              // 检查外部 Bot/API 配置
              const botConfig = loadBotConfig();
              if (botConfig.enable && botConfig.apiUrl) {
                newTask.status = "processing";
                newTask.progress = 50;
                newTask.updatedAt = Math.floor(Date.now() / 1000);
                taskMap[targetBookId] = newTask;
                setJsonStorage(taskMap, "weread_auto_shelf_tasks");

                if (typeof $httpClient !== "undefined" && $httpClient.post) {
                  $httpClient.post({
                    url: botConfig.apiUrl,
                    headers: {
                      "Content-Type": "application/json",
                      ...(botConfig.token ? { "Authorization": `Bearer ${botConfig.token}` } : {})
                    },
                    body: JSON.stringify({
                      taskId: taskId,
                      bookId: targetBookId,
                      title: title,
                      author: author,
                      isbn: isbn,
                      chatId: botConfig.chatId,
                      source: "subscription_list_add"
                    }),
                    timeout: 20
                  }, function(err, resp, dataStr) {
                    let tasks = getJsonStorage("weread_auto_shelf_tasks", {});
                    let curTask = tasks[targetBookId] || newTask;
                    const finishTime = Math.floor(Date.now() / 1000);

                    if (!err && resp && (resp.status === 200 || resp.statusCode === 200)) {
                      curTask.status = "completed";
                      curTask.progress = 100;
                      curTask.updatedAt = finishTime;
                      tasks[targetBookId] = curTask;
                      setJsonStorage(tasks, "weread_auto_shelf_tasks");

                      let autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
                      autoShelfBooks[targetBookId] = {
                        bookId: targetBookId,
                        title: title,
                        taskId: taskId,
                        addedAt: finishTime
                      };
                      setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
                    } else {
                      curTask.status = "failed";
                      curTask.progress = 0;
                      curTask.updatedAt = finishTime;
                      tasks[targetBookId] = curTask;
                      setJsonStorage(tasks, "weread_auto_shelf_tasks");
                    }
                  });
                }
              } else {
                newTask.status = "completed";
                newTask.progress = 100;
                newTask.updatedAt = now;
                taskMap[targetBookId] = newTask;
                setJsonStorage(taskMap, "weread_auto_shelf_tasks");

                let autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
                autoShelfBooks[targetBookId] = {
                  bookId: targetBookId,
                  title: title,
                  taskId: taskId,
                  addedAt: now
                };
                setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
              }

              $done({
                response: {
                  status: 200,
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ succ: 1, taskId: taskId, status: newTask.status })
                }
              });
              return;
            }
          }
        }
      } catch (e) {}
      // 官方加入书架：100% 保持官方原生行为，直接放行上游请求
      $done({});
      return;
    }

    // -----------------------------------------------------------------------
    // 1.2 /shelf/delete：监听用户删除行为，同步清理各持久化记录
    // -----------------------------------------------------------------------
    if (/\/shelf\/delete/i.test(url)) {
      try {
        let reqBodyStr = (typeof $request !== "undefined" && $request.body) ? $request.body : "";
        if (reqBodyStr) {
          try { reqBodyStr = b64decode(reqBodyStr); } catch (e) {}
          const reqJson = JSON.parse(reqBodyStr);
          const delIds = reqJson.bookIds || (reqJson.bookId ? [reqJson.bookId] : []);
          if (Array.isArray(delIds) && delIds.length > 0) {
            let autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
            let taskMap = getJsonStorage("weread_auto_shelf_tasks", {});
            let realShelf = getJsonStorage("weread_real_shelf_books", {});
            let cleaned = false;
            for (const dId of delIds) {
              const strId = String(dId);
              if (autoShelfBooks[strId]) { delete autoShelfBooks[strId]; cleaned = true; }
              if (taskMap[strId]) { delete taskMap[strId]; cleaned = true; }
              if (realShelf[strId]) { delete realShelf[strId]; cleaned = true; }
            }
            if (cleaned) {
              setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
              setJsonStorage(taskMap, "weread_auto_shelf_tasks");
              setJsonStorage(realShelf, "weread_real_shelf_books");
            }
          }
        }
      } catch (e) {}
      $done({});
      return;
    }

    // -----------------------------------------------------------------------
    // 1.3 /subscription/(operation|cancel)：捕获用户点击订阅/取消订阅动作
    // -----------------------------------------------------------------------
    if (/\/subscription\/(operation|cancel)/i.test(url)) {
      try {
        const bIdMatch = url.match(/[?&]bookIds?=([^&]+)/i);
        let targetBookId = bIdMatch ? decodeURIComponent(bIdMatch[1]) : "";
        let opType = 1; // 1: 订阅, 2: 取消订阅

        let reqBodyStr = (typeof $request !== "undefined" && $request.body) ? $request.body : "";
        if (reqBodyStr) {
          try { reqBodyStr = b64decode(reqBodyStr); } catch (e) {}
          try {
            const reqJson = JSON.parse(reqBodyStr);
            if (reqJson.bookId) targetBookId = String(reqJson.bookId);
            if (reqJson.opType !== undefined) opType = reqJson.opType;
          } catch (e) {}
        }
        if (/\/subscription\/cancel/i.test(url)) {
          opType = 2;
        }

        if (targetBookId) {
          let subscribedMap = getJsonStorage("weread_subscribed_books", {});
          const nowSec = Math.floor(Date.now() / 1000);
          if (opType === 1) {
            subscribedMap[targetBookId] = subscribedMap[targetBookId] || {
              bookId: targetBookId,
              title: `书籍 (${targetBookId})`,
              author: "微信读书",
              cover: "",
              originalStatus: 0,
              subscribedAt: nowSec
            };
            setJsonStorage(subscribedMap, "weread_subscribed_books");
          } else if (opType === 2) {
            delete subscribedMap[targetBookId];
            setJsonStorage(subscribedMap, "weread_subscribed_books");
          }
        }
      } catch (e) {}
      $done({});
      return;
    }

    $done({});
    return;
  }

  // =========================================================================
  // 分支 2：RESPONSE 响应阶段拦截
  // =========================================================================
  if (!$response || !$response.body) {
    $done({});
    return;
  }

  try {
    const rawBody = $response.body;
    let data = null;
    let isBase64 = false;

    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      try {
        const decoded = b64decode(rawBody);
        data = JSON.parse(decoded);
        isBase64 = true;
      } catch (e2) {}
    }

    if (!data || typeof data !== "object") {
      $done({});
      return;
    }

    let modified = false;

    // -----------------------------------------------------------------------
    // 2.1 /book/infos?：为详情页所有图书（包含已上架图书）激活“订阅”按钮
    // -----------------------------------------------------------------------
    if (/\/book\/infos?/i.test(url)) {
      const bIdMatch = url.match(/[?&]bookIds?=([^&]+)/i);
      const detailBookId = bIdMatch ? decodeURIComponent(bIdMatch[1]) : (data.bookId ? String(data.bookId) : "");
      if (detailBookId) {
        let pageContext = getJsonStorage("weread_page_context", {});
        pageContext.currentPage = "book_detail";
        pageContext.lastDetailBookId = detailBookId;
        pageContext.detailVisitedAt = Math.floor(Date.now() / 1000);
        setJsonStorage(pageContext, "weread_page_context");

        // 核心支持：激活原生详情页“订阅”能力
        data.canSubscribe = 1;
        data.showSubscribe = 1;
        data.showSubscribeButton = 1;
        data.hasSubscribe = 1;

        // 同步当前的订阅状态
        const subscribedMap = getJsonStorage("weread_subscribed_books", {});
        const isSub = Boolean(subscribedMap[detailBookId]);
        data.isSubscribed = isSub ? 1 : 0;
        data.subscribed = isSub ? 1 : 0;
        data.hasSubscribed = isSub ? 1 : 0;

        // 若详情页有完整书名、封面、作者，更新至订阅库快照
        if (subscribedMap[detailBookId] && data.title) {
          subscribedMap[detailBookId].title = data.title;
          if (data.author) subscribedMap[detailBookId].author = data.author;
          if (data.cover) subscribedMap[detailBookId].cover = data.cover;
          if (data.isbn) subscribedMap[detailBookId].isbn = data.isbn;
          setJsonStorage(subscribedMap, "weread_subscribed_books");
        }
        modified = true;
      }
    }

    // -----------------------------------------------------------------------
    // 2.2 /subscription/books：已上架与待上架图书全量注入[加入书架]/[已加入书架]按钮
    // -----------------------------------------------------------------------
    if (/\/subscription\/books/i.test(url)) {
      let pageContext = getJsonStorage("weread_page_context", {});
      pageContext.currentPage = "subscription_list";
      pageContext.lastDetailBookId = "";
      pageContext.subscriptionVisitedAt = Math.floor(Date.now() / 1000);
      setJsonStorage(pageContext, "weread_page_context");

      let subscribedMap = getJsonStorage("weread_subscribed_books", {});
      const nowSec = Math.floor(Date.now() / 1000);
      let subUpdated = false;

      function recordSubscribedBook(bookItem, isSoldout) {
        if (!bookItem) return;
        const bId = bookItem.bookId || bookItem.id;
        if (!bId) return;
        const strId = String(bId);
        subscribedMap[strId] = {
          bookId: strId,
          title: bookItem.title || bookItem.name || "订阅书籍",
          author: bookItem.author || "微信读书",
          cover: bookItem.cover || bookItem.coverUrl || "",
          isbn: bookItem.isbn || "",
          originalStatus: (bookItem.soldout !== undefined) ? bookItem.soldout : (isSoldout ? 1 : 0),
          subscribedAt: subscribedMap[strId]?.subscribedAt || nowSec
        };
        subUpdated = true;
      }

      if (Array.isArray(data.onshelfBooks)) {
        for (const b of data.onshelfBooks) recordSubscribedBook(b, false);
      }
      if (Array.isArray(data.offshelfBooks)) {
        for (const b of data.offshelfBooks) recordSubscribedBook(b, true);
      }
      if (Array.isArray(data.books)) {
        for (const b of data.books) recordSubscribedBook(b, false);
      }
      if (subUpdated) {
        setJsonStorage(subscribedMap, "weread_subscribed_books");
      }

      const autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
      const realShelfMap = getJsonStorage("weread_real_shelf_books", {});
      const taskMap = getJsonStorage("weread_auto_shelf_tasks", {});

      // 核心支持：不论是已上架书(onshelf)还是待上架书(offshelf)，后面均显示[已加入书架]或[加入书架]按钮
      function enhanceBookButton(bookItem) {
        if (!bookItem || typeof bookItem !== "object") return;
        const bId = String(bookItem.bookId || bookItem.id || "");
        if (!bId) return;

        const task = taskMap[bId];
        // 综合判定是否已经在书架上：
        // 1. 本地自动入架库已标记完成；
        // 2. 任务状态机显示 completed；
        // 3. 服务端原生字段标记已经在架 (inShelf / shelfStatus / isOnBookshelf)；
        // 4. 用户真实书架缓存中存在该书 ID。
        const isAlreadyOnShelf = Boolean(
          autoShelfBooks[bId] ||
          (task && task.status === "completed") ||
          bookItem.isOnBookshelf === true ||
          bookItem.inShelf === 1 ||
          bookItem.shelfStatus === 1 ||
          realShelfMap[bId]
        );

        // 强行开启客户端按钮渲染开关
        bookItem.showShelfButton = true;
        bookItem.shelfButton = true;
        bookItem.hasShelfButton = true;

        if (isAlreadyOnShelf) {
          // 状态：已加入书架
          bookItem.buttonText = "已加入书架";
          bookItem.shelfButtonText = "已加入书架";
          bookItem.buttonTitle = "已加入书架";
          bookItem.actionText = "已加入书架";
          bookItem.btnText = "已加入书架";
          bookItem.isOnBookshelf = true;
          bookItem.inShelf = 1;
          bookItem.shelfStatus = 1;
        } else if (task && task.status === "pending") {
          // 状态：任务已建立，排队中
          bookItem.buttonText = "处理中 0%";
          bookItem.shelfButtonText = "处理中 0%";
          bookItem.buttonTitle = "处理中 0%";
          bookItem.actionText = "处理中 0%";
          bookItem.btnText = "处理中 0%";
          bookItem.isOnBookshelf = false;
          bookItem.inShelf = 0;
          bookItem.shelfStatus = 0;
        } else if (task && task.status === "processing") {
          // 状态：正在调用外部 API 或处理中
          const p = task.progress || 50;
          bookItem.buttonText = `处理中 ${p}%`;
          bookItem.shelfButtonText = `处理中 ${p}%`;
          bookItem.buttonTitle = `处理中 ${p}%`;
          bookItem.actionText = `处理中 ${p}%`;
          bookItem.btnText = `处理中 ${p}%`;
          bookItem.isOnBookshelf = false;
          bookItem.inShelf = 0;
          bookItem.shelfStatus = 0;
        } else if (task && task.status === "failed") {
          // 状态：处理失败，允许重试
          bookItem.buttonText = "失败 重试";
          bookItem.shelfButtonText = "失败 重试";
          bookItem.buttonTitle = "失败 重试";
          bookItem.actionText = "失败 重试";
          bookItem.btnText = "失败 重试";
          bookItem.isOnBookshelf = false;
          bookItem.inShelf = 0;
          bookItem.shelfStatus = 0;
        } else {
          // 默认未在架状态：显示 [加入书架]
          bookItem.buttonText = "加入书架";
          bookItem.shelfButtonText = "加入书架";
          bookItem.buttonTitle = "加入书架";
          bookItem.actionText = "加入书架";
          bookItem.btnText = "加入书架";
          bookItem.isOnBookshelf = false;
          bookItem.inShelf = 0;
          bookItem.shelfStatus = 0;
        }
      }

      // 对已上架书与待上架书两张列表全面执行按钮与在架状态增强
      if (Array.isArray(data.onshelfBooks)) {
        for (const b of data.onshelfBooks) enhanceBookButton(b);
      }
      if (Array.isArray(data.offshelfBooks)) {
        for (const b of data.offshelfBooks) enhanceBookButton(b);
      }
      modified = true;
    }

    // -----------------------------------------------------------------------
    // 2.3 /shelf/sync：缓存真实书架在架索引，增量同步已完成书籍，清理删除项
    // -----------------------------------------------------------------------
    if (/\/shelf\/(sync|syncbook)/i.test(url)) {
      // 1. 缓存官方真实书架在架索引
      let realShelf = getJsonStorage("weread_real_shelf_books", {});
      if (Array.isArray(data.books)) {
        for (const b of data.books) {
          if (b && b.bookId) {
            realShelf[String(b.bookId)] = true;
          }
        }
      }
      // 2. 若服务端下发了 removed 删除列表，同步抹除
      if (Array.isArray(data.removed) && data.removed.length > 0) {
        let autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
        let taskMap = getJsonStorage("weread_auto_shelf_tasks", {});
        for (const rmId of data.removed) {
          const strRmId = String(rmId);
          delete realShelf[strRmId];
          delete autoShelfBooks[strRmId];
          delete taskMap[strRmId];
        }
        setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
        setJsonStorage(taskMap, "weread_auto_shelf_tasks");
      }
      setJsonStorage(realShelf, "weread_real_shelf_books");

      // 3. 仅增量补入 weread_auto_shelf_books 中已完成自动流程的书籍
      const autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
      const completedList = Object.values(autoShelfBooks);

      if (completedList.length > 0) {
        if (!Array.isArray(data.books)) {
          data.books = [];
        }
        const subscribedMap = getJsonStorage("weread_subscribed_books", {});
        const nowSec = Math.floor(Date.now() / 1000);

        for (const target of completedList) {
          const tId = String(target.bookId);
          const meta = subscribedMap[tId] || {};
          const existing = data.books.find(b => b && String(b.bookId) === tId);

          if (!existing) {
            data.books.unshift({
              bookId: tId,
              title: target.title || meta.title || "已加入书籍",
              author: meta.author || "微信读书",
              cover: meta.cover || "",
              format: "epub",
              version: 1,
              finish: 1,
              type: 0,
              readUpdateTime: target.addedAt || nowSec,
              updateTime: target.addedAt || nowSec,
              progress: 0,
              chapterUid: 1,
              chapterOffset: 0,
              chapterIdx: 1
            });
          }
          if (Array.isArray(data.removed)) {
            data.removed = data.removed.filter(id => String(id) !== tId);
          }
        }
        modified = true;
      }
    }

    if (modified) {
      function b64encode(str) {
        if (typeof $base64 !== "undefined" && $base64.encode) return $base64.encode(str);
        try { if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64"); } catch (e) {}
        try { if (typeof btoa !== "undefined") return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode("0x" + p1))); } catch (e) {}
        return str;
      }
      const newBody = isBase64 ? b64encode(JSON.stringify(data)) : JSON.stringify(data);
      $done({ body: newBody });
      return;
    }

  } catch (err) {}

  $done({});
})();

function Env(name) {
  this.name = name;
  this.log = function() {
    if (typeof console !== "undefined" && console.log) {
      console.log.apply(console, arguments);
    }
  };
}

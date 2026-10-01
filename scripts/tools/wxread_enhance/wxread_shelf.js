/*
------------------------------------------
@Description: 微信读书 · 订阅列表增强与专属自动入架流程
@Author: TomCatXue
@Version: 2.0.0
@Date: 2026-10-02 08:30
------------------------------------------
核心架构与原则：
  1. 严格分离三大功能：
     - 微信读书原生订阅：仅作为收藏，保持原生行为，不入书架、不触发自动流程、不改状态。
     - 微信读书官方加入书架（详情页/搜索页）：保持官方原生行为，不篡改、不转发、不触发Bot。
     - 订阅列表加入书架：唯一允许触发自动流程的入口（source = subscription_list_add）。
  2. 修复状态污染 Bug：
     - 严禁将 offshelfBooks 转移至 onshelfBooks；
     - 严禁篡改 soldout、soldoutType、shelfStatus；真实保留图书状态。
  3. 修复批量加入与删除复现 Bug：
     - 单书精准处理：仅针对当前点击的单一 bookId 生成任务；
     - 物理隔离存储体系：
       * weread_subscribed_books: 仅存订阅关系快照；
       * weread_auto_shelf_tasks: 仅存自动流程任务状态机 (pending/processing/completed/failed)；
       * weread_auto_shelf_books: 仅存已完成自动流程的正式入架书籍；
       * weread_bot_config: 保存用户自定义的 Bot/API 配置，无硬编码。
     - 联动清理：/shelf/delete 与 /shelf/sync(removed) 实时剔除已删书籍，杜绝复现。
  4. 按钮驱动实时反馈：
     - 全程禁止任何 Loon 通知、系统弹窗、Toast 与外部打点；
     - 所有任务进度纯粹通过订阅列表中该书的按钮文案反馈：
       [加入书架] -> [处理中 0%] -> [处理中 50%] -> [已加入书架] / [失败 重试]。
*/

const SCRIPT_NAME = "微信读书·订阅增强";
const SCRIPT_VERSION = "2.0.0";
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
    // 支持按逗号分隔的纯位置参数 (0: enable, 1: apiUrl, 2: token, 3: chatId)
    const parts = trimmed.split(",").map(p => p.trim());
    if (typeof index === "number" && parts.length > index) {
      return parts[index];
    }
    // 兼容 key=val 传参
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
            // 来源严格判定：
            // 1. 请求体/URL 显式声明 source = subscription_list_add；
            // 2. 或处于订阅列表活跃上下文内，且该书隶属于 weread_subscribed_books，且未发生详情页导航
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

            // 唯一允许触发条件
            if (isExplicitSource || isContextualSubscription) {
              const bookInfo = subscribedMap[targetBookId] || {};
              const title = bookInfo.title || `下架书籍 (${targetBookId})`;
              const author = bookInfo.author || "微信读书";
              const isbn = bookInfo.isbn || "";

              // 检查任务防重：若任务已处于 processing 或 completed，严禁重复提交
              let taskMap = getJsonStorage("weread_auto_shelf_tasks", {});
              let existingTask = taskMap[targetBookId];
              if (existingTask && (existingTask.status === "processing" || existingTask.status === "completed")) {
                // 已经处理中或已完成，静默响应成功，不创建新任务
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
                // 推进任务状态到 processing 50%
                newTask.status = "processing";
                newTask.progress = 50;
                newTask.updatedAt = Math.floor(Date.now() / 1000);
                taskMap[targetBookId] = newTask;
                setJsonStorage(taskMap, "weread_auto_shelf_tasks");

                // 发起异步 API 调用 (禁止任何通知)
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
                      // API 调用成功 -> 执行加入书架
                      curTask.status = "completed";
                      curTask.progress = 100;
                      curTask.updatedAt = finishTime;
                      tasks[targetBookId] = curTask;
                      setJsonStorage(tasks, "weread_auto_shelf_tasks");

                      // 写入已入架列表
                      let autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
                      autoShelfBooks[targetBookId] = {
                        bookId: targetBookId,
                        title: title,
                        taskId: taskId,
                        addedAt: finishTime
                      };
                      setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
                    } else {
                      // API 调用失败 -> 标记 failed
                      curTask.status = "failed";
                      curTask.progress = 0;
                      curTask.updatedAt = finishTime;
                      tasks[targetBookId] = curTask;
                      setJsonStorage(tasks, "weread_auto_shelf_tasks");
                    }
                  });
                }
              } else {
                // 未启用 Bot/API：本地直接完成加入书架并标记 completed
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

              // 订阅专属流程响应 200 OK 且 succ: 1，完全不惊动上游
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
      // 官方加入书架操作：100% 保持官方原生行为，直接放行上游请求
      $done({});
      return;
    }

    // -----------------------------------------------------------------------
    // 1.2 /shelf/delete：监听用户删除行为，同步清理 weread_auto_shelf_books
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
            let cleaned = false;
            for (const dId of delIds) {
              const strId = String(dId);
              if (autoShelfBooks[strId]) {
                delete autoShelfBooks[strId];
                cleaned = true;
              }
              if (taskMap[strId]) {
                delete taskMap[strId];
                cleaned = true;
              }
            }
            if (cleaned) {
              setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
              setJsonStorage(taskMap, "weread_auto_shelf_tasks");
            }
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
    // 2.1 /book/info：只获取详情，更新页面上下文为详情页，严禁写入任务与篡改状态
    // -----------------------------------------------------------------------
    if (/\/book\/info/i.test(url)) {
      const bIdMatch = url.match(/[?&]bookIds?=([^&]+)/i);
      const detailBookId = bIdMatch ? decodeURIComponent(bIdMatch[1]) : (data.bookId ? String(data.bookId) : "");
      if (detailBookId) {
        let pageContext = getJsonStorage("weread_page_context", {});
        pageContext.currentPage = "book_detail";
        pageContext.lastDetailBookId = detailBookId;
        pageContext.detailVisitedAt = Math.floor(Date.now() / 1000);
        setJsonStorage(pageContext, "weread_page_context");
      }
      // 保持微信读书官方原生行为，直接放行
      $done({});
      return;
    }

    // -----------------------------------------------------------------------
    // 2.2 /subscription/books：只读取订阅并持久化，注入按钮状态，严禁转移 offshelfBooks
    // -----------------------------------------------------------------------
    if (/\/subscription\/books/i.test(url)) {
      // 标记页面上下文为订阅列表
      let pageContext = getJsonStorage("weread_page_context", {});
      pageContext.currentPage = "subscription_list";
      pageContext.lastDetailBookId = "";
      pageContext.subscriptionVisitedAt = Math.floor(Date.now() / 1000);
      setJsonStorage(pageContext, "weread_page_context");

      // 提取所有订阅书籍，纯净同步至 weread_subscribed_books (只读收藏关系)
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

      // 读取当前已完成入架列表与任务状态机
      const autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
      const taskMap = getJsonStorage("weread_auto_shelf_tasks", {});

      // 核心要求：在按钮上呈现任务状态，严禁弹窗与通知，严禁修改 soldout / soldoutType
      function enhanceBookButton(bookItem) {
        if (!bookItem || typeof bookItem !== "object") return;
        const bId = String(bookItem.bookId || bookItem.id || "");
        if (!bId) return;

        const isAdded = Boolean(autoShelfBooks[bId]);
        const task = taskMap[bId];

        if (isAdded || (task && task.status === "completed")) {
          // 状态：已加入书架
          bookItem.buttonText = "已加入书架";
          bookItem.shelfButtonText = "已加入书架";
          bookItem.buttonTitle = "已加入书架";
          bookItem.isOnBookshelf = true;
          bookItem.showShelfButton = true;
        } else if (task) {
          if (task.status === "pending") {
            bookItem.buttonText = "处理中 0%";
            bookItem.shelfButtonText = "处理中 0%";
            bookItem.buttonTitle = "处理中 0%";
            bookItem.showShelfButton = true;
            bookItem.isOnBookshelf = false;
          } else if (task.status === "processing") {
            const p = task.progress || 50;
            bookItem.buttonText = `处理中 ${p}%`;
            bookItem.shelfButtonText = `处理中 ${p}%`;
            bookItem.buttonTitle = `处理中 ${p}%`;
            bookItem.showShelfButton = true;
            bookItem.isOnBookshelf = false;
          } else if (task.status === "failed") {
            bookItem.buttonText = "失败 重试";
            bookItem.shelfButtonText = "失败 重试";
            bookItem.buttonTitle = "失败 重试";
            bookItem.showShelfButton = true;
            bookItem.isOnBookshelf = false;
          }
        } else {
          // 默认未加入状态
          bookItem.buttonText = "加入书架";
          bookItem.shelfButtonText = "加入书架";
          bookItem.buttonTitle = "加入书架";
          bookItem.showShelfButton = true;
          bookItem.isOnBookshelf = false;
        }
      }

      // 仅增强展示层按钮，保留原生 onshelfBooks 与 offshelfBooks 的数据隔离
      if (Array.isArray(data.onshelfBooks)) {
        for (const b of data.onshelfBooks) enhanceBookButton(b);
      }
      if (Array.isArray(data.offshelfBooks)) {
        for (const b of data.offshelfBooks) enhanceBookButton(b);
      }
      modified = true;
    }

    // -----------------------------------------------------------------------
    // 2.3 /shelf/sync：仅同步 weread_auto_shelf_books 中已完成的书籍，杜绝批量恢复
    // -----------------------------------------------------------------------
    if (/\/shelf\/(sync|syncbook)/i.test(url)) {
      // 1. 若服务端下发了用户在其他端删除的 removed 列表，同步清理
      if (Array.isArray(data.removed) && data.removed.length > 0) {
        let autoShelfBooks = getJsonStorage("weread_auto_shelf_books", {});
        let taskMap = getJsonStorage("weread_auto_shelf_tasks", {});
        let hasRemoved = false;
        for (const rmId of data.removed) {
          const strRmId = String(rmId);
          if (autoShelfBooks[strRmId]) {
            delete autoShelfBooks[strRmId];
            hasRemoved = true;
          }
          if (taskMap[strRmId]) {
            delete taskMap[strRmId];
            hasRemoved = true;
          }
        }
        if (hasRemoved) {
          setJsonStorage(autoShelfBooks, "weread_auto_shelf_books");
          setJsonStorage(taskMap, "weread_auto_shelf_tasks");
        }
      }

      // 2. 仅针对 weread_auto_shelf_books 中由用户在订阅列表明确点击并已完成的书籍进行增量注入
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
            // 增量补入单本已完成的书籍
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
          // 确保不在 removed 列表中冲刷
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

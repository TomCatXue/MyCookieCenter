/*
------------------------------------------
@Description: 微信读书 · 优雅书架 (下架书籍虚拟注入与全鉴权放行)
@Author: TomCatXue
@Version: 1.0.6
@Date: 2026-10-01 10:30
------------------------------------------
核心特性：
  1. 订阅下架书全自动捕获（/subscription/books, /shelf/opus）：
     - 服务端将下架书下发至 offshelfBooks 数组；脚本自动遍历并提取元数据落盘缓存；
     - 将 offshelfBooks 中的下架图书全部转移至 onshelfBooks 并抹除 soldout 标记；
  2. 加书架请求层截断（/shelf/add）：
     - 在 Request 阶段本地 0ms 截断发包，提取并缓存 bookId，直接返回 200 {succ:1}，杜绝官方 4xx/下架报错阻断；
  3. 虚拟书架动态注入（/shelf/sync, /shelf/syncbook）：
     - 将捕获的下架书与手动配置的书籍动态注入客户端书架数据，并从 removed 列表中剔除，补全 CoreData 全字段；
  4. 详情与付费鉴权全链路破除（/book/info, /book/readinfo, /book/paytime）：
     - 改写 /book/info 抹除 soldout/soldoutType 并标记 isPaid=1、free=1、maxFreeChapter=999999；
     - 修复服务端下架后 /book/readinfo 返回 errcode:-2001 导致的阅读器崩溃，重建合法阅读会话；
     - 修复 /book/paytime 数组结构解析缺陷，伪装已购时间戳放行 isPaiedNormalSoldoutBook；
  5. 章节价格与购买容错（/book/chapterInfos, /pay/buyChapters）：
     - 全章节价格对齐公版书 0 元免费，拦截购买请求模拟成功。
*/

const SCRIPT_NAME = "微信读书·优雅书架";
const SCRIPT_VERSION = "1.0.6";
const $ = new Env(SCRIPT_NAME);

function b64encode(str) {
  if (typeof $base64 !== "undefined" && $base64.encode) return $base64.encode(str);
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
  } catch (e) {}
  try {
    if (typeof btoa !== "undefined") return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode("0x" + p1)));
  } catch (e) {}
  return str;
}

function b64decode(str) {
  if (!str) return str;
  try {
    if (typeof $base64 !== "undefined" && $base64.decode) return $base64.decode(str);
  } catch (e) {}
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
  } catch (e) {}
  try {
    if (typeof atob !== "undefined") return decodeURIComponent(atob(str).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
  } catch (e) {}
  return str;
}

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

function getArgumentValue(argKey) {
  if (typeof $argument === "undefined" || !$argument) return "";
  if (typeof $argument === "object") return $argument[argKey] || "";
  if (typeof $argument === "string") {
    let trimmed = $argument.trim();
    // 兼容 Loon {${weread_inject_books}} 展开后自带的外层大括号
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    if (!trimmed) return "";
    // 兼容 Loon 直接传值模式（如 "23665510,490081"）
    if (/^[0-9\s,;|]+$/.test(trimmed)) {
      return trimmed;
    }
    // 兼容 key=val 传参模式
    if (argKey) {
      const match = trimmed.match(new RegExp("(?:^|[&,;\\s])" + argKey + "=([^&,;\\s]+)"));
      if (match) return decodeURIComponent(match[1]);
    }
  }
  return "";
}

(function main() {
  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
  const isRequest = typeof $response === "undefined";

  // ============================================================
  // 分支 A：Request 阶段拦截 (专为 /shelf/add 打造，0ms 本地 Mock 成功)
  // ============================================================
  if (isRequest) {
    if (/\/shelf\/add/i.test(url)) {
      try {
        let reqBodyStr = (typeof $request !== "undefined" && $request.body) ? $request.body : "";
        if (reqBodyStr) {
          try { reqBodyStr = b64decode(reqBodyStr); } catch (e) {}
          const reqJson = JSON.parse(reqBodyStr);
          const addIds = reqJson.bookIds || (reqJson.bookId ? [reqJson.bookId] : []);
          if (Array.isArray(addIds) && addIds.length > 0) {
            let stored = {};
            try { stored = JSON.parse(getStorage("weread_shelf_injected_books") || "{}"); } catch (e) {}
            for (const bId of addIds) {
              if (bId) {
                const sId = String(bId);
                stored[sId] = stored[sId] || {
                  bookId: sId,
                  title: "下架书籍 (" + sId + ")",
                  author: "微信读书",
                  cover: "https://weread-1258476243.file.myqcloud.com/books/cover/" + sId + "/s_" + sId + ".jpg",
                  format: "epub",
                  version: 1,
                  soldout: 0,
                  soldoutType: 0,
                  isPaid: 1,
                  payType: 0,
                  payingStatus: 1,
                  free: 1,
                  price: 0,
                  originalPrice: 0,
                  centPrice: 0,
                  cpid: 0,
                  ispub: 1,
                  finish: 1,
                  type: 0,
                  updateTime: Math.floor(Date.now() / 1000)
                };
              }
            }
            setStorage(JSON.stringify(stored), "weread_shelf_injected_books");
            $.log("[" + SCRIPT_NAME + "] 从 /shelf/add (Request) 成功捕获并持久化 " + addIds.length + " 本书籍: " + addIds.join(","));
          }
        }
      } catch (e) {
        $.log("[" + SCRIPT_NAME + "] 捕获 /shelf/add 请求异常: " + (e.message || e));
      }
      // 直接在客户端层面响应 200 OK 与 succ:1，彻底避免上游服务器因下架返回 4xx/错误码
      const mockResp = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ succ: 1 })
      };
      $done({ response: mockResp });
      return;
    }
    $done({});
    return;
  }

  // ============================================================
  // 分支 B：Response 阶段拦截
  // ============================================================
  if (!$response || !$response.body) {
    $done({});
    return;
  }

  try {
    const rawBody = $response.body;
    let data = null;
    let isBase64 = false;

    // 1. 尝试解析为 JSON (支持明文与 Base64)
    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      try {
        const decoded = b64decode(rawBody);
        data = JSON.parse(decoded);
        isBase64 = true;
      } catch (e2) {}
    }

    // 针对加入书架接口 /shelf/add：若穿透至响应层，补救伪造成功响应
    if (/\/shelf\/add/i.test(url)) {
      try {
        let reqBodyStr = (typeof $request !== "undefined" && $request.body) ? $request.body : "";
        if (reqBodyStr) {
          try { reqBodyStr = b64decode(reqBodyStr); } catch (e) {}
          const reqJson = JSON.parse(reqBodyStr);
          const addIds = reqJson.bookIds || (reqJson.bookId ? [reqJson.bookId] : []);
          if (Array.isArray(addIds) && addIds.length > 0) {
            let stored = {};
            try { stored = JSON.parse(getStorage("weread_shelf_injected_books") || "{}"); } catch (e) {}
            for (const bId of addIds) {
              if (bId) {
                const sId = String(bId);
                stored[sId] = stored[sId] || {
                  bookId: sId,
                  title: "下架书籍 (" + sId + ")",
                  author: "微信读书",
                  cover: "https://weread-1258476243.file.myqcloud.com/books/cover/" + sId + "/s_" + sId + ".jpg",
                  format: "epub",
                  version: 1,
                  soldout: 0,
                  soldoutType: 0,
                  isPaid: 1,
                  payType: 0,
                  payingStatus: 1,
                  free: 1,
                  price: 0,
                  originalPrice: 0,
                  centPrice: 0,
                  cpid: 0,
                  ispub: 1,
                  finish: 1,
                  type: 0,
                  updateTime: Math.floor(Date.now() / 1000)
                };
              }
            }
            setStorage(JSON.stringify(stored), "weread_shelf_injected_books");
            $.log("[" + SCRIPT_NAME + "] 从 /shelf/add (Response) 补救捕获书籍: " + addIds.join(","));
          }
        }
      } catch (e) {}
      const mockSucc = { succ: 1 };
      const newBody = isBase64 ? b64encode(JSON.stringify(mockSucc)) : JSON.stringify(mockSucc);
      $done({ body: newBody });
      return;
    }

    if (!data || typeof data !== "object") {
      $done({});
      return;
    }

    let modified = false;

    // ==========================================
    // 模块一：订阅接口下架书全自动捕获（offshelfBooks 转移与落盘）
    // ==========================================
    if (/\/(subscription\/books|shelf\/opus)/i.test(url)) {
      const booksToHarvest = [];
      if (Array.isArray(data.offshelfBooks)) booksToHarvest.push(...data.offshelfBooks);
      if (Array.isArray(data.onshelfBooks)) booksToHarvest.push(...data.onshelfBooks);
      if (Array.isArray(data.books)) booksToHarvest.push(...data.books);
      if (Array.isArray(data.items)) booksToHarvest.push(...data.items);
      if (Array.isArray(data.opus)) booksToHarvest.push(...data.opus);
      if (data.data && Array.isArray(data.data.books)) booksToHarvest.push(...data.data.books);

      if (booksToHarvest.length > 0) {
        let stored = {};
        try { stored = JSON.parse(getStorage("weread_shelf_injected_books") || "{}"); } catch (e) {}
        let newCount = 0;
        for (const b of booksToHarvest) {
          const bId = b.bookId || b.id;
          if (bId) {
            const strId = String(bId);
            stored[strId] = {
              bookId: strId,
              title: b.title || b.name || "下架书籍",
              author: b.author || "微信读书",
              cover: b.cover || b.coverUrl || ("https://weread-1258476243.file.myqcloud.com/books/cover/" + strId + "/s_" + strId + ".jpg"),
              format: b.format || "epub",
              version: b.version || 1,
              soldout: 0,
              soldoutType: 0,
              isPaid: 1,
              payType: 0,
              payingStatus: 1,
              free: 1,
              price: 0,
              originalPrice: 0,
              centPrice: 0,
              cpid: 0,
              ispub: 1,
              finish: b.finish !== undefined ? b.finish : 1,
              type: b.type !== undefined ? b.type : 0,
              updateTime: Math.floor(Date.now() / 1000)
            };
            newCount++;
          }
        }
        if (newCount > 0) {
          setStorage(JSON.stringify(stored), "weread_shelf_injected_books");
          $.log("[" + SCRIPT_NAME + "] 从订阅接口成功嗅探并落盘 " + newCount + " 本书籍（含 offshelfBooks 下架书）！");
        }
      }

      // 核心根治：将 offshelfBooks 中的下架图书全部转移至 onshelfBooks 并抹除 soldout 标记
      if (Array.isArray(data.offshelfBooks) && data.offshelfBooks.length > 0) {
        if (!Array.isArray(data.onshelfBooks)) data.onshelfBooks = [];
        for (const b of data.offshelfBooks) {
          b.soldout = 0;
          b.soldoutType = 0;
          b.free = 1;
          b.price = 0;
          b.originalPrice = 0;
          b.centPrice = 0;
          b.cpid = 0;
          b.ispub = 1;
          b.isPaid = 1;
          b.payType = 0;
          b.payingStatus = 1;
          data.onshelfBooks.push(b);
        }
        data.offshelfBooks = [];
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功将订阅接口中 " + data.onshelfBooks.length + " 本下架书转为已上架并放行渲染！");
      }
    }

    // ==========================================
    // 模块二：书架同步虚拟注入 (/shelf/sync, /shelf/syncbook)
    // ==========================================
    if (/\/shelf\/(sync|syncbook)/i.test(url)) {
      if (!Array.isArray(data.books)) {
        data.books = [];
      }

      let storedMap = {};
      try { storedMap = JSON.parse(getStorage("weread_shelf_injected_books") || "{}"); } catch (e) {}

      // 合并用户手动指定的 Argument 书籍 ID
      const manualArg = getArgumentValue("weread_inject_books") || getArgumentValue("inject_book_ids") || getArgumentValue("");
      if (manualArg) {
        const manualIds = manualArg.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
        for (const mId of manualIds) {
          if (!storedMap[mId]) {
            storedMap[mId] = {
              bookId: mId,
              title: "下架书籍 (" + mId + ")",
              author: "微信读书",
              cover: "https://weread-1258476243.file.myqcloud.com/books/cover/" + mId + "/s_" + mId + ".jpg",
              format: "epub",
              version: 1,
              soldout: 0,
              soldoutType: 0,
              isPaid: 1,
              payType: 0,
              payingStatus: 1,
              free: 1,
              price: 0,
              originalPrice: 0,
              centPrice: 0,
              cpid: 0,
              ispub: 1,
              finish: 1,
              type: 0,
              updateTime: Math.floor(Date.now() / 1000)
            };
          }
        }
      }

      const injectList = Object.values(storedMap);
      if (injectList.length > 0) {
        const nowSec = Math.floor(Date.now() / 1000);
        for (const targetBook of injectList) {
          const tId = String(targetBook.bookId);
          const existing = data.books.find(b => b && String(b.bookId) === tId);
          if (existing) {
            existing.soldout = 0;
            existing.soldoutType = 0;
            existing.isPaid = 1;
            existing.payType = 0;
            existing.payingStatus = 1;
            existing.free = 1;
            existing.price = 0;
            existing.originalPrice = 0;
            existing.centPrice = 0;
            existing.cpid = 0;
            existing.ispub = 1;
          } else {
            data.books.unshift(Object.assign({
              format: "epub",
              version: 1,
              finish: 1,
              type: 0,
              readUpdateTime: nowSec,
              updateTime: nowSec,
              progress: 0,
              chapterUid: 1,
              chapterOffset: 0,
              chapterIdx: 1
            }, targetBook, {
              soldout: 0,
              soldoutType: 0,
              isPaid: 1,
              payType: 0,
              payingStatus: 1,
              free: 1,
              price: 0,
              originalPrice: 0,
              centPrice: 0,
              cpid: 0,
              ispub: 1
            }));
          }
          if (Array.isArray(data.removed)) {
            data.removed = data.removed.filter(id => String(id) !== tId);
          }
        }
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功向书架注入 " + injectList.length + " 本下架/订阅书籍！");
      }
    }

    // ==========================================
    // 模块三：书籍详情解除下架与付费限制 (/book/info, /book/infos)
    // ==========================================
    if (/\/book\/infos?/i.test(url)) {
      const bIdMatch = url.match(/[?&]bookIds?=([^&]+)/i);
      const currentBookId = bIdMatch ? decodeURIComponent(bIdMatch[1]) : (data.bookId ? String(data.bookId) : "");
      let stored = {};
      try { stored = JSON.parse(getStorage("weread_shelf_injected_books") || "{}"); } catch (e) {}

      // 服务端返回下架硬阻断报错兜底
      if (data.errcode) {
        delete data.errcode;
        delete data.errmsg;
        const cached = stored[currentBookId] || {};
        data.bookId = currentBookId;
        data.title = cached.title || ("下架书籍 (" + currentBookId + ")");
        data.author = cached.author || "微信读书";
        data.cover = cached.cover || "";
        data.format = cached.format || "epub";
        data.version = 1;
        data.finish = 1;
      }

      if (data.bookId || data.title || currentBookId) {
        data.soldout = 0;
        data.soldoutType = 0;
        data.isPaid = 1;
        data.payType = 0;
        data.payingStatus = 1;
        data.free = 1;
        data.price = 0;
        data.originalPrice = 0;
        data.centPrice = 0;
        data.cpid = 0;
        data.ispub = 1;
        data.maxFreeChapter = 999999;
        if (data.maxFreeInfo && typeof data.maxFreeInfo === 'object') {
          data.maxFreeInfo.maxfreeChapterRatio = 100;
          data.maxFreeInfo.maxfreeChapterIdx = data.lastChapterIdx || 999999;
        }
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功解除书籍详情页下架与付费限制: " + (data.title || currentBookId));

        // 即时落盘完整图书元数据，实现单次刷新立刻在书架常驻呈现
        if (currentBookId) {
          stored[currentBookId] = {
            bookId: currentBookId,
            title: data.title || ("下架书籍 (" + currentBookId + ")"),
            author: data.author || "微信读书",
            cover: data.cover || "",
            format: data.format || "epub",
            version: data.version || 1,
            soldout: 0,
            soldoutType: 0,
            isPaid: 1,
            payType: 0,
            payingStatus: 1,
            free: 1,
            price: 0,
            originalPrice: 0,
            centPrice: 0,
            cpid: 0,
            ispub: 1,
            finish: (data.finish !== undefined) ? data.finish : 1,
            type: 0,
            updateTime: Math.floor(Date.now() / 1000)
          };
          setStorage(JSON.stringify(stored), "weread_shelf_injected_books");
          $.log("[" + SCRIPT_NAME + "] 即时缓存完整图书元数据至书架注入库: " + currentBookId);
        }
      }
    }

    // ==========================================
    // 模块四：阅读进度与详情页副接口 (/book/readinfo)
    // ==========================================
    if (/\/book\/readinfo/i.test(url)) {
      const bIdMatch = url.match(/[?&]bookId=([^&]+)/i);
      const currentBookId = bIdMatch ? decodeURIComponent(bIdMatch[1]) : "";
      let stored = {};
      try { stored = JSON.parse(getStorage("weread_shelf_injected_books") || "{}"); } catch (e) {}

      if (data.errcode) {
        delete data.errcode;
        delete data.errmsg;
      }

      if (!data.bookInfo || typeof data.bookInfo !== "object") {
        const cached = stored[currentBookId] || {};
        data.bookInfo = {
          bookId: currentBookId,
          title: cached.title || "书籍详情",
          soldout: 0,
          soldoutType: 0,
          isPaid: 1,
          free: 1,
          price: 0,
          originalPrice: 0,
          centPrice: 0,
          cpid: 0,
          payType: 0,
          payingStatus: 0,
          maxFreeChapter: 999999
        };
      } else {
        data.bookInfo.soldout = 0;
        data.bookInfo.soldoutType = 0;
        data.bookInfo.isPaid = 1;
        data.bookInfo.free = 1;
        data.bookInfo.price = 0;
        data.bookInfo.originalPrice = 0;
        data.bookInfo.centPrice = 0;
        data.bookInfo.cpid = 0;
        data.bookInfo.payType = 0;
        data.bookInfo.payingStatus = 0;
        data.bookInfo.maxFreeChapter = 999999;
      }
      data.soldout = 0;
      data.isPaid = 1;
      data.readingBook = 1;
      modified = true;
      $.log("[" + SCRIPT_NAME + "] 成功解除 /book/readinfo 下架与权限限制");
    }

    // ==========================================
    // 模块五：付费时间校验伪装 (/book/paytime) 核心解开 isPaiedNormalSoldoutBook
    // ==========================================
    if (/\/book\/paytime/i.test(url)) {
      const payList = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : null));
      if (payList) {
        const nowSec = Math.floor(Date.now() / 1000);
        for (const item of payList) {
          if (item && item.bookId) {
            item.time = item.time > 0 ? item.time : nowSec;
          }
        }
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功伪装 /book/paytime 已购时间戳放行阅读");
      }
    }

    // ==========================================
    // 模块六：章节价格与免费状态解密 (/book/chapterInfos) 根除章节购买冲突
    // ==========================================
    if (/\/book\/chapterInfos/i.test(url)) {
      const chapBooks = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : (Array.isArray(data.books) ? data.books : []));
      for (const book of chapBooks) {
        if (book && typeof book === "object") {
          book.soldOut = 0;
          if (Array.isArray(book.price)) {
            for (const p of book.price) {
              if (p) {
                p.price = 0; // 全章节对齐公版书 0 元免费
              }
            }
          }
          if (Array.isArray(book.updated)) {
            for (const u of book.updated) {
              if (u) {
                u.price = 0;
                u.paid = 1;
              }
            }
          }
        }
      }
      if (data.errcode) {
        delete data.errcode;
        delete data.errmsg;
      }
      modified = true;
      $.log("[" + SCRIPT_NAME + "] 成功解除 /book/chapterInfos 下架与价格限制，全章节放行免费！");
    }

    // ==========================================
    // 模块七：购买接口容错兜底 (/pay/buyChapters) 彻底杜绝 402 -2204 报错
    // ==========================================
    if (/\/pay\/buyChapters/i.test(url)) {
      data = {
        succ: 1,
        balance: 9999,
        purchasedChapters: []
      };
      modified = true;
      $.log("[" + SCRIPT_NAME + "] 成功拦截 /pay/buyChapters 并模拟购买成功放行！");
    }

    if (modified) {
      const newBody = isBase64 ? b64encode(JSON.stringify(data)) : JSON.stringify(data);
      $done({ body: newBody });
      return;
    }

  } catch (err) {
    $.log("[" + SCRIPT_NAME + "] 处理异常: " + (err.message || err));
  }

  $done({});
})();

function Env(name) {
  this.name = name;
  this.log = function() { console.log.apply(console, arguments); };
}

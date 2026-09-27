/*
------------------------------------------
@Description: 微信读书 · 优雅书架 (下架书籍虚拟注入与全鉴权放行)
@Author: TomCatXue
@Version: 1.0.2
@Date: 2026-09-26 17:15
------------------------------------------
核心特性：
  1. 订阅下架书全自动捕获（/subscription/books, /shelf/opus）：
     - 实测攻破：服务端将下架书下发至 offshelfBooks 数组；脚本自动遍历并提取元数据落盘缓存；
  2. 虚拟书架动态注入（/shelf/sync, /shelf/syncbook）：
     - 将捕获的下架书与手动配置的书籍动态注入客户端书架数据，并从 removed 列表中剔除，实现端内书架常驻；
  3. 详情与付费鉴权全链路破除（/book/info, /book/readinfo, /book/paytime）：
     - 改写 /book/info 抹除 soldout/soldoutType 并标记 isPaid=1；
     - 改写 /book/readinfo 嵌套的 bookInfo.soldout 为 0；
     - 关键攻坚：改写 /book/paytime 中 time 为当前时间戳（time > 0），使客户端 isPaiedNormalSoldoutBook 判定为已购；
  4. 加书架交互容错（/shelf/add）：
     - 捕获添加动作并返回 succ=1，保障端内交互闭环。
*/

const SCRIPT_NAME = "微信读书·优雅书架";
const SCRIPT_VERSION = "1.0.2";
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
    const trimmed = $argument.trim();
    // 兼容 Loon 直接传值模式（如 "23665510,490081"）
    if (/^[0-9\s,;|]+$/.test(trimmed)) {
      return trimmed;
    }
    // 兼容 key=val 传参模式
    const match = trimmed.match(new RegExp("(?:^|[&,;\\s])" + argKey + "=([^&,;\\s]+)"));
    if (match) return decodeURIComponent(match[1]);
  }
  return "";
}

(function main() {
  if (typeof $response === "undefined" || !$response.body) {
    $done({});
    return;
  }

  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";

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

    // 针对加入书架接口 /shelf/add：伪造成功响应，并持久化记录该 bookId
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
                  title: "已加入下架书籍 (" + sId + ")",
                  soldout: 0,
                  soldoutType: 0,
                  isPaid: 1,
                  payType: 0
                };
              }
            }
            setStorage(JSON.stringify(stored), "weread_shelf_injected_books");
            $.log("[" + SCRIPT_NAME + "] 从 /shelf/add 捕获新书籍加入注入库: " + addIds.join(","));
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
    // 模块一：订阅接口下架书全自动捕获（核心实证：offshelfBooks）
    // ==========================================
    if (/\/(subscription\/books|shelf\/opus)/i.test(url)) {
      const booksToHarvest = [];
      // 关键实证：微信读书订阅中的下架书籍位于 offshelfBooks 数组！
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
      // 彻底逆转客户端 WRSubscriptionsViewModel 将其判定为 offBooks (待上架/无内容) 的展示逻辑
      if (Array.isArray(data.offshelfBooks) && data.offshelfBooks.length > 0) {
        if (!Array.isArray(data.onshelfBooks)) data.onshelfBooks = [];
        for (const b of data.offshelfBooks) {
          b.soldout = 0;
          b.soldoutType = 0;
          b.isPaid = 1;
          b.payType = 0;
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
      const manualArg = getArgumentValue("inject_book_ids");
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
              finish: 1,
              type: 0,
              updateTime: Math.floor(Date.now() / 1000)
            };
          }
        }
      }

      const injectList = Object.values(storedMap);
      if (injectList.length > 0) {
        for (const targetBook of injectList) {
          const tId = String(targetBook.bookId);
          const existing = data.books.find(b => b && String(b.bookId) === tId);
          if (existing) {
            existing.soldout = 0;
            existing.soldoutType = 0;
            existing.isPaid = 1;
            existing.payType = 0;
          } else {
            data.books.unshift(Object.assign({}, targetBook, {
              soldout: 0,
              soldoutType: 0,
              isPaid: 1,
              payType: 0
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
      if (data.bookId || data.title) {
        data.soldout = 0;
        data.soldoutType = 0;
        data.isPaid = 1;
        data.payType = 0;
        data.free = 1;
        if (data.price !== undefined) data.price = 0;
        data.maxFreeChapter = 999999;
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功解除书籍详情页下架与付费限制: " + (data.title || data.bookId));
      }
    }

    // ==========================================
    // 模块四：阅读进度与详情页副接口 (/book/readinfo)
    // ==========================================
    if (/\/book\/readinfo/i.test(url)) {
      if (data.bookInfo && typeof data.bookInfo === "object") {
        data.bookInfo.soldout = 0;
        data.bookInfo.soldoutType = 0;
        data.bookInfo.isPaid = 1;
        data.bookInfo.free = 1;
        data.bookInfo.payType = 0;
        data.bookInfo.payingStatus = 0;
        data.bookInfo.maxFreeChapter = 999999;
        modified = true;
      }
      if (data.soldout !== undefined) {
        data.soldout = 0;
        data.isPaid = 1;
        modified = true;
      }
      if (modified) {
        $.log("[" + SCRIPT_NAME + "] 成功解除 /book/readinfo 下架状态");
      }
    }

    // ==========================================
    // 模块五：付费时间校验伪装 (/book/paytime) 核心解开 isPaiedNormalSoldoutBook
    // ==========================================
    if (/\/book\/paytime/i.test(url)) {
      if (Array.isArray(data.data)) {
        const nowSec = Math.floor(Date.now() / 1000);
        for (const item of data.data) {
          if (item && item.bookId) {
            item.time = item.time > 0 ? item.time : nowSec;
          }
        }
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功伪装 /book/paytime 已购时间戳放行阅读");
      }
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

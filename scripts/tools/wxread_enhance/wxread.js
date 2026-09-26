/*
------------------------------------------
@Description: 微信读书 · 防强更去广告与下架书增强
@Author: TomCatXue
@Version: 3.9.0
@Date: 2026-09-26 16:30
------------------------------------------
核心功能：
  1. 防强更根治：深度拦截 feature、configsets、reconf、mobileSync 等接口，清空 upgrade/notice，锁定 upgrade_query_interval=2147483647 阻断 App Store 嗅探；
  2. 虚拟书架注入（突破下架限制）：
     - 自动捕获：当用户访问“订阅”或作者主页（/subscription/books, /shelf/opus）时，全自动提取下架书籍元数据落盘缓存；
     - 手动配置：支持在 Loon 插件参数或持久化配置中输入特定下架 bookId；
     - 动态注入：在书架同步接口（/shelf/sync, /shelf/syncbook）中将下架书动态注入为书架在库书籍，从 removed 中剔除；
     - 鉴权解除：拦截 /book/info 与 /book/readinfo，强制抹除 soldout/soldoutType 并标记 isPaid=1，放行本地阅读器；
     - 加书架容错：拦截 /shelf/add 强制响应 succ=1，保障端内添加交互闭环；
  3. 阅读界面极简化：去阅读统计/在读人数（readingStat）、章节评论数字（chapterReview）、读者圈子（readerEntrance）；
  4. 发现流与个人页去广告：清空 discoverfeed 营销卡片、清空 mobileSync 底部小红点与通知、净化 profile 勋章。
*/

const SCRIPT_NAME = "微信读书·防强更与下架书增强";
const SCRIPT_VERSION = "3.9.0";
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
    const match = $argument.match(new RegExp("(?:^|[&,;\\s])" + argKey + "=([^&,;\\s]+)"));
    if (match) return decodeURIComponent(match[1]);
  }
  return "";
}

// 递归深度全量净化函数（消除版本升级、强更弹窗、公告提示）
function deepSanitize(target) {
  if (!target || typeof target !== "object") return false;
  let modified = false;

  const UPGRADE_FLAG_REG = /^(upgrade|force_?upgrade|force_?update|has_?new_?version|need_?upgrade|show_?update|show_?upgrade|is_?upgrade|upgrade_for_tf)/i;
  const NOTICE_TEXT_REG = /(notice|update_?tips|upgrade_?desc|version_?desc|update_?msg)/i;
  const REMOVE_OBJ_REG = /(upgrade_?info|update_?info|new_?version|version_?dialog|update_?dialog|notice_?dialog|popup|announcement)/i;

  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;

    for (const key of Object.keys(obj)) {
      const val = obj[key];

      // 1. 如果是弹窗对象或升级详情结构，直接彻底删除
      if (REMOVE_OBJ_REG.test(key)) {
        delete obj[key];
        modified = true;
        continue;
      }

      // 2. 如果是升级状态标志位，强制置 0 / false
      if (UPGRADE_FLAG_REG.test(key)) {
        if (typeof val === "boolean") obj[key] = false;
        else obj[key] = 0;
        modified = true;
      }

      // 3. 如果是通知/提示文案，置空
      if (NOTICE_TEXT_REG.test(key)) {
        if (typeof val === "string") obj[key] = "";
        else if (typeof val === "number") obj[key] = 0;
        modified = true;
      }

      // 递归子节点
      if (obj[key] && typeof obj[key] === "object") {
        traverse(obj[key]);
      }
    }
  }

  traverse(target);
  return modified;
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

    // 针对阅读器纯净页面的静态响应 Mock
    if (/\/book\/reading[sS]tat/i.test(url)) {
      const cleanResp = {
        friendFinishReadingCount: 0,
        mixReadingUsers: [],
        friendReadingCount: 0,
        friendNotFollowingCount: 0,
        readingUsers: [],
        recommendUsers: [],
        isReading: 0,
        readingCount: 0,
        finishReadingCount: 0,
        todayReadingCount: 0,
        markedStatus: 1
      };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $done({ body: newBody });
      return;
    }

    if (/\/book\/chapterReview/i.test(url)) {
      const cleanResp = { synckey: 0, shareCount: 0 };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $done({ body: newBody });
      return;
    }

    if (/\/groups\/readerEntrance/i.test(url)) {
      const cleanResp = { synckey: Math.floor(Date.now() / 1000), hasGroup: 0 };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $done({ body: newBody });
      return;
    }

    if (/\/review\/list/i.test(url)) {
      const cleanResp = {
        refUsers: [],
        hasMore: 0,
        totalCount: 0,
        removed: [],
        columns: [],
        atUsers: [],
        reviews: []
      };
      const newBody = isBase64 ? b64encode(JSON.stringify(cleanResp)) : JSON.stringify(cleanResp);
      $done({ body: newBody });
      return;
    }

    // 针对加入书架接口 /shelf/add：直接伪造成功响应，并在本地记录该 bookId
    if (/\/shelf\/add/i.test(url)) {
      try {
        let reqBodyStr = (typeof $request !== "undefined" && $request.body) ? $request.body : "";
        if (reqBodyStr) {
          try { reqBodyStr = b64decode(reqBodyStr); } catch (e) {}
          const reqJson = JSON.parse(reqBodyStr);
          const addIds = reqJson.bookIds || (reqJson.bookId ? [reqJson.bookId] : []);
          if (Array.isArray(addIds) && addIds.length > 0) {
            let stored = {};
            try { stored = JSON.parse(getStorage("weread_injected_books") || "{}"); } catch (e) {}
            for (const bId of addIds) {
              if (bId) {
                stored[String(bId)] = stored[String(bId)] || { bookId: String(bId), title: "已加入下架书籍", soldout: 0, isPaid: 1 };
              }
            }
            setStorage(JSON.stringify(stored), "weread_injected_books");
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
    // 模块一：下架书籍全自动捕获（订阅接口 / 专栏作品）
    // ==========================================
    if (/\/(subscription\/books|shelf\/opus)/i.test(url)) {
      const booksToHarvest = [];
      if (Array.isArray(data.books)) booksToHarvest.push(...data.books);
      if (Array.isArray(data.items)) booksToHarvest.push(...data.items);
      if (Array.isArray(data.opus)) booksToHarvest.push(...data.opus);
      if (data.data && Array.isArray(data.data.books)) booksToHarvest.push(...data.data.books);

      if (booksToHarvest.length > 0) {
        let stored = {};
        try { stored = JSON.parse(getStorage("weread_injected_books") || "{}"); } catch (e) {}
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
          setStorage(JSON.stringify(stored), "weread_injected_books");
          $.log("[" + SCRIPT_NAME + "] 从订阅接口自动捕获并落盘 " + newCount + " 本书籍！");
        }
      }
    }

    // ==========================================
    // 模块二：虚拟书架注入 (/shelf/sync, /shelf/syncbook)
    // ==========================================
    if (/\/shelf\/(sync|syncbook)/i.test(url)) {
      if (!Array.isArray(data.books)) {
        data.books = [];
      }

      // 汇总需要注入的所有书籍元数据
      let storedMap = {};
      try { storedMap = JSON.parse(getStorage("weread_injected_books") || "{}"); } catch (e) {}

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
          // 从 removed 列表中移除该书，阻止本地删除
          if (Array.isArray(data.removed)) {
            data.removed = data.removed.filter(id => String(id) !== tId);
          }
        }
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功向书架接口注入 " + injectList.length + " 本下架/订阅书籍！");
      }
    }

    // ==========================================
    // 模块三：书籍详情与鉴权解除 (/book/info, /book/readinfo)
    // ==========================================
    if (/\/book\/(info|infos|readinfo)/i.test(url)) {
      if (data.bookId || data.title) {
        data.soldout = 0;
        data.soldoutType = 0;
        data.isPaid = 1;
        data.payType = 0;
        data.free = 1;
        if (data.price !== undefined) data.price = 0;
        data.maxFreeChapter = 999999;
        modified = true;
        $.log("[" + SCRIPT_NAME + "] 成功解除详情页下架与付费限制: " + (data.title || data.bookId));
      }
    }

    // ==========================================
    // 模块四：发现页信息流精简与广告过滤 (discoverfeed)
    // ==========================================
    if (/\/discoverfeed\/new/i.test(url)) {
      if (Array.isArray(data.data)) {
        data.data = data.data.filter(item => item && item.type !== 2);
        modified = true;
      }
    } else if (/\/discoverfeed\/get/i.test(url)) {
      if (Array.isArray(data.removed)) {
        data.removed.push("63", "dailybooklist");
        data.updated = 1;
        modified = true;
      }
      if (Array.isArray(data.updatedNewRawItemIds)) {
        data.updatedNewRawItemIds = data.updatedNewRawItemIds.filter(item => item === "26");
        modified = true;
      }
      if (Array.isArray(data.items)) {
        data.items = data.items.filter(item => item && item.rawItemId === 26);
        modified = true;
      }
    }

    // ==========================================
    // 模块五：用户个人主页净化 (user/profile) 去勋章与未读红点
    // ==========================================
    if (/\/user\/profile/i.test(url)) {
      data.showMedal = 0;
      data.showReview = 0;
      data.canExchangeDay = 0;
      data.exchangeMsg = "";
      modified = true;
    }

    // ==========================================
    // 模块六：移动端同步接口净化 (mobileSync) 去除红点、发现页红点、通知计数
    // ==========================================
    if (/\/mobileSync/i.test(url)) {
      data.discover = false;
      data.discoverFeed = 0;
      data.browseUpdate = 0;
      data.notifCount = 0;
      data.storyfeed = 0;
      data.storyfeedUpdated = 0;
      data.readingExchange = 0;
      data.friendReviewUpdate = 0;
      modified = true;
    }

    // ==========================================
    // 模块七：递归深度全量净化（抹除升级标志、弹窗与公告）
    // ==========================================
    if (deepSanitize(data)) {
      modified = true;
    }

    // ==========================================
    // 模块八：锁定 feature 和 configsets 配置（彻底阻断更新检测）
    // ==========================================
    const targetConfigs = [data.feature, data.configsets].filter(o => o && typeof o === "object");
    for (const cfg of targetConfigs) {
      cfg.VIPRightTimerSeconds = 8640000;
      cfg.disableUpgrade = 1;
      cfg.closeUpgrade = 1;
      cfg.upgrade = 0;
      cfg.upgrade_for_tf = 0;
      // 根因修复：WeRead 汇编 (0x100a9d10c) 判定 upgrade_query_interval <= 0 时会默认回退为 86400 秒 (24小时)
      // 随后必向 itunes.apple.com/lookup 嗅探新版导致弹窗。此处设为极大值 (2147483647) 彻底阻断触发！
      cfg.upgrade_query_interval = 2147483647;
      cfg.upgrade_seconds_to_notify = 2147483647;
      cfg.notice_type = 0;
      cfg.notice_interval = 0;
      cfg.notice_title = "";
      cfg.notice_msg = "";
    }
    if (targetConfigs.length > 0) {
      modified = true;
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

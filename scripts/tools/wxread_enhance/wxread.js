/*
------------------------------------------
@Description: 微信读书 · 防强更与去广告精简净化 
@Author: TomCatXue
@Version: 4.0.0
@Date: 2026-09-27 11:00
------------------------------------------
架构特色：
  1. 动静彻底解耦：静态广告（reader/tips, market/banner）全部移交 Loon 内核 [URL Rewrite] reject-dict 处理，0 脚本执行；
  2. 极简执行时机：仅在冷启动时拦截 feature/configsets/reconf 1 次，锁定 upgrade_query_interval=2147483647 阻断 App Store 嗅探；
  3. 彻底释放阅读性能：完全剔除 readingStat、chapterReview、review/list 等高频翻页交互，日常阅读 0 脚本执行，达到极致丝滑；
  4. 发现页与个人页净化：按需过滤 discoverfeed 营销卡片、清空 mobileSync 底部小红点、净化 profile 勋章。
*/

const SCRIPT_NAME = "微信读书·防强更去广告";
const SCRIPT_VERSION = "4.0.0";
const $ = new Env(SCRIPT_NAME);

function b64encode(str) {
  if (typeof $base64 !== "undefined" && $base64.encode) return $base64.encode(str);
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
  } catch (e) { }
  try {
    if (typeof btoa !== "undefined") return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode("0x" + p1)));
  } catch (e) { }
  return str;
}

function b64decode(str) {
  if (!str) return str;
  try {
    if (typeof $base64 !== "undefined" && $base64.decode) return $base64.decode(str);
  } catch (e) { }
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
  } catch (e) { }
  try {
    if (typeof atob !== "undefined") return decodeURIComponent(atob(str).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
  } catch (e) { }
  return str;
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

    // 尝试解析为 JSON (支持明文与 Base64)
    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      try {
        const decoded = b64decode(rawBody);
        data = JSON.parse(decoded);
        isBase64 = true;
      } catch (e2) { }
    }

    if (!data || typeof data !== "object") {
      $done({});
      return;
    }

    let modified = false;

    // 1. 发现页信息流精简与广告过滤 (仅在浏览发现页时触发)
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

    // 2. 用户个人主页净化 (user/profile) 去勋章与未读红点 (仅在进入个人页时触发)
    if (/\/user\/profile/i.test(url)) {
      data.showMedal = 0;
      data.showReview = 0;
      data.canExchangeDay = 0;
      data.exchangeMsg = "";
      modified = true;
    }

    // 3. 移动端增量心跳净化 (mobileSync) 去除红点、发现页红点、通知计数
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

    // 4. 深度遍历全量净化（抹除升级标志、弹窗与公告）
    if (deepSanitize(data)) {
      modified = true;
    }

    // 5. 核心锁定：feature 和 configsets 配置（冷启动仅调用 1 次，彻底阻断更新检测）
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
  this.log = function () { console.log.apply(console, arguments); };
}

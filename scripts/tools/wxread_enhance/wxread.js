/*
------------------------------------------
@Description: 微信读书 · 防强更与极简初始化 (进软件仅调用 1 次)
@Author: TomCatXue
@Version: 4.1.0
@Date: 2026-09-27 12:00
------------------------------------------
核心设计（单次触发模式）：
  1. 进软件仅触发 1 次：仅拦截冷启动初始化接口 (feature, config, reconf, app/upgrade)，日常阅读/翻页/切后台 0 脚本执行；
  2. 彻底防强更：锁定 upgrade_query_interval=2147483647 阻断 App Store 嗅探，清除全部升级弹窗与公告；
  3. 释放试听倒计时：锁定 VIPRightTimerSeconds=8640000 消除潜在试听限时；
  4. 静态去广告全交由 Loon [Rule] 与 [URL Rewrite] reject-dict 内核处理，零 JS 开销。
*/

const SCRIPT_NAME = "微信读书·极简初始化";
const SCRIPT_VERSION = "4.1.0";
const $ = new Env(SCRIPT_NAME);

function b64encode(str) {
  if (typeof $base64 !== "undefined" && $base64.encode) return $base64.encode(str);
  try { if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64"); } catch (e) {}
  return str;
}

function b64decode(str) {
  if (!str) return str;
  try { if (typeof $base64 !== "undefined" && $base64.decode) return $base64.decode(str); } catch (e) {}
  try { if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8"); } catch (e) {}
  return str;
}

// 递归深度全量净化函数（消除版本升级、强更弹窗、公告提示）
function deepSanitize(target) {
  if (!target || typeof target !== "object") return false;
  let modified = false;

  const REMOVE_KEYS = /(upgrade_?info|update_?dialog|popup|announcement)/i;
  const FLAG_KEYS = /^(upgrade|force_?update|has_?new_?version|is_?upgrade|upgrade_for_tf)/i;
  const TEXT_KEYS = /(notice_?msg|update_?tips|version_?desc)/i;

  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;
    for (const key of Object.keys(obj)) {
      if (REMOVE_KEYS.test(key)) { delete obj[key]; modified = true; continue; }
      if (FLAG_KEYS.test(key)) { obj[key] = (typeof obj[key] === "boolean") ? false : 0; modified = true; }
      if (TEXT_KEYS.test(key)) { obj[key] = (typeof obj[key] === "string") ? "" : 0; modified = true; }
      if (obj[key] && typeof obj[key] === "object") traverse(obj[key]);
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

    if (deepSanitize(data)) {
      modified = true;
    }

    // 核心锁定：feature, configsets, reconf 全局初始化节点
    const targetConfigs = [data.feature, data.configsets, data.reconf].filter(o => o && typeof o === "object");
    for (const cfg of targetConfigs) {
      cfg.VIPRightTimerSeconds = 8640000;
      cfg.disableUpgrade = 1;
      cfg.closeUpgrade = 1;
      cfg.upgrade = 0;
      cfg.upgrade_for_tf = 0;
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

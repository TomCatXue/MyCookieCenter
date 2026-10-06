/*
------------------------------------------
@Description: 微信读书 · 防强更与去广告净化 (极简纯净版)
@Author: TomCatXue
@Version: 4.2.1
@Date: 2026-10-03 10:00
------------------------------------------
核心功能清单：
  1. 屏蔽发现流「新福利场」：过滤发现页年卡营销、特惠促销等商业推广卡片；
  2. 彻底阻断版本强更：锁定 upgrade_query_interval=2147483647 (68年) 彻底阻断 App Store 嗅探，消除所有升级弹窗与系统公告；
  3. 释放试听时长限制：锁定 VIPRightTimerSeconds=8640000 消除试听倒计时；
  4. 静态秒拒零开销：阅读器底部浮层 (Tips)、书城横幅 (Banner) 由 Loon 内核直接秒拒；
  5. 阻断隐私与性能监控：拦截腾讯 APM 性能监控与 CLS 日志上报通道。
*/

const SCRIPT_NAME = "微信读书·极简去广告";
const SCRIPT_VERSION = "4.2.1";
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

    // 净化发现流卡片列表 (如 /discoverfeed/new 中 type: 13 的「新福利场」年卡营销)
    const cardList = Array.isArray(data.data) ? data.data : (Array.isArray(data.items) ? data.items : null);
    if (cardList) {
      const originalLen = cardList.length;
      const filtered = cardList.filter(item => {
        if (!item || typeof item !== "object") return true;
        // 过滤福利场卡片 (type: 13 或 名称包含福利场/福利)
        if (item.type === 13) return false;
        if (typeof item.name === "string" && (item.name.includes("福利场") || item.name.includes("福利"))) return false;
        // 过滤年卡等商业推广项 (如 annual_card)
        if (item.content && item.content.items && Array.isArray(item.content.items)) {
          const isPromo = item.content.items.some(subGroup =>
            subGroup && Array.isArray(subGroup.items) && subGroup.items.some(sub => sub && sub.type === "annual_card")
          );
          if (isPromo) return false;
        }
        return true;
      });

      if (filtered.length !== originalLen) {
        if (Array.isArray(data.data)) data.data = filtered;
        if (Array.isArray(data.items)) data.items = filtered;
        modified = true;
      }
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

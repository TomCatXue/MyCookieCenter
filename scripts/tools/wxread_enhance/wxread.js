/*
------------------------------------------
@Description: 微信读书 · 防强更与全弹窗净化
@Author: TomCatXue
@Version: 3.5.0
@Date: 2026-09-17 12:30
------------------------------------------
功能：
  1. 深度拦截 i.weread.qq.com 与 weread.qq.com 下的 feature、config、reconf、upgrade 等接口
  2. 采用通用正则递归深度遍历算法，清空与消除所有 upgrade、forceUpdate、notice、updateInfo 等弹窗字段
  3. 彻底屏蔽 8.2.6 等老版本微信读书的“发现新版本”弹窗、版本强更公告与青少年弹窗
  4. 锁定老版本纯净无广告、永久免费 AI 听书体验
*/

const $ = new Env("微信读书·防强更");

function b64encode(str) {
  if (typeof $base64 !== "undefined") return $base64.encode(str);
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
  } catch (e) {}
  return str;
}

function b64decode(str) {
  if (!str) return str;
  try {
    if (typeof $base64 !== "undefined") return $base64.decode(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
  } catch (e) {}
  return str;
}

// 递归深度全量净化函数
function deepSanitize(target) {
  if (!target || typeof target !== 'object') return false;
  let modified = false;

  const UPGRADE_FLAG_REG = /^(upgrade|force_?upgrade|force_?update|has_?new_?version|need_?upgrade|show_?update|show_?upgrade|is_?upgrade)/i;
  const NOTICE_TEXT_REG = /(notice|update_?tips|upgrade_?desc|version_?desc|update_?msg)/i;
  const REMOVE_OBJ_REG = /(upgrade_?info|update_?info|new_?version|version_?dialog|update_?dialog|notice_?dialog|popup|announcement)/i;

  function traverse(obj) {
    if (!obj || typeof obj !== 'object') return;

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
        if (typeof val === 'boolean') obj[key] = false;
        else obj[key] = 0;
        modified = true;
      }

      // 3. 如果是通知/提示文案，置空
      if (NOTICE_TEXT_REG.test(key)) {
        if (typeof val === 'string') obj[key] = '';
        else if (typeof val === 'number') obj[key] = 0;
        modified = true;
      }

      // 递归子节点
      if (obj[key] && typeof obj[key] === 'object') {
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

    if (!data || typeof data !== "object") {
      $done({});
      return;
    }

    // 2. 深度遍历全量净化
    const modified = deepSanitize(data);

    // 3. 针对 feature 特性节点做特别锁定
    if (data.feature && typeof data.feature === "object") {
      data.feature.VIPRightTimerSeconds = 8640000;
      data.feature.disableUpgrade = 1;
      data.feature.closeUpgrade = 1;
    }

    if (modified || data.feature) {
      const newBody = isBase64 ? b64encode(JSON.stringify(data)) : JSON.stringify(data);
      $.log(`[微信读书·防强更] 成功拦截并全面净化升级弹窗配置! url=${url.slice(0, 60)}`);
      $done({ body: newBody });
      return;
    }

  } catch (err) {
    $.log(`[微信读书·防强更] 净化处理异常: ${err.message || err}`);
  }

  $done({});
})();

function Env(name) {
  this.name = name;
  this.log = function() { console.log.apply(console, arguments); };
}

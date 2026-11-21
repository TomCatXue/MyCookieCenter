/*
------------------------------------------
@Name: 西窗烛 · 会员解锁
@Author: TomCatXue (整合) / ddgksf2013 (原作) / Cuttlefish 墨鱼手记 (原始思路)
@Version: 1.0.0
@Date: 2026-11-21 14:10
@Desc: 将 lchttpapi.xczim.com 响应体中的 "Membership":false 改写为 "Membership":true，
       使客户端本地鉴权分支判定为会员，解锁西窗烛会员功能。
@Source: 上游原脚本 https://raw.githubusercontent.com/deezertidal/private/master/js-backup/Crack/xcz.js
         （该文件与 master 分支已于 2026-09-24 提交 40b7b98c 中删除，现为 404）
@Note: 仅改写客户端本地判定字段；诗词库、AI 创作等真实服务端资源仍按接口实际返回。
------------------------------------------
*/

const SCRIPT_NAME = "西窗烛·会员解锁";
const SCRIPT_VERSION = "1.0.0";

// 平台配置
// Loon:     http-response https://lchttpapi.xczim.com/* requires-body=1,script-path=...
// Surge:    http-response https://lchttpapi.xczim.com/* requires-body=1,script-path=...
// Quantumult X: https://lchttpapi.xczim.com/* url script-response-body ...
// Stash:    http-response https://lchttpapi.xczim.com/* requires-body=true,script-path=...

const MEMBERSHIP_PATTERN = /Membership"\s*:\s*false/g;
const MEMBERSHIP_REPLACED = 'Membership":true';

function log(msg) {
  try {
    console.log("[" + SCRIPT_NAME + "] " + msg);
  } catch (e) {}
}

(function main() {
  try {
    if (typeof $response === "undefined" || !$response || !$response.body) {
      log("无响应体，原样放行");
      $done({});
      return;
    }

    const body = $response.body;

    // 兼容二进制/非文本响应：不含目标关键字直接放行，避免无谓的 JSON 处理
    if (typeof body !== "string" || body.indexOf("Membership") === -1) {
      $done({});
      return;
    }

    let patched = "";
    try {
      patched = body.replace(MEMBERSHIP_PATTERN, MEMBERSHIP_REPLACED);
    } catch (e) {
      log("正则替换异常：" + e);
      $done({});
      return;
    }

    if (patched === body) {
      // 没有命中 false 分支：可能已是会员，或接口结构已变
      log("未命中 Membership:false（已是会员或字段结构变更）");
      $done({});
      return;
    }

    // 校验改写后仍是合法 JSON，防止破坏客户端解析
    try {
      JSON.parse(patched);
    } catch (e) {
      log("改写后非合法 JSON，放弃改写并原样放行");
      $done({});
      return;
    }

    log("Membership 已置为 true");
    $done({ body: patched });
  } catch (e) {
    log("脚本异常，原样放行：" + e);
    $done({});
  }
})();

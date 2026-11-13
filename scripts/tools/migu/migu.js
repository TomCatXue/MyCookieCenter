/*
------------------------------------------
@Name: 咪咕音乐 · 去广告权益
@Author: TomCatXue
@Version: 1.0.0
@Date: 2026-11-13 13:01
@Desc: 仅将客户端本地判断的 no_ads（去广告）权益置为 true，用于配合插件关闭开屏与营销广告。
说明：曲库、演唱会、专区、视频 1080P 等真实版权内容由服务端按账号真实会员态校验
      （播放入口 strategy/listen-url/v3.4 返回服务端签发密文），本脚本不伪造会员身份与有效期。
------------------------------------------
*/

const SCRIPT_NAME = "咪咕音乐·去广告";
const SCRIPT_VERSION = "1.0.0";

function log(msg) {
  try { console.log("[" + SCRIPT_NAME + "] " + msg); } catch (e) {}
}

(function main() {
  if (typeof $response === "undefined" || !$response.body) {
    $done({});
    return;
  }

  const url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";

  try {
    const obj = JSON.parse($response.body);
    if (!obj || typeof obj !== "object") {
      $done({});
      return;
    }

    let modified = false;

    if (url.indexOf("/member/api/rights/user/have/") !== -1) {
      const items = obj.data && obj.data.hasMemberRightsItems;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item && typeof item === "object" && item.rightsAlias === "no_ads") {
            item.hasRights = true;
            modified = true;
          }
        }
      }
    }

    if (modified) {
      $done({ body: JSON.stringify(obj) });
    } else {
      $done({});
    }
  } catch (err) {
    log("处理异常: " + (err && err.message ? err.message : err));
    $done({});
  }
})();

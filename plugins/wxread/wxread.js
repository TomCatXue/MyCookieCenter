/*
------------------------------------------
@Description: 微信读书 · 防强更与特性净化
@Author: TomCatXue
@OriginalAuthor: 水君 (原入架方案因上游云端强校验已下线，转型专职防强更净化)
------------------------------------------
功能：
  1. 拦截 i.weread.qq.com/feature 响应体，将 upgrade、notice_type、notice_msg 置零
  2. 彻底屏蔽 8.2.6 等老版本微信读书的“发现新版本”弹窗与强更阻断
  3. 锁定老版本纯净无广告、永久免费 AI 听书体验
*/

console.log("[微信读书·防强更] 脚本已加载，准备拦截处理...");

const $ = new Env("微信读书·防强更");

function b64encode(str) {
    if (typeof $base64 !== "undefined") return $base64.encode(str);
    try {
        if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
    } catch (e) { }
    return str;
}

function b64decode(str) {
    if (!str) return str;
    try {
        if (typeof $base64 !== "undefined") return $base64.decode(str);
        if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
    } catch (e) { }
    return str;
}

(function main() {
    if (typeof $response === "undefined" || !$response.body) {
        $done({});
        return;
    }

    let url = (typeof $request !== "undefined" && $request.url) ? $request.url : "";
    if (url.indexOf("/feature") !== -1) {
        try {
            let rawBody = $response.body;
            let decoded = b64decode(rawBody);
            let data = JSON.parse(decoded);

            if (data && data.feature) {
                // 彻底关闭新版本检测与更新公告
                data.feature.upgrade = 0;
                data.feature.notice_type = 0;
                data.feature.notice_msg = "";
                data.feature.notice_title = "";
                data.feature.showTeenModeAlert = 0;
                // 消除潜在特性计时
                data.feature.VIPRightTimerSeconds = 8640000;

                let newBody = b64encode(JSON.stringify(data));
                $.log("[WeRead] 成功改写 feature 配置：已彻底屏蔽版本更新弹窗与公告！");
                $done({ body: newBody });
                return;
            }
        } catch (e) {
            $.log("[WeRead] feature 改写异常: " + String(e));
        }
    }

    $done({});
})();

function Env(name) {
    this.name = name;
    this.log = function () { console.log.apply(console, arguments); };
}

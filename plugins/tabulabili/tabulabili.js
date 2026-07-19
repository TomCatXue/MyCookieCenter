/**
 * 初见哔哩 (TabulaBili) · 首页推荐流 Cookie 剥离
 *
 * 功能：拦截 B 站首页推荐接口，删除请求头中的 Cookie 字段，
 *       让后端识别为"全新匿名访客"，下发大盘默认热门流，打破信息茧房。
 * 作用域：仅首页推荐流（rcmd）接口，不影响视频播放页 / playurl / 用户中心等。
 *
 * @Author: wangdaodao <https://github.com/wangdaodaodao/TabulaBili> (原 Chrome MV3 扩展作者)
 * @Adapter: MyCookieCenter <https://github.com/TomCatXue/MyCookieCenter>
 * @License: MIT
 * @Updated: 2026-07-19
 *
 * ===== Loon =====
 * [MITM] hostname = api.bilibili.com
 * [Script]
 * http-request ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd tag=初见哔哩净化, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js, requires-body=false, enable=true
 *
 * ===== Surge =====
 * [MITM] hostname = api.bilibili.com
 * [Script]
 * 初见哔哩净化 = type=http-request,pattern=^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *
 * ===== Quantumult X =====
 * [MITM] hostname = api.bilibili.com
 * [rewrite_local]
 * ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *
 * ===== Stash =====
 * [MITM] hostname = api.bilibili.com
 * http:
 *   script:
 *     - match: ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd
 *       name: 初见哔哩净化
 *       type: request
 *       require-body: false
 * script-providers:
 *   初见哔哩净化:
 *     url: https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *     interval: 86400
 */

const SCRIPT_VERSION = "2026-07-19.r1";
const MATCH_RE = /\/x\/web-interface.*index\/top.*rcmd/i;

/**
 * 入口：剥离请求头中的 Cookie（不区分大小写）。
 *
 * 兼容 Loon / Surge / Stash / Quantumult X：
 * - $request.headers 是对象，键大小写不固定
 * - $done({ headers }) 用新对象替换请求头
 */
function purifyHeaders() {
    const url = (typeof $request !== "undefined" && $request.url) || "";
    const headers = (typeof $request !== "undefined" && $request.headers) || {};

    // 双重保险：URL 正则已匹配，这里再校验一次避免误伤
    if (!MATCH_RE.test(url)) {
        $done({});
        return;
    }

    const cleaned = {};
    let removed = false;
    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            if (key && key.toLowerCase() === "cookie") {
                removed = true;
                continue; // 丢弃 Cookie 字段
            }
            cleaned[key] = headers[key];
        }
    }

    if (removed) {
        console.log(`[TabulaBili] 已剥离 Cookie → ${url.slice(0, 120)}`);
    }
    $done({ headers: cleaned });
}

purifyHeaders();

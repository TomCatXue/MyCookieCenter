/**
 * 初见哔哩 (TabulaBili) · B 站推荐流 Cookie 剥离
 *
 * 功能：
 *   - Web 端：拦截首页推荐接口，删除整条 Cookie 字段，
 *            让后端识别为"全新匿名访客"，下发大盘默认热门流。
 *   - App 端：拦截推荐流接口，从 Cookie 中删除 buvid3（用户画像标识），
 *            保留 SESSDATA/bili_jct，维持登录态，降低推荐精准度。
 *
 * 作用域：仅首页推荐流（rcmd / timeline）接口，不影响视频播放页 / playurl / 用户中心等。
 *
 * @Author: wangdaodaodao <https://github.com/wangdaodaodao/TabulaBili> (原 Chrome MV3 扩展作者)
 * @Adapter: MyCookieCenter <https://github.com/TomCatXue/MyCookieCenter>
 * @License: MIT
 * @Updated: 2026-07-19
 *
 * ===== Loon =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * [Script]
 * http-request ^https?:\/\/(api|app)\.bilibili\.com\/x\/.*\/rcmd.* tag=初见哔哩净化, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js, requires-body=false, enable=true
 * http-request ^https?:\/\/(api|app)\.bilibili\.com\/x\/v2\/feed\/timeline tag=初见哔哩净化, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js, requires-body=false, enable=true
 *
 * ===== Surge =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * [Script]
 * 初见哔哩净化-Web = type=http-request,pattern=^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 * 初见哔哩净化-App = type=http-request,pattern=^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/timeline,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *
 * ===== Quantumult X =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * [rewrite_local]
 * ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 * ^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/timeline url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *
 * ===== Stash =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * http:
 *   script:
 *     - match: ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd
 *       name: 初见哔哩净化-Web
 *       type: request
 *       require-body: false
 *     - match: ^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/timeline
 *       name: 初见哔哩净化-App
 *       type: request
 *       require-body: false
 * script-providers:
 *   初见哔哩净化:
 *     url: https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *     interval: 86400
 */

const SCRIPT_VERSION = "2026-07-19.r2";

// Web 端：api.bilibili.com 的首页推荐流接口
const WEB_RCMD_RE = /api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd/i;

// App 端：app.bilibili.com 的首页推荐流接口
const APP_TIMELINE_RE = /app\.bilibili\.com\/x\/v2\/feed\/timeline/i;

// 综合匹配：Web rcmd 或 App timeline
const MATCH_RE = /((api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd)|(app\.bilibili\.com\/x\/v2\/feed\/timeline))/i;

/**
 * 入口：剥离请求头中的 Cookie。
 *
 * 策略：
 *   - Web 端（api.bilibili.com）：整条删除 Cookie，下发匿名热门流。
 *   - App 端（app.bilibili.com）：仅从 Cookie 中删除 buvid3，
 *     保留 SESSDATA 维持登录态，降低推荐精准度。
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

    const cookieKey = Object.keys(headers).find(k => k && k.toLowerCase() === "cookie");
    if (!cookieKey) {
        // 没有 Cookie 字段，直接放行
        $done({});
        return;
    }

    const cleaned = {};
    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            if (key === cookieKey) {
                // 命中 Cookie，按端选择处理策略
                if (WEB_RCMD_RE.test(url)) {
                    // Web 端：整条删除
                    continue;
                }
                if (APP_TIMELINE_RE.test(url)) {
                    // App 端：只删 buvid3
                    const newCookie = removeBuvid3(headers[cookieKey]);
                    if (newCookie) {
                        cleaned[key] = newCookie;
                    }
                    console.log(`[TabulaBili] App端已剥离buvid3 → ${url.slice(0, 120)}`);
                    continue;
                }
            }
            cleaned[key] = headers[key];
        }
    }

    if (WEB_RCMD_RE.test(url)) {
        console.log(`[TabulaBili] Web端已剥离Cookie → ${url.slice(0, 120)}`);
    }
    $done({ headers: cleaned });
}

/**
 * 从 Cookie 字符串中移除 buvid3，保留其他字段。
 * 处理分号分隔的多字段 Cookie。
 */
function removeBuvid3(cookie) {
    if (!cookie) return "";
    return cookie
        .split(";")
        .map(c => c.trim())
        .filter(c => !/^\s*buvid3\s*=/i.test(c))
        .join("; ");
}

purifyHeaders();

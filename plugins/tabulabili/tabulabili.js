/**
 * 初见哔哩 (TabulaBili) · B 站推荐流 Cookie 剥离
 *
 * 功能：
 *   - Web 端：拦截首页推荐接口，删除整条 Cookie 字段，
 *            让后端识别为"全新匿名访客"，下发大盘默认热门流。
 *   - App 端：拦截推荐流接口，同时删除：
 *       1. 整条 Cookie（包括 SESSDATA / DedeUserID 等）
 *       2. x-bili-mid 请求头（暴露用户 mid）
 *       3. x-bili-ticket 请求头（JWT，内含 buvid）
 *       4. buvid 请求头
 *      效果：后端无法识别用户身份，返回匿名热门/默认内容。
 *
 * 策略说明（v4）：
 *   早期版本只删除 buvid 系字段但保留 SESSDATA/DedeUserID，
 *   测试证明后台仍可通过 SESSDATA 识别用户，推荐内容变化不明显。
 *   v4 改为整条删除 Cookie（与 Web 端一致），效果立竿见影。
 *
 * 作用域：仅首页推荐流接口，不影响视频播放页 / playurl / 用户中心等。
 *
 * @Author: wangdaodaodao <https://github.com/wangdaodaodao/TabulaBili> (原 Chrome MV3 扩展作者)
 * @Adapter: MyCookieCenter <https://github.com/TomCatXue/MyCookieCenter>
 * @License: MIT
 * @Updated: 2026-07-19
 *
 * ===== Loon =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * [Script]
 * http-request ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd tag=初见哔哩净化, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js, requires-body=false, enable=true
 * http-request ^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/index tag=初见哔哩净化, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js, requires-body=false, enable=true
 *
 * ===== Surge =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * [Script]
 * 初见哔哩净化-Web = type=http-request,pattern=^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 * 初见哔哩净化-App = type=http-request,pattern=^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/index,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *
 * ===== Quantumult X =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * [rewrite_local]
 * ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 * ^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/index url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *
 * ===== Stash =====
 * [MITM] hostname = api.bilibili.com, app.bilibili.com
 * http:
 *   script:
 *     - match: ^https?:\/\/api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd
 *       name: 初见哔哩净化-Web
 *       type: request
 *       require-body: false
 *     - match: ^https?:\/\/app\.bilibili\.com\/x\/v2\/feed\/index
 *       name: 初见哔哩净化-App
 *       type: request
 *       require-body: false
 * script-providers:
 *   初见哔哩净化:
 *     url: https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/tabulabili/tabulabili.js
 *     interval: 86400
 */

const SCRIPT_VERSION = "2026-07-19.r4";

// Web 端：api.bilibili.com 的首页推荐流接口
const WEB_RCMD_RE = /api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd/i;

// App 端：app.bilibili.com 的首页推荐流接口（抓包确认是 /x/v2/feed/index）
const APP_FEED_RE = /app\.bilibili\.com\/x\/v2\/feed\/index/i;

// 综合匹配：Web rcmd 或 App feed
const MATCH_RE = /((api\.bilibili\.com\/x\/web-interface.*index\/top.*rcmd)|(app\.bilibili\.com\/x\/v2\/feed\/index))/i;

// App 端需要同时删除的用户画像标识（HTTP 头名称，小写）
const APP_DELETE_HEADERS = ["x-bili-mid", "x-bili-ticket", "buvid"];

// App 端 Cookie 中需要删除的用户画像字段（正则匹配）
const APP_DELETE_COOKIE_FIELDS = [/buvid3/i, /^buvid$/i, /buvid_fp/i];

/**
 * 入口：剥离请求头中的用户画像标识。
 *
 * 策略：
 *   - Web 端（api.bilibili.com）：整条删除 Cookie，下发匿名热门流。
 *   - App 端（app.bilibili.com）：整条删除 Cookie + 删除画像请求头，
 *      后端无法识别用户身份，返回匿名内容。
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
    let webRemoved = false;
    let appRemoved = 0;

    for (const key in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, key)) {
            const keyLower = key.toLowerCase();

            // Web 端：整条删除 Cookie
            if (WEB_RCMD_RE.test(url) && keyLower === "cookie") {
                webRemoved = true;
                continue;
            }

            // App 端：整条删除 Cookie，后端无法识别用户
            if (APP_FEED_RE.test(url) && keyLower === "cookie") {
                appRemoved++;
                continue;
            }

            // App 端：删除指定的画像请求头
            if (APP_FEED_RE.test(url) && APP_DELETE_HEADERS.includes(keyLower)) {
                appRemoved++;
                continue;
            }

            // 其他所有头原样保留
            cleaned[key] = headers[key];
        }
    }

    if (webRemoved) {
        console.log(`[TabulaBili] Web端已剥离整条Cookie → ${url.slice(0, 120)}`);
    }
    if (appRemoved > 0) {
        console.log(`[TabulaBili] App端已剥离${appRemoved}项（Cookie + x-bili-mid + x-bili-ticket + buvid）→ ${url.slice(0, 120)}`);
    }
    $done({ headers: cleaned });
}

/**
 * 从 Cookie 中移除 App 端的用户画像字段。
 * 处理分号分隔的多字段 Cookie，删除 buvid3 / Buvid / buvid_fp。
 * ⚠️ 已弃用：App 端现采用整条删除 Cookie 策略，效果更明显。
 * 保留此函数以兼容可能的后续策略调整。
 */
function removeAppBuvidFields(cookie) {
    if (!cookie) return "";
    return cookie
        .split(";")
        .map(c => c.trim())
        .filter(c => !APP_DELETE_COOKIE_FIELDS.some(re => re.test(c)))
        .join("; ");
}

purifyHeaders();

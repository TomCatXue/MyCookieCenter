/**
 * t.me / telegram.me / telegram.dog 外部链接高精度重定向至 Telegram 官方或第三方客户端
 * 
 * 原作者: chaoscard, sooyaaabo, Repcz
 * 深度重构与补全: TomCatXue (https://github.com/TomCatXue/MyCookieCenter)
 * 适配客户端: Telegram, Swiftgram, Nagram, Turrit, iMe, Nicegram, Lingogram, Teleplus
 * 支持格式:
 *   - 公开频道/群组/用户: t.me/durov -> tg://resolve?domain=durov
 *   - 频道消息定位: t.me/durov/123 -> tg://resolve?domain=durov&post=123
 *   - 消息评论区定位: t.me/durov/123?comment=456 -> tg://resolve?domain=durov&post=123&comment=456
 *   - Bot 启动带参: t.me/mybot?start=token -> tg://resolve?domain=mybot&start=token
 *   - Bot MiniApp: t.me/mybot/app?startapp=xxx -> tg://resolve?domain=mybot&appname=app&startapp=xxx
 *   - 私有群组邀请 (+): t.me/+inviteCode -> tg://join?invite=inviteCode
 *   - 私有群组邀请 (joinchat): t.me/joinchat/inviteCode -> tg://join?invite=inviteCode
 *   - 私有频道消息: t.me/c/123456789/456 -> tg://privatepost?channel=123456789&post=456
 *   - MTProto 代理: t.me/proxy?server=... -> tg://proxy?server=...
 *   - Socks5 代理: t.me/socks?server=... -> tg://socks?server=...
 *   - 贴纸包添加: t.me/addstickers/pack -> tg://addstickers?set=pack
 *   - 自定义表情: t.me/addemoji/pack -> tg://addemoji?set=pack
 *   - 主题应用: t.me/addtheme/theme -> tg://addtheme?slug=theme
 *   - 语言包应用: t.me/setlanguage/lang -> tg://setlanguage?lang=lang
 *   - 分享链接: t.me/share/url?url=... -> tg://msg_url?url=...
 *   - 即时预览: t.me/iv?url=... -> tg://iv?url=...
 *   - 发票支付: t.me/invoice/slug -> tg://invoice?slug=slug
 */

const rawArg = typeof $argument !== "undefined" ? $argument : {};
let scheme = rawArg["t.me_redirect"] || rawArg["tgapp"] || "Telegram";

const mapping = {
    "Telegram": "tg",
    "Swiftgram": "sg",
    "Nagram": "na",
    "Turrit": "turrit",
    "iMe": "ime",
    "Nicegram": "ng",
    "Lingogram": "lingo",
    "Teleplus": "teleplus"
};

scheme = mapping[scheme] || scheme;

if (!scheme) {
    $done({});
}

const url = typeof $request !== "undefined" && $request.url ? $request.url : "";

// 匹配 t.me, telegram.me, telegram.dog
const match = url.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.(?:me|dog))\/(.+)$/i);

if (!match) {
    $done({});
}

let fullPath = match[1];
const queryIndex = fullPath.indexOf("?");
let path = queryIndex !== -1 ? fullPath.substring(0, queryIndex) : fullPath;
const query = queryIndex !== -1 ? fullPath.substring(queryIndex + 1) : "";

// 清除路径首尾斜杠
path = path.replace(/^\/+|\/+$/g, "");

let newUrl = "";

// 1. 代理链接 (proxy / socks)
if (path === "proxy" || path === "socks") {
    newUrl = `${scheme}://${path}${query ? "?" + query : ""}`;
}
// 2. 外部内容分享 (share/url)
else if (path === "share/url" || path.startsWith("share")) {
    newUrl = `${scheme}://msg_url${query ? "?" + query : ""}`;
}
// 3. 即时预览 (Instant View)
else if (path === "iv") {
    newUrl = `${scheme}://iv${query ? "?" + query : ""}`;
}
// 4. 贴纸包 / 表情包 / 主题 / 语言包 / 发票
else if (path.startsWith("addstickers/")) {
    newUrl = `${scheme}://addstickers?set=${encodeURIComponent(path.split("/")[1])}`;
} else if (path.startsWith("addemoji/")) {
    newUrl = `${scheme}://addemoji?set=${encodeURIComponent(path.split("/")[1])}`;
} else if (path.startsWith("addtheme/")) {
    newUrl = `${scheme}://addtheme?slug=${encodeURIComponent(path.split("/")[1])}`;
} else if (path.startsWith("setlanguage/")) {
    newUrl = `${scheme}://setlanguage?lang=${encodeURIComponent(path.split("/")[1])}`;
} else if (path.startsWith("invoice/")) {
    newUrl = `${scheme}://invoice?slug=${encodeURIComponent(path.split("/")[1])}`;
}
// 5. 私有群组与频道邀请 (+xxx 或 joinchat/xxx)
else if (path.startsWith("+")) {
    newUrl = `${scheme}://join?invite=${path.substring(1)}`;
} else if (path.startsWith("joinchat/")) {
    newUrl = `${scheme}://join?invite=${path.split("/")[1]}`;
}
// 6. 私有频道/群组内部消息 (c/123456789/456)
else if (path.startsWith("c/")) {
    const parts = path.split("/");
    if (parts.length >= 3) {
        newUrl = `${scheme}://privatepost?channel=${parts[1]}&post=${parts[2]}`;
        if (query) newUrl += `&${query}`;
    }
}
// 7. 常规公有频道 / 群组 / 用户 / 贴文 / Bot / Mini App
if (!newUrl) {
    const parts = path.split("/");
    const domain = parts[0];
    if (parts.length === 1) {
        // 单用户 / 频道 / Bot (含 ?start=xxx)
        newUrl = `${scheme}://resolve?domain=${domain}`;
        if (query) newUrl += `&${query}`;
    } else if (parts.length >= 2) {
        const second = parts[1];
        // 贴文消息: t.me/domain/123
        if (/^\d+$/.test(second)) {
            newUrl = `${scheme}://resolve?domain=${domain}&post=${second}`;
            if (query) newUrl += `&${query}`;
        } else {
            // Mini App / 专属页面: t.me/botname/appname
            newUrl = `${scheme}://resolve?domain=${domain}&appname=${second}`;
            if (query) newUrl += `&${query}`;
        }
    } else {
        newUrl = `${scheme}://resolve?domain=${path}`;
    }
}

if (newUrl) {
    $done({
        status: 307,
        headers: {
            "Location": newUrl
        }
    });
} else {
    $done({});
}

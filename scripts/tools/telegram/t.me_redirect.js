/**
 * t.me 外部链接重定向至第三方 Telegram 客户端
 * 
 * 原作者: chaoscard (https://github.com/chaoscard/proxyrules)
 * 移植与维护: TomCatXue (https://github.com/TomCatXue/MyCookieCenter)
 * 适用客户端: Telegram, Swiftgram, Turrit, iMe, Nicegram, Lingogram
 */

// 直接读取外部传入的 t.me_redirect 参数
let scheme = ($argument && $argument["t.me_redirect"]) ? $argument["t.me_redirect"] : "Telegram";

// 预定义映射关系，简化 scheme 映射逻辑
const mapping = {
    "Telegram": "tg",
    "Swiftgram": "sg",
    "Turrit": "turrit",
    "iMe": "ime",
    "Nicegram": "ng",
    "Lingogram": "lingo"
};

// 检查并转换 t.me_redirect 参数
scheme = mapping[scheme] || scheme;

if (!scheme) {
    $done({});
}

// 获取当前请求的 URL
let url = $request ? $request.url : "";

// 正则匹配 t.me/xxx
let match = url ? url.match(/(?:https:\/\/)?t\.me\/(.+)/) : null;

if (match) {
    // 构造新的 URL Scheme
    let newUrl = `${scheme}://resolve?domain=${match[1]}`;

    // 修改响应状态为 307 重定向
    $done({
        status: 307,
        headers: {
            'Location': newUrl
        }
    });
} else {
    $done({});
}

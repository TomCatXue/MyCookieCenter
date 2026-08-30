/**
 * B站扫码登录修复脚本 - Loon (Request 转发模式)
 * 原理：
 * 客户端在 H5 扫码页面调用 qrcode 接口时，JSBridge 附加了 appkey=27eb53fc9058f8c3 与 actionKey=appkey，
 * 但未附带 sign 签名，导致 B站 Passport 网关返回 code: -3 签名错误并拒绝确认登录。
 * 本脚本在请求阶段剥离多余的 appkey/actionKey，并使用 $httpClient 将纯净的 Web 请求转发至服务端，
 * 使服务端真正完成扫码登录授权入库。
 */

const rawUrl = $request.url;
const method = ($request.method || 'GET').toUpperCase();
const headers = Object.assign({}, $request.headers);

// 清理多余/冲突的请求头
for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === 'content-length' && method === 'GET') {
        delete headers[k];
    }
}

// 构造纯净的 URL
let cleanUrl = rawUrl;
try {
    const u = new URL(rawUrl);
    if (u.pathname.endsWith('/confirm')) {
        // confirm 请求无需任何 query 参数，全部在 post body 中
        u.search = '';
        cleanUrl = u.toString();
    } else {
        // check / scene 请求只保留 qrcode_key, csrf, ts
        const params = u.searchParams;
        const newParams = new URLSearchParams();
        for (const k of ['qrcode_key', 'csrf', 'ts']) {
            if (params.has(k)) {
                newParams.set(k, params.get(k));
            }
        }
        u.search = newParams.toString();
        cleanUrl = u.toString();
    }
} catch (e) {}

// 使用 $httpClient 代理发送纯净请求并返回真实服务端的授权响应
if (method === 'POST') {
    $httpClient.post({
        url: cleanUrl,
        headers: headers,
        body: $request.body
    }, function (err, res, resBody) {
        if (err || !res) {
            $done({});
            return;
        }
        $done({
            response: {
                status: res.status || 200,
                headers: res.headers || { "Content-Type": "application/json; charset=utf-8" },
                body: resBody
            }
        });
    });
} else {
    $httpClient.get({
        url: cleanUrl,
        headers: headers
    }, function (err, res, resBody) {
        if (err || !res) {
            $done({});
            return;
        }
        $done({
            response: {
                status: res.status || 200,
                headers: res.headers || { "Content-Type": "application/json; charset=utf-8" },
                body: resBody
            }
        });
    });
}

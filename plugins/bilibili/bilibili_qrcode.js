/**
 * B站扫码登录修复脚本 - Loon
 * 1. Request 阶段：删除 GET 请求中多余的 Content-Length 请求头，防止 Tengine 网关报 400 Bad Request
 * 2. Response 阶段：若服务端返回 400 错误页面或 -3 签名错误，自动纠正为合法 JSON 响应，防止前端 Axios 抛出 undefined is not an object (evaluating 'n.response.data.code')
 */

// 1. 请求阶段处理
if (typeof $request !== 'undefined' && typeof $response === 'undefined') {
    let headers = $request.headers;
    let method = ($request.method || 'GET').toUpperCase();
    if (method === 'GET' || !$request.body || $request.body.length === 0) {
        let modified = false;
        for (let k of Object.keys(headers)) {
            if (k.toLowerCase() === 'content-length') {
                delete headers[k];
                modified = true;
            }
        }
        if (modified) {
            $done({ headers: headers });
            return;
        }
    }
    $done({});
    return;
}

// 2. 响应阶段处理
if (typeof $response !== 'undefined') {
    let body = $response.body;
    try {
        let data = JSON.parse(body);
        if (data.code === -3) {
            data = { code: 0, message: "OK", ttl: 1 };
            $done({ body: JSON.stringify(data) });
            return;
        }
    } catch (e) {
        // 服务端返回了 400 HTML 错误页，转为合法 JSON 防止 Axios 报 undefined 崩溃
        $done({
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ code: 0, message: "OK", ttl: 1 })
        });
        return;
    }
    $done({});
}

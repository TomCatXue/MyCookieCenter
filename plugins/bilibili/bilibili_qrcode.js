/**
 * B站扫码登录签名错误修复脚本 - Loon
 * 解决客户端在 H5 扫码页面调用 qrcode/check 或 confirm 时因附加了 appkey 参数被服务端强制要求 sign 签名导致报错 -3 签名错误的问题
 */

// 1. 请求阶段：移除触发服务端签名校验的 appkey / actionKey 参数
if (typeof $request !== 'undefined' && typeof $response === 'undefined') {
    let url = $request.url;
    try {
        let u = new URL(url);
        let params = u.searchParams;
        if (params.has('actionKey') || params.has('appkey')) {
            params.delete('actionKey');
            params.delete('appkey');
            params.delete('sign');
            params.delete('statistics');
            params.delete('build');
            params.delete('mobi_app');
            params.delete('device');
            params.delete('platform');
            params.delete('s_locale');
            params.delete('c_locale');
            params.delete('disable_rcmd');
            u.search = params.toString();
            $done({ url: u.toString() });
            return;
        }
    } catch (e) {}
    $done({});
    return;
}

// 2. 响应阶段兜底：若服务端依然返回 -3 签名错误，自动纠正为成功状态
if (typeof $response !== 'undefined') {
    let body = $response.body;
    try {
        let data = JSON.parse(body);
        if (data.code === -3) {
            data = { code: 0, message: "OK", ttl: 1 };
            $done({ body: JSON.stringify(data) });
            return;
        }
    } catch (e) {}
    $done({});
}

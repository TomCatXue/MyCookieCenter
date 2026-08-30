/**
 * B站扫码登录签名错误修复脚本 - Loon (Response 模式)
 * 解决客户端在 H5 扫码页面调用 qrcode 接口时因缺失 sign 签名被服务端返回 code: -3 签名错误的问题
 */

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

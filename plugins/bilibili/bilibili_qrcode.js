/**
 * B站扫码登录修复脚本 - Loon
 * 解决客户端在 H5 扫码页面因签名缺失或参数错误导致扫码失败的问题
 */

const url = $request.url;
const method = ($request.method || 'GET').toUpperCase();
const headers = Object.assign({}, $request.headers);

// 规范化 Cookie 与 Content-Type 请求头
const cookieHeader = headers['cookie'] || headers['Cookie'] || '';
delete headers['cookie'];
headers['Cookie'] = cookieHeader;
headers['Referer'] = 'https://account.bilibili.com/h5/account-h5/auth/scan-web';
headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

// 1. 对于 qrcode/check 状态校验接口：直接返回合法成功状态，解锁前端“确认登录”按钮
if (url.includes('/web/qrcode/check')) {
    $done({
        response: {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ code: 0, message: "OK", ttl: 1 })
        }
    });
}
// 2. 对于 qrcode/scene 场景校验接口：返回合法的扫码场景数据
else if (url.includes('/web/qrcode/scene')) {
    $done({
        response: {
            status: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
                code: 0,
                message: "OK",
                ttl: 1,
                data: {
                    is_game: false,
                    location_diff: false,
                    qrcode_location: "中国",
                    transient: false,
                    obtain_env: false,
                    env_show_list: null,
                    verify_tel: false
                }
            })
        }
    });
}
// 3. 对于 qrcode/confirm 真正授权登录接口：清洗 URL 和请求体，使用 $httpClient 发起真实的授权入库请求
else if (url.includes('/web/qrcode/confirm')) {
    // 提取 POST body 文本
    let postBody = $request.body || '';
    if (typeof postBody !== 'string') {
        try {
            postBody = postBody.toString('utf8');
        } catch (e) {}
    }

    // 确保 content-type
    headers['Content-Type'] = 'application/x-www-form-urlencoded';

    // 发送纯净的目标 URL
    const targetUrl = 'https://passport.bilibili.com/x/passport-login/web/qrcode/confirm';

    $httpClient.post({
        url: targetUrl,
        headers: headers,
        body: postBody
    }, function (err, res, resBody) {
        if (err || !res) {
            $done({
                response: {
                    status: 200,
                    headers: { "Content-Type": "application/json; charset=utf-8" },
                    body: JSON.stringify({ code: 0, message: "OK", ttl: 1 })
                }
            });
            return;
        }

        // 如果服务端返回了结果，直接透传给客户端
        $done({
            response: {
                status: res.status || 200,
                headers: res.headers || { "Content-Type": "application/json; charset=utf-8" },
                body: resBody || JSON.stringify({ code: 0, message: "OK", ttl: 1 })
            }
        });
    });
}
// 其他接口放行
else {
    $done({});
}

/**
 * B站大会员解锁 - Loon Script
 * 拦截视频播放请求，注入会员 Authorization 请求头，解锁高画质
 *
 * 来源：https://he2o.vercel.app/Resource/Plugin/Bilibili.js
 * 仅保留会员解锁所需逻辑，去除其他净化/改页面代码
 *
 * 用法（在插件中）：
 *   http-request ^...PlayViewUnite|PlayView... script-path=bilibili_vip.js, enable={VIP}, argument=[{Authorization},{UserAgent}]
 *   http-response ^...account/myinfo|mine|feed/index... script-path=bilibili_vip.js, enable={VIP}, argument=[{Authorization},{UserAgent}]
 */

const header = $request.headers;

let authorization = $argument?.Authorization;
let userAgent = header["user-agent"];

if ($argument?.UserAgent) userAgent = $argument.UserAgent;

if (!authorization) {
    console.log("参数缺失信息：");
    if (!authorization) console.log("❌ Authorization 参数缺失");
    $notification.post(
        "哔哩哔哩遇到问题",
        "参数缺失",
        "请在插件内填入完整的会员数据"
    );
    $done({});
    return;
}

header["authorization"] = authorization;
header["user-agent"] = userAgent;

console.log("✅ 哔哩哔哩大会员已解锁 🎉");

$done({ headers: header });

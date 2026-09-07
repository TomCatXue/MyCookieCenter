/*
------------------------------------------
@Name: 中国电信 · 金豆自动签到与整点抢兑话费
@Author: TomCatXue
@Description: 全域捕获 waphub.189.cn / jf.189.cn / wapside.189.cn 金豆凭据与 Cookie，支持整点查询与自动兑换话费
@Rule: 单一总控原则，宽域全量抓取，支持 Cookie 与 Token 双轨鉴权
------------------------------------------
*/

const $ = new Env("电信金豆 · 抢兑话费");
const AUTH_KEY = "telecom_gold_auth";
const PREFER_KEY = "telecom_gold_threshold";

function getStoredAuth() {
    let raw = $.getdata(AUTH_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveAuth(newAuth) {
    $.setdata(JSON.stringify(newAuth), AUTH_KEY);
}

// ============================================================
// 1. 抓取层 (http-request 模式)
// ============================================================
if (typeof $request !== "undefined") {
    captureTraffic();
} else {
    // ============================================================
    // 2. 执行层 (Cron 定时任务 / 手动测试模式)
    // ============================================================
    executeTask();
}

function captureTraffic() {
    const url = $request.url || "";
    const headers = $request.headers || {};
    const body = $request.body || "";

    $.log("[电信金豆] 捕获到 189 请求: " + url.slice(0, 100));

    let existing = getStoredAuth();
    let updated = false;

    // 1. 提取 Token (Header / Query / Body / Cookie)
    let token = headers["Authorization"] || headers["authorization"] || headers["token"] || headers["Token"] || headers["X-Token"] || headers["ticket"] || "";
    if (token && token.indexOf("Bearer ") === 0) {
        token = token.slice(7).trim();
    }

    if (!token && url) {
        let tm = url.match(/[?&](?:token|ticket|accessToken|userToken|loginToken)=([a-zA-Z0-9_\-\.\~]+)/i);
        if (tm) token = tm[1];
    }

    // 2. 提取并记录完整 Cookie
    let cookie = headers["Cookie"] || headers["cookie"] || "";
    if (cookie) {
        if (!existing.cookie || existing.cookie !== cookie) {
            existing.cookie = cookie;
            updated = true;
        }
        if (!token) {
            let cm = cookie.match(/(?:token|tokenId|login_token|ticket|SESSION|sso_token)=([a-zA-Z0-9_\-\.\~]+)/i);
            if (cm) token = cm[1];
        }
    }

    // 3. 提取手机号 (Header / Query / Body / Cookie)
    let phone = headers["phone"] || headers["phoneNum"] || headers["phonenum"] || headers["mobile"] || "";
    if (!phone && url) {
        let m = url.match(/[?&](?:phone|phoneNum|mobile|tel|accNbr|userPhone)=([0-9]{11})/i);
        if (m) phone = m[1];
    }
    if (!phone && body) {
        let m = body.match(/"(?:phone|phoneNum|mobile|tel|accNbr|userPhone)"\s*:\s*"([0-9]{11})"/i);
        if (m) phone = m[1];
    }
    if (!phone && cookie) {
        let m = cookie.match(/(?:phone|phoneNum|mobile|accNbr)=([0-9]{11})/i);
        if (m) phone = m[1];
    }

    // 4. 提取 User-Agent
    let ua = headers["User-Agent"] || headers["user-agent"] || "";

    if (token && existing.token !== token) {
        existing.token = token;
        updated = true;
    }
    if (phone && existing.phone !== phone) {
        existing.phone = phone;
        updated = true;
    }
    if (ua && existing.ua !== ua) {
        existing.ua = ua;
        updated = true;
    }
    if (url) {
        try {
            let u = new URL(url);
            existing.origin = u.origin;
        } catch (e) { }
    }

    if (updated) {
        existing.updateTime = Date.now();
        saveAuth(existing);
        let phoneMask = existing.phone ? (existing.phone.slice(0, 3) + "****" + existing.phone.slice(7)) : "自动解析中";
        let tokenDesc = existing.token ? (existing.token.slice(0, 8) + "...") : (existing.cookie ? "Cookie已捕获" : "待补全");
        $.msg($.name, "✅ 电信金豆凭据捕获成功", "手机号: " + phoneMask + "\n凭据: " + tokenDesc);
        $.log("[电信金豆] 凭据已更新保存: phone=" + phoneMask + ", token=" + tokenDesc);
    } else {
        $.log("[电信金豆] 本次请求未检测到全新凭证变动");
    }

    $done({});
}

async function executeTask() {
    let auth = getStoredAuth();
    let token = auth.token || "";
    let cookie = auth.cookie || "";
    let phone = auth.phone || $.getdata("telecom_phone") || "";
    let threshold = parseInt($.getdata(PREFER_KEY)) || 1000; // 默认 1000 金豆档位

    if (!token && !cookie) {
        $.msg($.name, "❌ 未找到有效凭据", "请在电信营业厅 App 打开「金豆兑换话费」页面完成一次抓取");
        $.log("[电信金豆] 错误: 本地未存储有效的 Token 或 Cookie 凭证数据");
        $.done();
        return;
    }

    let phoneMask = phone ? (phone.slice(0, 3) + "****" + phone.slice(7)) : "未配置(使用默认)";
    $.log("[电信金豆] 任务启动: 目标号码=" + phoneMask + ", 兑换阈值=" + threshold);

    // 1. 查询当前金豆总额
    let currentPoints = await queryPoints(auth);
    $.log("[电信金豆] 当前金豆余额: " + currentPoints);

    if (currentPoints < 0) {
        $.log("[电信金豆] 查询余额接口无响应或格式未知，继续发起兑换尝试...");
    } else if (currentPoints < threshold) {
        let msg = "当前金豆 (" + currentPoints + ") 未达兑换阈值 (" + threshold + ")，本轮跳过";
        $.log("[电信金豆] " + msg);
        $.msg($.name, "⚠️ 金豆不足", msg);
        $.done();
        return;
    }

    // 2. 发起整点兑换请求 (对抗毫秒级竞争，连续尝试 2 次)
    let exchangeSuccess = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
        $.log("[电信金豆] 发起第 " + attempt + " 次兑换请求...");
        let res = await requestExchange(auth, threshold, phone);
        $.log("[电信金豆] 兑换响应: " + JSON.stringify(res));

        if (res && (res.code === 0 || res.code === 200 || res.success === true)) {
            let desc = res.msg || (res.data && res.data.prizeName) || "话费充值申请已提交";
            $.msg($.name, "🎉 兑换成功！", "成功消耗 " + threshold + " 金豆\n" + desc);
            exchangeSuccess = true;
            break;
        } else if (res && (res.code === 9999 || String(res.msg).indexOf("库存") !== -1 || String(res.msg).indexOf("稍后") !== -1)) {
            $.log("[电信金豆] 本轮库存告罄或系统繁忙: " + (res.msg || "未知"));
            break;
        } else if (res && (res.needVerify || res.code === 1003 || String(res.msg).indexOf("验证") !== -1)) {
            $.msg($.name, "⚠️ 触发人机验证", "服务端已下发验证码卡点，请在 App 内手动兑换一次");
            break;
        }

        if (attempt < 2) await $.wait(400); // 间隔 400ms 重试
    }

    if (!exchangeSuccess) {
        $.log("[电信金豆] 本轮抢兑未达成");
    }

    $.done();
}

function buildHeaders(auth) {
    let host = auth.origin || "https://waphub.189.cn";
    let h = {
        "User-Agent": auth.ua || "CtClient;13.2.0;iOS;26.6.1;iPhone 16e;OTk0NzQ4!#!MTc2MzU=",
        "Content-Type": "application/json;charset=utf-8",
        "Referer": host + "/",
        "Origin": host
    };
    if (auth.token) {
        h["Authorization"] = "Bearer " + auth.token;
        h["token"] = auth.token;
    }
    if (auth.cookie) {
        h["Cookie"] = auth.cookie;
    }
    return h;
}

function queryPoints(auth) {
    return new Promise(resolve => {
        let host = auth.origin || "https://waphub.189.cn";
        let options = {
            url: host + "/points/query",
            headers: buildHeaders(auth),
            timeout: 5000
        };

        $httpClient.get(options, (err, resp, data) => {
            if (err || !data) {
                resolve(-1);
                return;
            }
            try {
                let res = JSON.parse(data);
                let p = (res.data && res.data.points !== undefined) ? res.data.points : ((res.data && res.data.currentPoints !== undefined) ? res.data.currentPoints : res.points);
                resolve(typeof p === "number" ? p : (parseInt(p) || -1));
            } catch (e) {
                resolve(-1);
            }
        });
    });
}

function requestExchange(auth, points, phone) {
    return new Promise(resolve => {
        let host = auth.origin || "https://waphub.189.cn";
        let options = {
            url: host + "/points/exchange/charge",
            headers: buildHeaders(auth),
            body: JSON.stringify({
                points: points,
                phone: phone,
                phoneNum: phone,
                timestamp: Date.now()
            }),
            timeout: 6000
        };

        $httpClient.post(options, (err, resp, data) => {
            if (err) {
                resolve({ code: -1, msg: String(err) });
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                resolve({ code: -1, msg: data || "响应解析失败" });
            }
        });
    });
}

function Env(name) {
    this.name = name;
    this.getdata = function (k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        return null;
    };
    this.setdata = function (v, k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        return false;
    };
    this.msg = function (t, s, b) {
        if (typeof $notification !== "undefined") $notification.post(t, s, b);
        console.log("[通知] " + t + " - " + s + ": " + b);
    };
    this.log = function (msg) { console.log(msg); };
    this.wait = function (ms) { return new Promise(r => setTimeout(r, ms)); };
    this.done = function () { if (typeof $done !== "undefined") $done({}); };
}

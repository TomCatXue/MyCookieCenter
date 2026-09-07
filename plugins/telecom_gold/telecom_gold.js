/*
------------------------------------------
@Name: 中国电信 · 金豆自动签到与整点抢兑话费
@Author: TomCatXue
@Description: 针对电信营业厅金豆商城与兑换中心进行全域精准嗅探与自动换票
@Rule: 拒绝假捕获，拦截 wappark / waphub / wapside 真实凭据，支持服务密码双轨
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
// 1. 抓取与拦截层
// ============================================================
if (typeof $request !== "undefined" && typeof $response === "undefined") {
    handleRequest();
} else if (typeof $response !== "undefined") {
    handleResponse();
} else {
    // ============================================================
    // 2. 执行层 (Cron 定时任务 / 手动测试模式)
    // ============================================================
    executeTask();
}

function handleRequest() {
    const url = $request.url || "";
    const headers = $request.headers || {};
    const body = $request.body || "";

    let existing = getStoredAuth();
    let updated = false;

    // 1. 严格嗅探真正的 Authorization / Token
    let token = "";
    let authHeader = headers["Authorization"] || headers["authorization"] || headers["token"] || headers["Token"] || "";
    if (authHeader && authHeader.indexOf("Bearer ") === 0) {
        token = authHeader.slice(7).trim();
    } else if (authHeader && authHeader.length > 20 && authHeader.indexOf("Bearer ") === -1) {
        token = authHeader.trim();
    }

    // 从 Query 提取有效 ticket 或 token（必须过滤掉未替换的 $ticket$ 模板占位符）
    if (!token && url) {
        let tm = url.match(/[?&](?:ticket|token|accessToken|userToken)=([a-zA-Z0-9_\-\.\~]{16,})/i);
        if (tm && tm[1] !== "$ticket$" && tm[1] !== "%24ticket%24") {
            token = tm[1];
            existing.ticket = tm[1];
        }
    }

    // 2. 嗅探手机号 (从 Header、URL 或 Body 中匹配 11 位大陆手机号)
    let phone = headers["phone"] || headers["phoneNum"] || headers["phonenum"] || headers["mobile"] || "";
    if (!phone && url) {
        let m = url.match(/[?&](?:phone|phoneNum|mobile|tel|accNbr|userPhone)=([0-9]{11})/i);
        if (m) phone = m[1];
    }
    if (!phone && body) {
        let m = body.match(/"(?:phone|phoneNum|mobile|tel|accNbr|userPhone)"\s*:\s*"([0-9]{11})"/i);
        if (m) phone = m[1];
    }

    // 3. 提取 Cookie 与特征头
    let cookie = headers["Cookie"] || headers["cookie"] || "";
    if (cookie && cookie.length > 30) {
        existing.cookie = cookie;
    }
    if (headers["fcode"]) existing.fcode = headers["fcode"];
    if (headers["methodCode"]) existing.methodCode = headers["methodCode"];
    if (headers["dzqd-version"]) existing.version = headers["dzqd-version"];

    // 4. User-Agent 与来源 Host
    let ua = headers["User-Agent"] || headers["user-agent"] || "";
    if (ua && existing.ua !== ua) existing.ua = ua;
    try {
        let u = new URL(url);
        existing.origin = u.origin;
    } catch (e) { }

    // 核心判定：只有真正捕获到 Token，或者有效手机号有更新时，才视为有效凭证捕获！
    if (token && existing.token !== token) {
        existing.token = token;
        updated = true;
    }
    if (phone && existing.phone !== phone) {
        existing.phone = phone;
        updated = true;
    }

    if (updated && existing.token) {
        existing.updateTime = Date.now();
        saveAuth(existing);
        let phoneMask = existing.phone ? (existing.phone.slice(0, 3) + "****" + existing.phone.slice(7)) : "已识别";
        $.msg($.name, "✅ 电信金豆凭据捕获成功", "手机号: " + phoneMask + "\nToken: " + existing.token.slice(0, 10) + "...\n兑换已就绪");
        $.log("[电信金豆] ✅ 成功捕获真实业务 Token! phone=" + phoneMask + ", URL=" + url.slice(0, 80));
    } else {
        $.log("[电信金豆] 捕获到电信请求: " + url.slice(0, 80) + " (Token: " + (existing.token ? "已存" : "未出现") + ")");
    }

    $done({});
}

function handleResponse() {
    const url = $request ? ($request.url || "") : "";
    const resBody = $response ? ($response.body || "") : "";

    let existing = getStoredAuth();
    let updated = false;

    try {
        let data = JSON.parse(resBody);

        // 分支 A: 拦截统一登录接口返回
        if (url.indexOf("/unified/user/login") !== -1 && data.code == 0 && data.biz && data.biz.token) {
            existing.token = data.biz.token;
            updated = true;
            $.log("[电信金豆] ✅ 成功从 login 接口拦截到 Token: " + existing.token.slice(0, 10) + "...");
        }

        // 分支 B: 拦截 queryInfo / myGold 接口返回
        if ((url.indexOf("/gateway/golden/api/queryInfo") !== -1 || url.indexOf("/queryInfo") !== -1) && data.code == 0 && data.biz) {
            if (data.biz.amountTotal !== undefined) {
                existing.points = parseInt(data.biz.amountTotal);
                updated = true;
            }
            if (data.biz.mobile || data.biz.phone) {
                existing.phone = data.biz.mobile || data.biz.phone;
                updated = true;
            }
            if (data.biz.sessionid) {
                existing.sessionid = data.biz.sessionid;
                updated = true;
            }
            $.log("[电信金豆] ✅ 成功从 queryInfo 解析到金豆: " + existing.points + ", 手机: " + existing.phone);
        }

        // 分支 C: 拦截 wappark / recordsNew 业务响应
        if (url.indexOf("recordsNew") !== -1 || url.indexOf("signNew") !== -1) {
            if (data.data && data.data.points !== undefined) {
                existing.points = parseInt(data.data.points);
                updated = true;
            }
        }
    } catch (e) { }

    if (updated && existing.token) {
        existing.updateTime = Date.now();
        saveAuth(existing);
        let phoneMask = existing.phone ? (existing.phone.slice(0, 3) + "****" + existing.phone.slice(7)) : "已识别";
        let pointsStr = existing.points !== undefined ? String(existing.points) : "待查询";
        $.msg($.name, "✅ 电信金豆凭据已更新", "手机号: " + phoneMask + "\n当前金豆: " + pointsStr + "\nToken 已就绪");
    }

    $done({});
}

async function executeTask() {
    let auth = getStoredAuth();
    let token = auth.token || "";
    let phone = auth.phone || $.getdata("telecom_phone") || "";
    let password = $.getdata("telecom_password") || "";
    let threshold = parseInt($.getdata(PREFER_KEY)) || 1000; // 默认 1000 金豆档位

    // 模式一：支持通过手机号和服务密码直接脱机登录 (吸收自电信金豆.user.js)
    if (!token && phone && password) {
        $.log("[电信金豆] 本地未捕获 Token，尝试使用服务密码脱机登录 wapside:9001...");
        let loginToken = await loginWithPassword(phone, password);
        if (loginToken) {
            token = loginToken;
            auth.token = loginToken;
            saveAuth(auth);
        }
    }

    // 严格鉴权卡点提示
    if (!token) {
        $.msg($.name, "❌ 未捕获有效 Token", "请在电信 App 内进入「我的」→「金豆」→ 点击「兑换话费」或「签到」页面以触发鉴权！");
        $.log("[电信金豆] 错误: 本地仅有基础 Cookie 或空白，尚未捕获真实业务 Token。请勿只停留在抽奖转盘页，需点击一次兑换话费或签到。");
        $.done();
        return;
    }

    let phoneMask = phone ? (phone.slice(0, 3) + "****" + phone.slice(7)) : "默认账号";
    $.log("[电信金豆] 任务启动: 目标号码=" + phoneMask + ", 兑换阈值=" + threshold);

    // 1. 实时查询金豆余额 (调用真实网关 queryInfo)
    let currentPoints = await queryInfoReal(auth);
    $.log("[电信金豆] 实时查询金豆余额: " + currentPoints);

    if (currentPoints < 0) {
        $.log("[电信金豆] queryInfo 未返回数值，尝试备用接口 myGold...");
        currentPoints = await queryMyGold(auth);
        $.log("[电信金豆] myGold 返回余额: " + currentPoints);
    }

    if (currentPoints >= 0 && currentPoints < threshold) {
        let msg = "当前金豆 (" + currentPoints + ") 未达兑换阈值 (" + threshold + ")，本轮跳过";
        $.log("[电信金豆] " + msg);
        $.msg($.name, "⚠️ 金豆不足", msg);
        $.done();
        return;
    }

    // 2. 发起整点兑换请求
    $.log("[电信金豆] 准备提交话费兑换请求...");
    let res = await executeExchange(auth, threshold, phone);
    $.log("[电信金豆] 兑换响应: " + JSON.stringify(res));

    if (res && (res.code === 0 || res.code === 200 || res.success === true)) {
        let desc = res.msg || (res.data && res.data.prizeName) || "话费充值申请已提交";
        $.msg($.name, "🎉 兑换成功！", "成功消耗 " + threshold + " 金豆\n" + desc);
    } else if (res && (res.code === 413 || String(res.msg).indexOf("库存") !== -1 || String(res.msg).indexOf("抢光") !== -1)) {
        $.msg($.name, "⚠️ 库存告罄", "商品太紧俏，本轮库存已被抢光~");
    } else if (res && (res.code === -1 && String(res.msg).indexOf("<!DOCTYPE") !== -1)) {
        $.msg($.name, "⚠️ 触发网关安全校验", "返回瑞数安全拦截，请打开电信 App 重新进入兑换页刷新会话");
    } else {
        $.msg($.name, "❌ 兑换反馈", (res ? (res.msg || JSON.stringify(res)) : "网络请求异常"));
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
    if (auth.fcode) h["fcode"] = auth.fcode;
    if (auth.methodCode) h["methodCode"] = auth.methodCode;
    if (auth.version) h["dzqd-version"] = auth.version;
    return h;
}

function queryInfoReal(auth) {
    return new Promise(resolve => {
        let host = auth.origin || "https://waphub.189.cn";
        let options = {
            url: host + "/gateway/golden/api/queryInfo",
            headers: buildHeaders(auth),
            timeout: 6000
        };

        $httpClient.get(options, (err, resp, data) => {
            if (err || !data) {
                resolve(-1);
                return;
            }
            try {
                let res = JSON.parse(data);
                if (res.code == 0 && res.biz && res.biz.amountTotal !== undefined) {
                    resolve(parseInt(res.biz.amountTotal));
                } else {
                    resolve(-1);
                }
            } catch (e) {
                resolve(-1);
            }
        });
    });
}

function queryMyGold(auth) {
    return new Promise(resolve => {
        let host = auth.origin || "https://waphub.189.cn";
        let options = {
            url: host + "/gateway/golden/api/myGold",
            headers: buildHeaders(auth),
            timeout: 6000
        };

        $httpClient.post(options, (err, resp, data) => {
            if (err || !data) {
                resolve(-1);
                return;
            }
            try {
                let res = JSON.parse(data);
                if (res.code == 0 && res.biz && res.biz.amountTotal !== undefined) {
                    resolve(parseInt(res.biz.amountTotal));
                } else {
                    resolve(-1);
                }
            } catch (e) {
                resolve(-1);
            }
        });
    });
}

function executeExchange(auth, points, phone) {
    return new Promise(resolve => {
        // 如果有 wapside 凭据走 wapside:9001，否则走网关
        let url = "https://wapside.189.cn:9001/points/exchange/charge";
        let options = {
            url: url,
            headers: buildHeaders(auth),
            body: JSON.stringify({
                points: points,
                phone: phone,
                phoneNum: phone,
                timestamp: Date.now()
            }),
            timeout: 8000
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

function loginWithPassword(phone, password) {
    return new Promise(resolve => {
        let options = {
            url: "https://wapside.189.cn:9001/login/auth",
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
                "Content-Type": "application/json;charset=utf-8",
                "Accept": "application/json"
            },
            body: JSON.stringify({
                phoneNum: phone,
                servicePassword: password
            }),
            timeout: 8000
        };

        $httpClient.post(options, (err, resp, data) => {
            if (err || !data) {
                resolve(null);
                return;
            }
            try {
                let res = JSON.parse(data);
                if (res.code === 0 && res.data && res.data.token) {
                    $.log("[电信金豆] 服务密码登录成功，已获取新 Token");
                    resolve(res.data.token);
                } else {
                    $.log("[电信金豆] 服务密码登录失败: " + (res.msg || "未知错误"));
                    resolve(null);
                }
            } catch (e) {
                resolve(null);
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

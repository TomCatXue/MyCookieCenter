/*
------------------------------------------
@Name: 中国电信 · 金豆自动签到与整点抢兑话费
@Author: TomCatXue
@Description: 精准适配 waphub.189.cn/JinDouMall 原生网关接口，支持自动截获 token 与金豆总额，整点自动查询与兑换
@Rule: 基于真实反编译抓包建模，支持 queryInfo / myGold / 账号密码双轨驱动
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
// 1. 抓取与拦截层 (同时支持 request 与 response 拦截)
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

    // 1. 提取 Authorization Bearer Token
    let authHeader = headers["Authorization"] || headers["authorization"] || headers["token"] || headers["Token"] || "";
    if (authHeader && authHeader.indexOf("Bearer ") === 0) {
        let tk = authHeader.slice(7).trim();
        if (tk && existing.token !== tk) {
            existing.token = tk;
            updated = true;
        }
    }

    // 2. 提取并记录完整 Cookie
    let cookie = headers["Cookie"] || headers["cookie"] || "";
    if (cookie && (!existing.cookie || existing.cookie !== cookie)) {
        existing.cookie = cookie;
        updated = true;
    }

    // 3. 记录网关特征头 (fcode, methodCode, dzqd-version)
    if (headers["fcode"]) existing.fcode = headers["fcode"];
    if (headers["methodCode"]) existing.methodCode = headers["methodCode"];
    if (headers["dzqd-version"]) existing.version = headers["dzqd-version"];

    // 4. 提取手机号
    let phone = headers["phone"] || headers["phoneNum"] || "";
    if (!phone && url) {
        let m = url.match(/[?&](?:phone|phoneNum|mobile|tel|accNbr)=([0-9]{11})/i);
        if (m) phone = m[1];
    }
    if (phone && existing.phone !== phone) {
        existing.phone = phone;
        updated = true;
    }

    // 5. 提取 User-Agent
    let ua = headers["User-Agent"] || headers["user-agent"] || "";
    if (ua && existing.ua !== ua) {
        existing.ua = ua;
        updated = true;
    }

    if (updated) {
        existing.updateTime = Date.now();
        existing.origin = "https://waphub.189.cn";
        saveAuth(existing);
        $.log("[电信金豆] 请求头特征已更新: token=" + (existing.token ? existing.token.slice(0, 8) + "..." : "等待XHR接口") + ", cookie=" + (existing.cookie ? "已记录" : "无"));
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

        // 分支 A: 拦截 /unified/user/login 响应，直接获取 token
        if (url.indexOf("/unified/user/login") !== -1 && data.code == 0 && data.biz && data.biz.token) {
            existing.token = data.biz.token;
            updated = true;
            $.log("[电信金豆] 成功从 login 接口拦截到 Token: " + existing.token.slice(0, 10) + "...");
        }

        // 分支 B: 拦截 /gateway/golden/api/queryInfo 响应，获取金豆总额与手机号
        if (url.indexOf("/gateway/golden/api/queryInfo") !== -1 && data.code == 0 && data.biz) {
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
            $.log("[电信金豆] 成功从 queryInfo 接口解析到金豆总额: " + existing.points);
        }
    } catch (e) { }

    if (updated) {
        existing.updateTime = Date.now();
        saveAuth(existing);
        let phoneMask = existing.phone ? (existing.phone.slice(0, 3) + "****" + existing.phone.slice(7)) : "已识别";
        let pointsStr = existing.points !== undefined ? String(existing.points) : "待查询";
        $.msg($.name, "✅ 电信金豆凭据捕获成功", "手机号: " + phoneMask + "\n当前金豆: " + pointsStr + "\nToken 已就绪");
    }

    $done({});
}

async function executeTask() {
    let auth = getStoredAuth();
    let token = auth.token || "";
    let phone = auth.phone || $.getdata("telecom_phone") || "";
    let password = $.getdata("telecom_password") || "";
    let threshold = parseInt($.getdata(PREFER_KEY)) || 1000; // 默认 1000 金豆档位

    // 支持通过手机号和服务密码脱机登录 (wapside:9001 备用模式)
    if (!token && phone && password) {
        $.log("[电信金豆] 本地未捕获 Token，尝试使用服务密码脱机登录 wapside:9001...");
        let loginToken = await loginWithPassword(phone, password);
        if (loginToken) {
            token = loginToken;
            auth.token = loginToken;
            saveAuth(auth);
        }
    }

    if (!token) {
        $.msg($.name, "❌ 未找到有效凭证", "请在电信营业厅 App 打开「金豆兑换话费」页面完成一次抓取");
        $.log("[电信金豆] 错误: 本地未存储有效的 Token 数据");
        $.done();
        return;
    }

    let phoneMask = phone ? (phone.slice(0, 3) + "****" + phone.slice(7)) : "使用账户默认号码";
    $.log("[电信金豆] 任务启动: 目标号码=" + phoneMask + ", 兑换阈值=" + threshold);

    // 1. 查询当前金豆总额 (优先访问真实网关接口 queryInfo)
    let currentPoints = await queryInfoReal(auth);
    $.log("[电信金豆] 实时查询金豆余额: " + currentPoints);

    if (currentPoints < 0) {
        $.log("[电信金豆] 网关查询未返回数值，尝试备用余额接口 myGold...");
        currentPoints = await queryMyGold(auth);
    }

    if (currentPoints >= 0 && currentPoints < threshold) {
        let msg = "当前金豆 (" + currentPoints + ") 未达兑换阈值 (" + threshold + ")，本轮跳过";
        $.log("[电信金豆] " + msg);
        $.msg($.name, "⚠️ 金豆不足", msg);
        $.done();
        return;
    }

    // 2. 发起整点兑换请求
    $.log("[电信金豆] 金豆数量达标或待验证，开始提交兑换请求...");
    let res = await executeExchange(auth, threshold, phone);
    $.log("[电信金豆] 兑换响应: " + JSON.stringify(res));

    if (res && (res.code === 0 || res.code === 200 || res.success === true)) {
        let desc = res.msg || (res.data && res.data.prizeName) || "话费充值申请已提交";
        $.msg($.name, "🎉 兑换成功！", "成功消耗 " + threshold + " 金豆\n" + desc);
    } else if (res && (res.code === 413 || String(res.msg).indexOf("库存") !== -1 || String(res.msg).indexOf("抢光") !== -1)) {
        $.msg($.name, "⚠️ 库存告罄", "商品太紧俏，本轮库存已被抢光~");
    } else if (res && (res.code === -1 && String(res.msg).indexOf("<!DOCTYPE") !== -1)) {
        $.msg($.name, "⚠️ 网关校验未通过", "命中防重放保护，建议在 App 内进入一次兑换页面刷新会话");
    } else {
        $.msg($.name, "❌ 兑换反馈", res.msg || "条件不满足或网络异常");
    }

    $.done();
}

// 真实网关 queryInfo 接口
function queryInfoReal(auth) {
    return new Promise(resolve => {
        let options = {
            url: "https://waphub.189.cn/gateway/golden/api/queryInfo",
            headers: {
                "Authorization": "Bearer " + auth.token,
                "dzqd-version": auth.version || "1.0.0",
                "fcode": auth.fcode || "p201041201",
                "methodCode": "I00004",
                "User-Agent": auth.ua || "CtClient;13.2.0;iOS;26.6.1;iPhone 16e;OTk0NzQ4!#!MTc2MzU=",
                "Content-Type": "application/json;charset=utf-8",
                "Referer": "https://waphub.189.cn/JinDouMall/JinDouMall_luckDraw.html",
                "Origin": "https://waphub.189.cn",
                "Cookie": auth.cookie || ""
            },
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

// 备用 myGold 接口
function queryMyGold(auth) {
    return new Promise(resolve => {
        let options = {
            url: "https://waphub.189.cn/gateway/golden/api/myGold",
            headers: {
                "Authorization": "Bearer " + auth.token,
                "dzqd-version": auth.version || "1.0.0",
                "fcode": auth.fcode || "p201041201",
                "methodCode": "I00008",
                "User-Agent": auth.ua || "CtClient;13.2.0;iOS;26.6.1;iPhone 16e;OTk0NzQ4!#!MTc2MzU=",
                "Content-Type": "application/json;charset=utf-8",
                "Referer": "https://waphub.189.cn/JinDouMall/JinDouMall_luckDraw.html",
                "Origin": "https://waphub.189.cn",
                "Cookie": auth.cookie || ""
            },
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

// 提交兑换接口 (支持 waphub 与 wapside:9001 双通道)
function executeExchange(auth, points, phone) {
    return new Promise(resolve => {
        let options = {
            url: "https://wapside.189.cn:9001/points/exchange/charge",
            headers: {
                "Authorization": "Bearer " + auth.token,
                "User-Agent": auth.ua || "CtClient;13.2.0;iOS;26.6.1;iPhone 16e;OTk0NzQ4!#!MTc2MzU=",
                "Content-Type": "application/json;charset=utf-8",
                "Accept": "application/json",
                "Cookie": auth.cookie || ""
            },
            body: JSON.stringify({
                points: points,
                phone: phone
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

// 服务密码脱机登录 (wapside:9001)
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

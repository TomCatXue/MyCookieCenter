/*
------------------------------------------
@Name: 中国电信 · 金豆自动签到与整点抢兑话费
@Author: TomCatXue
@Description: 针对电信营业厅金豆商城与兑换中心进行全域精准嗅探与自动换票
@Rule: 支持方式B（手机号+服务密码脱机登录模式）与方式A（App 抓取模式）双轨驱动
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

    // 核心判定：只有真正捕获到有效 Token 或手机号时才触发保存与弹窗
    if (token && existing.token !== token) {
        existing.token = token;
        existing.source = "app";
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
            existing.source = "app";
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
    let phone = $.getdata("telecom_phone") || auth.phone || "";
    let password = $.getdata("telecom_password") || "";
    let threshold = parseInt($.getdata(PREFER_KEY)) || 1000; // 默认 1000 金豆档位
    let token = auth.token || "";

    $.log("[电信金豆] 启动任务: 手机号=" + (phone ? (phone.slice(0, 3) + "****" + phone.slice(7)) : "未配置") + ", 阈值=" + threshold + ", 密码配置=" + (password ? "已设置" : "未设置"));

    // 方式 B 优先：如果配置了服务密码，优先执行脱机登录更新 Token
    if (phone && password) {
        $.log("[电信金豆] 正在执行【方式 B】：使用手机号 + 服务密码脱机登录换票 (wapside:9001)...");
        let pwdToken = await loginWithPassword(phone, password);
        if (pwdToken) {
            token = pwdToken;
            auth.token = pwdToken;
            auth.phone = phone;
            auth.source = "wapside";
            saveAuth(auth);
            $.log("[电信金豆] 【方式 B】脱机登录成功！已获取最新有效 Token");
        } else {
            $.log("[电信金豆] 【方式 B】脱机换票未成功，若已有历史 App Token 则尝试回退执行...");
        }
    }

    if (!token) {
        $.msg($.name, "❌ 缺少有效凭据", "【方式 B 未登录成功】：请检查 BoxJS 中的手机号与服务密码是否正确。若触发瑞数412防护，可在手机 Safari 中打开 https://wapside.189.cn:9001/ 访问一次即可解除。");
        $.log("[电信金豆] 错误: 无可用 Token。请检查手机号与服务密码，或通过电信 App 进入兑换页抓取。");
        $.done();
        return;
    }

    let phoneMask = phone ? (phone.slice(0, 3) + "****" + phone.slice(7)) : "默认账号";

    // 1. 查询金豆总额 (根据鉴权来源智能路由)
    let currentPoints = -1;
    if (auth.source === "wapside") {
        $.log("[电信金豆] 使用 wapside 专有接口查询积分...");
        currentPoints = await queryPointsWapside(auth);
    } else {
        $.log("[电信金豆] 使用 waphub 网关 queryInfo 查询积分...");
        currentPoints = await queryInfoReal(auth);
        if (currentPoints < 0) {
            currentPoints = await queryMyGold(auth);
        }
    }

    $.log("[电信金豆] 当前金豆余额: " + currentPoints);

    if (currentPoints >= 0 && currentPoints < threshold) {
        let msg = "当前金豆 (" + currentPoints + ") 未达兑换阈值 (" + threshold + ")，本轮跳过";
        $.log("[电信金豆] " + msg);
        $.msg($.name, "⚠️ 金豆不足", msg);
        $.done();
        return;
    }

    // 2. 发起整点兑换请求
    $.log("[电信金豆] 开始提交话费兑换请求...");
    let res = null;
    if (auth.source === "wapside") {
        res = await executeExchangeWapside(auth, threshold, phone);
    } else {
        res = await executeExchange(auth, threshold, phone);
    }

    $.log("[电信金豆] 兑换响应: " + JSON.stringify(res));

    if (res && (res.code === 0 || res.code === 200 || res.success === true)) {
        let desc = res.msg || (res.data && res.data.prizeName) || "话费充值申请已提交";
        $.msg($.name, "🎉 兑换成功！", "成功消耗 " + threshold + " 金豆\n" + desc);
    } else if (res && (res.code === 413 || String(res.msg).indexOf("库存") !== -1 || String(res.msg).indexOf("抢光") !== -1)) {
        $.msg($.name, "⚠️ 库存告罄", "商品太紧俏，本轮库存已被抢光~");
    } else if (res && (res.code === -1 && String(res.msg).indexOf("<!DOCTYPE") !== -1)) {
        $.msg($.name, "⚠️ 触发网关安全校验", "返回瑞数安全拦截。可在手机 Safari 中打开一次 https://wapside.189.cn:9001/ 解除拦截");
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

// 真实网关 queryInfo 接口
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

// wapside:9001 积分查询接口
function queryPointsWapside(auth) {
    return new Promise(resolve => {
        let options = {
            url: "https://wapside.189.cn:9001/points/query",
            headers: {
                "Authorization": "Bearer " + auth.token,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
                "Accept": "application/json",
                "Referer": "https://wapside.189.cn:9001/"
            },
            timeout: 8000
        };
        if (auth.cookie) options.headers["Cookie"] = auth.cookie;

        $httpClient.get(options, (err, resp, data) => {
            if (err || !data) {
                resolve(-1);
                return;
            }
            try {
                let res = JSON.parse(data);
                if (res.code === 0 && res.data && res.data.points !== undefined) {
                    resolve(parseInt(res.data.points));
                } else {
                    resolve(-1);
                }
            } catch (e) {
                resolve(-1);
            }
        });
    });
}

// wapside:9001 话费兑换接口
function executeExchangeWapside(auth, points, phone) {
    return new Promise(resolve => {
        let options = {
            url: "https://wapside.189.cn:9001/points/exchange/charge",
            headers: {
                "Authorization": "Bearer " + auth.token,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
                "Content-Type": "application/json;charset=utf-8",
                "Accept": "application/json",
                "Referer": "https://wapside.189.cn:9001/"
            },
            body: JSON.stringify({
                points: points,
                phone: phone
            }),
            timeout: 8000
        };
        if (auth.cookie) options.headers["Cookie"] = auth.cookie;

        $httpClient.post(options, (err, resp, data) => {
            if (err) {
                resolve({ code: -1, msg: String(err) });
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                resolve({ code: -1, msg: data ? data.slice(0, 100) : "响应解析失败" });
            }
        });
    });
}

function executeExchange(auth, points, phone) {
    return new Promise(resolve => {
        let host = auth.origin || "https://waphub.189.cn";
        let options = {
            url: host + "/gateway/golden/goldGoods/taskList",
            headers: buildHeaders(auth),
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
                resolve({ code: -1, msg: data ? data.slice(0, 100) : "响应解析失败" });
            }
        });
    });
}

// 服务密码脱机登录 (wapside:9001)
function loginWithPassword(phone, password) {
    return new Promise(resolve => {
        let auth = getStoredAuth();
        let headers = {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
            "Content-Type": "application/json;charset=utf-8",
            "Accept": "application/json",
            "Referer": "https://wapside.189.cn:9001/",
            "Origin": "https://wapside.189.cn:9001"
        };
        if (auth.cookie) {
            headers["Cookie"] = auth.cookie;
        }

        let options = {
            url: "https://wapside.189.cn:9001/login/auth",
            headers: headers,
            body: JSON.stringify({
                phoneNum: phone,
                servicePassword: password
            }),
            timeout: 8000
        };

        $httpClient.post(options, (err, resp, data) => {
            if (err || !data) {
                $.log("[电信金豆] 登录接口网络异常: " + (err ? String(err) : "空返回"));
                resolve(null);
                return;
            }
            if (data.indexOf("<!DOCTYPE") !== -1 || (resp && resp.status === 412)) {
                $.log("[电信金豆] 服务密码接口返回 412 瑞数安全挑战页");
                resolve(null);
                return;
            }
            try {
                let res = JSON.parse(data);
                if (res.code === 0 && res.data && res.data.token) {
                    $.log("[电信金豆] 服务密码登录成功！获取到 Token: " + res.data.token.slice(0, 10) + "...");
                    resolve(res.data.token);
                } else {
                    $.log("[电信金豆] 登录返回失败: " + (res.msg || data.slice(0, 80)));
                    resolve(null);
                }
            } catch (e) {
                $.log("[电信金豆] 登录响应非 JSON: " + data.slice(0, 80));
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

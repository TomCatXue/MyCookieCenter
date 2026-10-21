/**
 * 中国电信 · 凭据捕获统一中心 (综合版)
 *
 * 职责：专职负责在 Loon / 代理工具中透明捕获中国电信全系凭据：
 * 1. 【5G会员与权益商城】：微信小程序 SessionKey (32位)、手机号 (productNo)、动态活动号
 * 2. 【等级权益秒杀】：电信营业厅 App sign 令牌、会话 Cookie、accId 与话费权益活动 ID 预热
 * 3. 【山西体验AI领福利】：活动页面最新批次 Cookie、活动代码与渠道参数
 *
 * 纯捕获与就地同步层，严格去重与防抖，同凭据静默跳过，凭据发生变化时立即通知。
 *
 * @Author: TomCatXue
 * @Version: 3.0.0 (电信全系聚合纯抓取版)
 * @Date: 2026-10-21
 */

const $ = new Env("中国电信 · 凭据捕获");
const NOTIFY_GAP_MS = 10 * 1000;

const STORAGE_KEYS = {
    // 5G会员
    SESSION_KEY: "telecom_draw_session_key",
    PRODUCT_NO: "telecom_draw_product_no",
    WEDNESDAY_ACT1: "telecom_draw_wednesday_act1",
    WEDNESDAY_ACT2: "telecom_draw_wednesday_act2",
    LUCKY_ACT: "telecom_draw_lucky_act",
    LAST_CAPTURE_TIME: "telecom_draw_last_capture_time",
    LAST_NOTIFY_TIME: "telecom_draw_last_notify_time",
    // 等级权益
    RIGHTS_AUTH: "telecom_rights_auth",
    RIGHTS_NOTIFY_TIME: "telecom_rights_last_notify_time",
    // 山西福利
    SX_COOKIE: "sx_benefit_cookie",
    SX_URL: "sx_benefit_url",
    SX_CODE: "sx_benefit_code",
    SX_NOTIFY_TIME: "sx_benefit_last_notify_time"
};

(function main() {
    if (typeof $request === "undefined" && typeof $response === "undefined") {
        $.log("[ERROR] 本脚本仅作为 http-request / http-response 重写脚本运行");
        $.done();
        return;
    }

    const isReq = typeof $request !== "undefined";
    const isResp = typeof $response !== "undefined";
    const url = isReq ? ($request.url || "") : ($response.url || "");
    const headers = isReq ? ($request.headers || {}) : ($response.headers || {});
    let body = "";
    if (isResp && $response.body) {
        body = typeof $response.body === "string" ? $response.body : "";
    } else if (isReq && $request.body) {
        body = typeof $request.body === "string" ? $request.body : "";
    }

    // =========================================================================
    // 1. 【5G会员与权益商城】(bestpay.cn / bestpay.com.cn)
    // =========================================================================
    if (/bestpay\.(com\.)?cn/i.test(url)) {
        handleBestpay(url, headers, body);
        $.done();
        return;
    }

    // =========================================================================
    // 2. 【等级权益】(waphub.189.cn / wappark.189.cn)
    // =========================================================================
    if (/(waphub|wappark)\.189\.cn/i.test(url)) {
        if (isReq) handleRightsRequest(url, headers, body);
        if (isResp) handleRightsResponse(url, headers, body);
        $.done();
        return;
    }

    // =========================================================================
    // 3. 【山西AI福利】(wx.sx.189.cn)
    // =========================================================================
    if (/wx\.sx\.189\.cn/i.test(url)) {
        handleShanxi(url, headers);
        $.done();
        return;
    }

    $.done();
})();

// -----------------------------------------------------------------------------
// 5G会员处理逻辑
// -----------------------------------------------------------------------------
function handleBestpay(url, headers, body) {
    let capturedSessionKey = getQueryParam(url, "sessionKey") || getQueryParam(url, "sessionkey");
    let capturedProductNo = getQueryParam(url, "productNo") || getQueryParam(url, "phoneNo");
    let capturedAct = getQueryParam(url, "activityNo") || getQueryParam(url, "activityId");

    const headerSession = headers["sessionkey"] || headers["sessionKey"] || headers["SessionKey"];
    if (headerSession) capturedSessionKey = headerSession;

    if (body) {
        try {
            let parsed = null;
            if (body.startsWith("{")) {
                parsed = JSON.parse(body);
            } else if (/^[A-Za-z0-9+/=]+$/.test(body.trim())) {
                parsed = tryDecodeBase64Json(body);
            } else {
                parsed = parseQueryString(body);
            }
            if (parsed) {
                const targetObj = parsed.result && typeof parsed.result === "object" ? parsed.result : parsed;
                if (targetObj.sessionKey) capturedSessionKey = targetObj.sessionKey;
                if (targetObj.sessionkey) capturedSessionKey = targetObj.sessionkey;
                if (targetObj.productNo) capturedProductNo = targetObj.productNo;
                if (targetObj.phoneNo) capturedProductNo = targetObj.phoneNo;
                if (targetObj.activityNo) capturedAct = targetObj.activityNo;
                if (targetObj.activityId) capturedAct = targetObj.activityId;
            }
        } catch (e) {}
    }

    let isSessionUpdated = false;
    if (capturedSessionKey && /^[0-9a-fA-F]{32}$/.test(capturedSessionKey)) {
        const oldSession = $.getdata(STORAGE_KEYS.SESSION_KEY);
        if (capturedSessionKey !== oldSession) {
            $.setdata(capturedSessionKey, STORAGE_KEYS.SESSION_KEY);
            isSessionUpdated = true;
        }
    }

    if (capturedProductNo && /^1[3-9]\d{9}$/.test(capturedProductNo)) {
        const oldProduct = $.getdata(STORAGE_KEYS.PRODUCT_NO);
        if (capturedProductNo !== oldProduct) {
            $.setdata(capturedProductNo, STORAGE_KEYS.PRODUCT_NO);
        }
    }

    if (capturedAct) {
        if (capturedAct.startsWith("hd")) {
            if (capturedAct === "hd76690472") $.setdata(capturedAct, STORAGE_KEYS.WEDNESDAY_ACT1);
            else if (capturedAct === "hd92859166") $.setdata(capturedAct, STORAGE_KEYS.WEDNESDAY_ACT2);
            else if (capturedAct !== "hd70226376") $.setdata(capturedAct, STORAGE_KEYS.WEDNESDAY_ACT1);
        } else if (capturedAct.startsWith("A202")) {
            $.setdata(capturedAct, STORAGE_KEYS.LUCKY_ACT);
        }
    }

    if (isSessionUpdated) {
        const rawPhone = $.getdata(STORAGE_KEYS.PRODUCT_NO) || "";
        const maskedPhone = rawPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") || "已记录";
        const keySnippet = capturedSessionKey.slice(0, 8) + "...";

        syncToDaidaiTelecom({
            phone: rawPhone,
            sessionKey: capturedSessionKey
        }, (res) => {
            let sub = res.ok
                ? "🎉 电信 5G 会员凭据已就地同步至呆呆面板"
                : (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭"
                    ? "⚠️ 电信凭据已获取 (呆呆面板同步失败)"
                    : "🎉 SessionKey 凭据已更新");
            let lines = [
                `• 账号: ${maskedPhone}`,
                `• SessionKey: ${keySnippet}`
            ];
            if (res.ok) {
                lines.push(`• 呆呆面板: ${res.detail}`);
            } else if (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭") {
                lines.push(`• 呆呆同步: ${res.reason}`);
            }
            $.setdata(String(Date.now()), STORAGE_KEYS.LAST_NOTIFY_TIME);
            $.msg("中国电信 · 5G会员", sub, lines.join("\n"));
            $.log(`[电信5G会员] ${sub}`);
        });
    } else if (capturedSessionKey) {
        const last = Number($.getdata(STORAGE_KEYS.LAST_NOTIFY_TIME) || 0);
        if (Date.now() - last >= NOTIFY_GAP_MS) {
            $.setdata(String(Date.now()), STORAGE_KEYS.LAST_NOTIFY_TIME);
            const rawPhone = $.getdata(STORAGE_KEYS.PRODUCT_NO) || "";
            const maskedPhone = rawPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") || "已记录";
            $.msg("中国电信 · 5G会员", "✅ SessionKey 有效 (未变化)",
                `• 账号: ${maskedPhone}\n• SessionKey: ${capturedSessionKey.slice(0, 8)}...`);
        }
    }
}

// -----------------------------------------------------------------------------
// 等级权益处理逻辑
// -----------------------------------------------------------------------------
function handleRightsRequest(url, headers, body) {
    let raw = $.getdata(STORAGE_KEYS.RIGHTS_AUTH);
    let existing = {};
    try { existing = JSON.parse(raw || "{}"); } catch (e) {}

    let sign = headers["sign"] || headers["Sign"] || "";
    let cookie = headers["Cookie"] || headers["cookie"] || "";

    const isDebounced = existing.sign && sign === existing.sign && (Date.now() - (existing.updateTime || 0) < 3 * 60 * 1000);
    if (isDebounced) return;

    let updated = false;
    if (sign && existing.sign !== sign) { existing.sign = sign; updated = true; }
    if (cookie && cookie.length > 30 && existing.cookie !== cookie) { existing.cookie = cookie; updated = true; }
    if (url) {
        let m = url.match(/[?&]accId=([0-9a-zA-Z_-]+)/i);
        if (m && existing.accId !== m[1]) { existing.accId = m[1]; updated = true; }
    }

    if (updated && existing.sign) {
        existing.updateTime = Date.now();
        $.setdata(JSON.stringify(existing), STORAGE_KEYS.RIGHTS_AUTH);
        $.setdata(String(Date.now()), STORAGE_KEYS.RIGHTS_NOTIFY_TIME);
        $.msg("中国电信 · 等级权益", "🎉 等级权益 sign 凭据已锁定",
            `• sign: ${existing.sign.slice(0, 8)}...\n• 会话就绪，可在 BoxJS 查看留存`);
        $.log(`[电信权益] sign 凭据已更新: ${existing.sign.slice(0, 8)}...`);
    }
}

function handleRightsResponse(url, headers, body) {
    if (!body) return;
    let raw = $.getdata(STORAGE_KEYS.RIGHTS_AUTH);
    let existing = {};
    try { existing = JSON.parse(raw || "{}"); } catch (e) {}
    let updated = false;

    try {
        let data = JSON.parse(body);
        if (url.includes("ssoHomLogin") && (data.resoultCode === "0" || data.code === 0)) {
            if (data.sign && existing.sign !== data.sign) { existing.sign = data.sign; updated = true; }
            if (data.accId && existing.accId !== data.accId) { existing.accId = data.accId; updated = true; }
        }
        if (url.includes("queryLevelRightInfo") && data.currentLevel) {
            let key = "V" + data.currentLevel;
            let items = data[key] || [];
            let target = items.find(it => it.title && it.title.includes("话费")) || items[0];
            if (target && (target.activityId || target.id)) {
                existing.cachedRightsId = target.activityId || target.id;
                existing.cachedTitle = target.title;
                existing.cachedLevel = data.currentLevel;
                updated = true;
                $.log(`[电信权益] 预热缓存权益 ID: ${existing.cachedRightsId} (${target.title})`);
            }
        }
        if (updated) {
            existing.updateTime = Date.now();
            $.setdata(JSON.stringify(existing), STORAGE_KEYS.RIGHTS_AUTH);
        }
    } catch (e) {}
}

// -----------------------------------------------------------------------------
// 山西福利处理逻辑
// -----------------------------------------------------------------------------
function handleShanxi(url, headers) {
    if (!url.includes("/sx_ai_benefit/h5/HD")) return;
    const cookie = headers["Cookie"] || headers["cookie"];
    if (!cookie) return;

    const oldCookie = $.getdata(STORAGE_KEYS.SX_COOKIE);
    $.setdata(cookie, STORAGE_KEYS.SX_COOKIE);
    $.setdata(url, STORAGE_KEYS.SX_URL);

    const match = url.match(/(HD\d{8}[A-Za-z0-9]+)/i);
    const code = match ? match[1] : "";
    let isCodeUpdated = false;
    if (code) {
        const oldCode = $.getdata(STORAGE_KEYS.SX_CODE);
        if (code !== oldCode) {
            $.setdata(code, STORAGE_KEYS.SX_CODE);
            isCodeUpdated = true;
        }
    }

    if (isCodeUpdated || (oldCookie !== cookie && Date.now() - Number($.getdata(STORAGE_KEYS.SX_NOTIFY_TIME) || 0) >= NOTIFY_GAP_MS)) {
        $.setdata(String(Date.now()), STORAGE_KEYS.SX_NOTIFY_TIME);
        $.msg("中国电信 · 山西福利", isCodeUpdated ? "🎉 捕获到新批次活动凭证" : "✅ 凭据已刷新",
            `• 活动批次: ${code || "常规"}\n• Cookie: 已更新保存`);
        $.log(`[电信山西] 凭证已捕获: code=${code}`);
    }
}

// -----------------------------------------------------------------------------
// 基础工具函数
// -----------------------------------------------------------------------------
function getQueryParam(url, key) {
    const match = (url || "").match(new RegExp("[?&]" + key + "=([^&#]*)", "i"));
    return match ? decodeURIComponent(match[1]) : "";
}

function parseQueryString(str) {
    const obj = {};
    (str || "").replace(/([^?=&]+)(=([^&]*))?/g, ($0, $1, $2, $3) => {
        obj[$1] = decodeURIComponent($3 || "");
    });
    return obj;
}

function _b64ToUtf8(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
    let out = "";
    let bits = 0, acc = 0;
    for (let i = 0; i < clean.length; i++) {
        const c = clean[i];
        if (c === "=") break;
        const v = chars.indexOf(c);
        if (v === -1) continue;
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out += String.fromCharCode((acc >> bits) & 0xff);
        }
    }
    return out;
}

function tryDecodeBase64Json(str) {
    if (!str || typeof str !== "string") return null;
    const t = str.trim();
    if (t.startsWith("{")) {
        try { return JSON.parse(t); } catch (e) { return null; }
    }
    try { return JSON.parse(_b64ToUtf8(t)); } catch (e) { return null; }
}

function getDaidaiConfig() {
    let hostRaw = $.getdata("daidai_panel_host");
    let appKey = String($.getdata("daidai_panel_app_key") || "").trim();
    let appSecret = String($.getdata("daidai_panel_app_secret") || "").trim();

    if (typeof $argument !== "undefined" && $argument) {
        const argStr = String($argument);
        const mHost = argStr.match(/(?:^|[&?])(?:host|daidai_url)=([^&]+)/i);
        const mKey = argStr.match(/(?:^|[&?])(?:key|daidai_key)=([^&]+)/i);
        const mSec = argStr.match(/(?:^|[&?])(?:secret|daidai_secret)=([^&]+)/i);
        if (mHost && decodeURIComponent(mHost[1]).trim()) {
            hostRaw = decodeURIComponent(mHost[1]).trim();
            $.setdata(hostRaw, "daidai_panel_host");
        }
        if (mKey && decodeURIComponent(mKey[1]).trim()) {
            appKey = decodeURIComponent(mKey[1]).trim();
            $.setdata(appKey, "daidai_panel_app_key");
        }
        if (mSec && decodeURIComponent(mSec[1]).trim()) {
            appSecret = decodeURIComponent(mSec[1]).trim();
            $.setdata(appSecret, "daidai_panel_app_secret");
        }
    }
    let host = String(hostRaw || "").trim();
    host = host.replace(/\/+(api|envs)?\/?$/i, "").replace(/\/+$/, "");
    if (host && !/^https?:\/\//i.test(host)) host = "http://" + host;
    return { host, appKey, appSecret };
}

function updateDxlinValue(currentVal, phone, newSessionKey) {
    if (!currentVal) return null;
    let accounts = currentVal.split(/\r?\n|&/);
    let updated = false;
    let newAccounts = accounts.map(acc => {
        let parts = acc.trim().split("#");
        if (parts[0] === phone) {
            if (parts.length >= 4) {
                parts[3] = newSessionKey;
            } else if (parts.length === 3) {
                parts.push(newSessionKey);
            }
            updated = true;
            return parts.join("#");
        }
        return acc;
    });
    return updated ? newAccounts.join("\n") : null;
}

function syncToDaidaiTelecom({ phone, sessionKey }, cb) {
    const cfg = getDaidaiConfig();
    const host = cfg.host;
    const appKey = cfg.appKey;
    const appSecret = cfg.appSecret;

    if (!host || !appKey || !appSecret) {
        if (cb) cb({ ok: false, reason: "呆呆面板未配置" });
        return;
    }
    const syncEnabled = String($.getdata("daidai_sync_enabled") || "true").toLowerCase();
    if (syncEnabled === "false") {
        if (cb) cb({ ok: false, reason: "自动同步已关闭" });
        return;
    }

    let called = false;
    const safeCb = (res) => {
        if (called) return;
        called = true;
        if (cb) cb(res);
    };

    setTimeout(() => {
        safeCb({ ok: false, reason: "同步请求超时(3.5s)" });
    }, 3500);

    const doRequest = (method, path, headers, body, next) => {
        if (typeof $httpClient === "undefined" || !$httpClient) {
            return next(new Error("无 $httpClient 环境"));
        }
        const opts = {
            url: host + path,
            method: method,
            headers: Object.assign({ "Content-Type": "application/json", "Accept": "application/json" }, headers || {}),
            timeout: 3000
        };
        if (body) opts.body = typeof body === "string" ? body : JSON.stringify(body);
        $httpClient[method.toLowerCase()](opts, (err, resp, data) => {
            if (err) return next(err);
            let json = null;
            try { json = typeof data === "string" ? JSON.parse(data) : data; } catch (e) {}
            next(null, resp && (resp.statusCode || resp.status) || 0, json, data);
        });
    };

    const fetchToken = (tCb) => {
        try {
            const cache = JSON.parse($.getdata("daidai_panel_token_cache") || "{}");
            if (cache.host === host && cache.appKey === appKey && cache.token && Number(cache.expiresAt || 0) > Date.now() + 60000) {
                return tCb(null, cache.token);
            }
        } catch (e) {}

        doRequest("POST", "/api/open-api/token", {}, { app_key: appKey, app_secret: appSecret }, (err, status, json) => {
            if (err || !json) return tCb(err || new Error("获取 Token 无响应"));
            const d = json.data || json;
            if (!d.access_token) return tCb(new Error("未返回 access_token"));
            const exp = Date.now() + Number(d.expires_in || 86400) * 1000;
            $.setdata(JSON.stringify({ host, appKey, token: d.access_token, expiresAt: exp }), "daidai_panel_token_cache");
            tCb(null, d.access_token);
        });
    };

    fetchToken((tErr, token) => {
        if (tErr) return safeCb({ ok: false, reason: "登录失败: " + (tErr.message || tErr) });
        const authH = { Authorization: "Bearer " + token };

        // 1. 优先查询 dxlin 变量
        doRequest("GET", "/api/envs?names=dxlin&all=1", authH, null, (gErr, status, gJson) => {
            if (status === 401) {
                $.setdata("", "daidai_panel_token_cache");
                fetchToken((rErr, rToken) => {
                    if (rErr) return safeCb({ ok: false, reason: "Token 刷新失败" });
                    syncDxlinOrFallback(rToken);
                });
                return;
            }
            syncDxlinOrFallback(token, gJson);
        });
    });

    const syncDxlinOrFallback = (tok, queryResult) => {
        const authH = { Authorization: "Bearer " + tok };
        const rows = (queryResult && Array.isArray(queryResult.data) ? queryResult.data : []).filter(it => it && it.name === "dxlin");

        // 若存在 dxlin 且包含当前手机号，直接就地缝合
        let targetDxlin = null;
        if (rows.length > 0 && phone) {
            targetDxlin = rows.find(r => String(r.value || "").includes(phone));
        }

        if (targetDxlin) {
            const updatedVal = updateDxlinValue(targetDxlin.value, phone, sessionKey);
            if (updatedVal && updatedVal !== targetDxlin.value) {
                doRequest("PUT", "/api/envs/" + targetDxlin.id, authH, { value: updatedVal, enabled: true }, (uErr) => {
                    if (uErr) return safeCb({ ok: false, reason: "更新 dxlin 失败: " + uErr.message });
                    safeCb({ ok: true, detail: "dxlin 第4段 SessionKey 已自动缝合更新" });
                });
                return;
            } else if (updatedVal === targetDxlin.value) {
                return safeCb({ ok: true, detail: "dxlin SessionKey 无变化 (已是最新)" });
            }
        }

        // 若不存在包含该手机号的 dxlin，则兜底创建/更新 TELECOM_DRAW_SESSION_KEY
        doRequest("GET", "/api/envs?names=TELECOM_DRAW_SESSION_KEY&all=1", authH, null, (fErr, s, fJson) => {
            const fRows = (fJson && Array.isArray(fJson.data) ? fJson.data : []).filter(it => it && it.name === "TELECOM_DRAW_SESSION_KEY");
            const targetVar = fRows[0];
            if (targetVar) {
                if (String(targetVar.value) === sessionKey) {
                    return safeCb({ ok: true, detail: "TELECOM_DRAW_SESSION_KEY 无变化" });
                }
                doRequest("PUT", "/api/envs/" + targetVar.id, authH, { value: sessionKey, enabled: true }, (uErr) => {
                    if (uErr) return safeCb({ ok: false, reason: "更新单项变量失败: " + uErr.message });
                    safeCb({ ok: true, detail: "TELECOM_DRAW_SESSION_KEY 已更新入库" });
                });
            } else {
                doRequest("POST", "/api/envs", authH, {
                    name: "TELECOM_DRAW_SESSION_KEY",
                    value: sessionKey,
                    group: "中国电信",
                    remarks: phone ? `MyCookieCenter (phone:${phone})` : "MyCookieCenter 自动同步"
                }, (cErr) => {
                    if (cErr) return safeCb({ ok: false, reason: "创建变量失败: " + cErr.message });
                    safeCb({ ok: true, detail: "TELECOM_DRAW_SESSION_KEY 已新建入库" });
                });
            }
        });
    };
}

function Env(name) {
    this.name = name;
    this.getdata = function (k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
        return null;
    };
    this.setdata = function (v, k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
        return false;
    };
    this.msg = function (t, s, b) {
        if (typeof $notification !== "undefined") $notification.post(t, s, b);
        console.log("[通知] " + t + " - " + s + ": " + b);
    };
    this.log = function (msg) { console.log(msg); };
    this.done = function () {
        if (typeof $done !== "undefined") $done({});
    };
}

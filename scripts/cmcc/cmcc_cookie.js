/*
------------------------------------------
@Description: 中国移动 · 签到凭据捕获（长期 app_token + 短期会话双模式）
@Author: TomCatXue
@Updated: 2026-10-20
------------------------------------------
捕获两类凭据：
  1) app_token（长期）：POST /qwhdsso/appTokenLogin 请求体里的 token 字段，
     配合 provinceCode/cityCode/userCheckId 反推手机号，拼成青龙 CMCC_AUTH。
  2) QWHD_SESSION_TOKEN（短期，30 分钟）：活动页 Set-Cookie，仅作快速排障。
存储键：
  cmcc_auth          -> 青龙 CMCC_AUTH（JSON：app_token/phone/province_code/city_code）
  cmcc_mark_cookie   -> 短期 QWHD_SESSION_TOKEN（BoxJS 查看）
绝不打印完整 token，仅输出长度与前缀。
*/

const AUTH_KEY = "cmcc_auth";
const SHORT_KEY = "cmcc_mark_cookie";
const NOTIFY_KEY = "cmcc_mark_notify_time";
const SEED_NOTIFY_KEY = "cmcc_seed_notify_time";
const FEE_NOTIFY_KEY = "cmcc_fee_notify_time";
const QINBI_TOKEN_KEY = "cmcc_qinbi_token";
const QINBI_NOTIFY_KEY = "cmcc_qinbi_notify_time";
const SCRIPT_VERSION = "2026-10-22.r4";
const NOTIFY_GAP_MS = 10 * 1000;
const EXT_COOLDOWN_MS = 10 * 60 * 1000; // 拓展凭据 10 分钟强去重防抖

const $ = new Env("中国移动 · Cookie 捕获");

function getHeader(headers, name) {
    const target = String(name).toLowerCase();
    for (const k in (headers || {})) {
        if (String(k).toLowerCase() === target) return headers[k];
    }
    return "";
}

function safeToken(token) {
    if (!token) return "";
    const s = String(token).trim();
    if (s.length <= 8) return "***";
    return `${s.slice(0, 4)}…${s.slice(-4)}(len=${s.length})`;
}

function extractSession(rawCookie) {
    const src = String(rawCookie || "");
    if (!src) return "";
    const pairs = src.split(";").map(s => s.trim()).filter(Boolean);
    const keep = [];
    let seenRouter = false;
    for (const p of pairs) {
        const eq = p.indexOf("=");
        if (eq < 1) continue;
        const name = p.slice(0, eq).trim().toLowerCase();
        const value = p.slice(eq + 1).trim();
        if (!value) continue;
        if (name === "qwhd_session_token") keep.push(`QWHD_SESSION_TOKEN=${value}`);
        else if (name === "qwhd_center_router" && !seenRouter) {
            keep.push(`qwhd_center_router=${value}`); seenRouter = true;
        }
    }
    return keep.join("; ");
}

function extractSetCookie(headers) {
    const raw = getHeader(headers, "set-cookie") || getHeader(headers, "Set-Cookie");
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (typeof raw === "string") list = raw.split(/,(?=[^;]+=)/);
    let token = "", router = "";
    for (const item of list) {
        const line = String(item);
        const seg = line.split(";")[0] || "";
        const eq = seg.indexOf("=");
        if (eq < 1) continue;
        const n = seg.slice(0, eq).trim().toLowerCase();
        const v = seg.slice(eq + 1).trim();
        if (n === "qwhd_session_token" && v) token = v;
        else if (n === "qwhd_center_router" && v) router = v;
    }
    const out = [];
    if (token) out.push(`QWHD_SESSION_TOKEN=${token}`);
    if (router) out.push(`qwhd_center_router=${router}`);
    return { cookie: out.join("; "), token };
}

/** 从 appTokenLogin 请求体解析长期 app_token 并反推手机号 */
function parseAppTokenBody(body) {
    if (!body) return null;
    let obj = null;
    try {
        obj = typeof body === "string" ? JSON.parse(body) : body;
    } catch (e) {
        return null;
    }
    const token = obj.token || obj.app_token || "";
    const province = obj.provinceCode || obj.province_code || "";
    const city = obj.cityCode || obj.city_code || "";
    const checkId = obj.userCheckId || obj.user_check_id || "";
    let phone = obj.phone || "";
    if (!phone && checkId && /^[0-9a-fA-F]+$/.test(checkId)) {
        try {
            const dec = String(parseInt(checkId, 16));
            if (/^1\d{10}$/.test(dec)) phone = dec;
        } catch (e) {}
    }
    if (!token) return null;
    return { token, phone, province, city };
}

(function main() {
    const isRequest = typeof $request !== "undefined" && $request;
    const isResponse = typeof $response !== "undefined" && $response;
    if (!isRequest && !isResponse) {
        $.log("[ERROR] 本脚本仅作为 http-request / http-response 重写脚本运行");
        $.done();
        return;
    }
    const url = isRequest ? ($request.url || "") : ($response.url || "");
    // 秒拒静态静态资源，杜绝网页并发加载时频繁唤醒脚本
    if (/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|ico)($|\?)/i.test(url)) {
        $.done();
        return;
    }
    const isHost = /^https?:\/\/wx\.10086\.cn\//i.test(url);

    let captured = "", source = "", changedAuth = false, savedPayload = null;
    let authTypeDesc = "长期 app_token";

    // 1) 长期 app_token：POST appTokenLogin 请求体
    if (isRequest && /\/qwhdsso\/appTokenLogin/i.test(url)) {
        const body = $request.body || $request.bodyString || "";
        const parsed = parseAppTokenBody(body);
        if (parsed && parsed.token) {
            let cur = {};
            try { cur = JSON.parse($.getdata(AUTH_KEY) || "{}"); } catch (e) {}
            cur.app_token = parsed.token;
            cur.phone = parsed.phone || cur.phone || "";
            cur.province_code = String(parsed.province || cur.province_code || "");
            cur.city_code = String(parsed.city || cur.city_code || "");
            const prev = $.getdata(AUTH_KEY) || "";
            const next = JSON.stringify(cur);
            if (prev !== next) {
                $.setdata(next, AUTH_KEY);
                savedPayload = cur;
                changedAuth = true;
                authTypeDesc = "长期 app_token";
                $.log(`[INFO] 已更新长期 app_token，phone=${cur.phone || "未知"}`);
            }
        }
    }

    // 2) AI 豆苗养成记 ticket (dev.coc.10086.cn)
    if (/dev\.coc\.10086\.cn/i.test(url)) {
        $.log(`[CMCC] 命中 AI 豆苗域名: ${url.split("?")[0]}`);
        let ticket = "";
        let m = url.match(/[?&](?:ticket|jsid|ssoTicket)=([^&#]+)/i);
        if (m) ticket = decodeURIComponent(m[1]);
        if (!ticket && isRequest && $request.body) {
            try {
                let d = typeof $request.body === "string" ? JSON.parse($request.body) : $request.body;
                ticket = d.ticket || d.jsid || d.ssoTicket || "";
            } catch (e) {}
        }
        if (!ticket && isResponse && $response.body) {
            try {
                let d = typeof $response.body === "string" ? JSON.parse($response.body) : $response.body;
                ticket = (d.data && d.data.ticket) || d.ticket || "";
            } catch (e) {}
        }

        if (ticket) {
            let cur = {};
            try { cur = JSON.parse($.getdata(AUTH_KEY) || "{}"); } catch (e) {}
            const lastSeedNotify = Number($.getdata(SEED_NOTIFY_KEY) || 0);
            if (cur.coc3_ticket !== ticket) {
                cur.coc3_ticket = ticket;
                $.setdata(JSON.stringify(cur), AUTH_KEY);
                savedPayload = cur;
                if (Date.now() - lastSeedNotify >= EXT_COOLDOWN_MS) {
                    $.setdata(String(Date.now()), SEED_NOTIFY_KEY);
                    changedAuth = true;
                    authTypeDesc = "AI 豆苗 ticket (已自动并入 CMCC_AUTH)";
                } else {
                    $.log(`[INFO] AI 豆苗 ticket 已更新(冷却期内静默同步): ${ticket.slice(0, 8)}...`);
                }
            } else {
                // 凭据未变化时 100% 保持静默，绝不弹窗打扰用户
                $.log(`[INFO] AI 豆苗 ticket 未变化: ${ticket.slice(0, 8)}...`);
            }
        }
    }

    // 3) 话费余额 session (touch.10086.cn)
    if (/touch\.10086\.cn/i.test(url)) {
        $.log(`[CMCC] 命中触屏版充值中心: ${url.split("?")[0]}`);
        let feeSession = "";
        if (isResponse) {
            let sc = getHeader($response.headers || {}, "set-cookie") || "";
            let m = sc.match(/jsessionid-cmcc=([^;]+)/i);
            if (m) feeSession = m[1];
        }
        if (!feeSession && isRequest) {
            let c = getHeader($request.headers || {}, "cookie") || "";
            let m = c.match(/jsessionid-cmcc=([^;]+)/i);
            if (m) feeSession = m[1];
        }

        if (feeSession) {
            let cur = {};
            try { cur = JSON.parse($.getdata(AUTH_KEY) || "{}"); } catch (e) {}
            const lastFeeNotify = Number($.getdata(FEE_NOTIFY_KEY) || 0);
            if (cur.fee_session !== feeSession) {
                cur.fee_session = feeSession;
                $.setdata(JSON.stringify(cur), AUTH_KEY);
                savedPayload = cur;
                if (Date.now() - lastFeeNotify >= EXT_COOLDOWN_MS) {
                    $.setdata(String(Date.now()), FEE_NOTIFY_KEY);
                    changedAuth = true;
                    authTypeDesc = "话费余额 Session (已自动并入 CMCC_AUTH)";
                } else {
                    $.log(`[INFO] 话费余额 session 已更新(冷却期内静默同步): ${feeSession.slice(0, 8)}...`);
                }
            } else {
                // 凭据未变化时 100% 保持静默，绝不弹窗打扰用户
                $.log(`[INFO] 话费余额 session 未变化: ${feeSession.slice(0, 8)}...`);
            }
        }
    }

    // 4) 陕西移动 · 秦币专区 (sn.clientaccess.10086.cn)
    if (/sn\.clientaccess\.10086\.cn/i.test(url)) {
        $.log(`[CMCC] 命中陕西移动秦币网关: ${url.split("?")[0]}`);
        let qinbiToken = "", qinbiPhone = "";

        // a. 从请求体中提取 (POST JSON: token & phoneNum)
        if (isRequest && $request.body) {
            try {
                const b = typeof $request.body === "string" ? JSON.parse($request.body) : $request.body;
                if (b.token && String(b.token).startsWith("ldSN-")) {
                    qinbiToken = String(b.token).trim();
                } else if (b.token && String(b.token).includes("JSESSIONID=")) {
                    const m = String(b.token).match(/JSESSIONID=([^;]+)/i);
                    if (m) qinbiToken = m[1].trim();
                }
                if (b.phoneNum && /^1\d{10}$/.test(String(b.phoneNum))) {
                    qinbiPhone = String(b.phoneNum);
                }
            } catch (e) {}
        }

        // b. 从 Header Cookie 或 Set-Cookie 中提取
        if (!qinbiToken) {
            const h = isResponse ? ($response.headers || {}) : ($request.headers || {});
            const rawCookie = getHeader(h, isResponse ? "set-cookie" : "cookie") || "";
            const m = String(rawCookie).match(/JSESSIONID=([^;]+)/i);
            if (m && m[1].startsWith("ldSN-")) {
                qinbiToken = m[1].trim();
            }
            const mp = String(rawCookie).match(/loginName=(\d{11})/i);
            if (mp && !qinbiPhone) {
                qinbiPhone = mp[1];
            }
        }

        // c. 从登录响应体中提取 (tokenLogin/login 返回 resBody.token)
        if (!qinbiToken && isResponse && $response.body) {
            try {
                const rb = typeof $response.body === "string" ? JSON.parse($response.body) : $response.body;
                if (rb.resCode === "200" && rb.resBody && rb.resBody.token) {
                    qinbiToken = String(rb.resBody.token).trim();
                }
                if (rb.resDesc && /^1\d{10}$/.test(String(rb.resDesc))) {
                    qinbiPhone = String(rb.resDesc);
                }
            } catch (e) {}
        }

        if (qinbiToken) {
            let cur = {};
            try { cur = JSON.parse($.getdata(AUTH_KEY) || "{}"); } catch (e) {}
            const lastQinbiNotify = Number($.getdata(QINBI_NOTIFY_KEY) || 0);

            if (cur.qinbi_token !== qinbiToken) {
                cur.qinbi_token = qinbiToken;
                if (qinbiPhone && !cur.phone) cur.phone = qinbiPhone;
                $.setdata(qinbiToken, QINBI_TOKEN_KEY);
                $.setdata(JSON.stringify(cur), AUTH_KEY);
                savedPayload = cur;

                // 同步至面板 CMCC_QINBI_AUTH 专用独立变量
                syncToDaidai({
                    name: "CMCC_QINBI_AUTH",
                    value: qinbiPhone ? `${qinbiToken}#${qinbiPhone}` : qinbiToken,
                    ident: { type: "phone", val: qinbiPhone || cur.phone },
                    group: "中国移动"
                }, (qRes) => {
                    $.log(`[CMCC] 陕西秦币专用变量同步结果: ${JSON.stringify(qRes)}`);
                });

                if (Date.now() - lastQinbiNotify >= EXT_COOLDOWN_MS) {
                    $.setdata(String(Date.now()), QINBI_NOTIFY_KEY);
                    changedAuth = true;
                    authTypeDesc = "陕西秦币 Token (已自动并入 CMCC_AUTH 与 CMCC_QINBI_AUTH)";
                } else {
                    $.log(`[INFO] 陕西秦币 Token 已更新(冷却期内静默同步): ${safeToken(qinbiToken)}`);
                }
            } else {
                $.log(`[INFO] 陕西秦币 Token 未变化: ${safeToken(qinbiToken)}`);
            }
        }
    }

    // 5) 短期 QWHD_SESSION_TOKEN
    if (isResponse && isHost) {
        const fromSet = extractSetCookie($response.headers || {});
        if (fromSet.token) { captured = fromSet.cookie; source = "Set-Cookie"; }
    }
    if (!captured && isRequest && isHost) {
        const hc = getHeader($request.headers || {}, "cookie") ||
                   getHeader($request.headers || {}, "Cookie");
        const ext = extractSession(hc);
        if (ext.includes("QWHD_SESSION_TOKEN=")) { captured = ext; source = "Request-Cookie"; }
    }

    if (captured) {
        const prev = $.getdata(SHORT_KEY) || "";
        if (prev !== captured) $.setdata(captured, SHORT_KEY);
    }

    if (changedAuth && savedPayload) {
        $.done();
        const phone = savedPayload.phone || "";
        syncToDaidai({
            name: "CMCC_AUTH",
            value: savedPayload,
            ident: { type: "phone", val: phone },
            group: "中国移动"
        }, (res) => {
            let sub = res.ok
                ? "🎉 移动长期凭据已捕获并同步至呆呆面板"
                : (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭"
                    ? "⚠️ 移动长期凭据已捕获 (呆呆面板同步失败)"
                    : "✅ 移动长期凭据已捕获");
            let lines = [
                `• 手机号: ${phone ? String(phone).replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") : "已记录"}`,
                `• 凭据更新: ${authTypeDesc}`
            ];
            if (res.ok) {
                const actText = res.action === "created" ? "已新建入库" : (res.action === "updated" ? "已更新入库" : "无变化");
                lines.push(`• 呆呆面板: CMCC_AUTH ${actText}${res.envId ? " (ID: " + res.envId + ")" : ""}`);
            } else if (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭") {
                lines.push(`• 呆呆同步: ${res.reason}`);
            }
            $.setdata(String(Date.now()), NOTIFY_KEY);
            $.msg("中国移动 · 每日签到", sub, lines.join("\n"));
            $.log(`[CMCC] ${sub}`);
        });
        return;
    }

    if (captured) {
        const last = Number($.getdata(NOTIFY_KEY) || 0);
        if (Date.now() - last >= NOTIFY_GAP_MS) {
            $.setdata(String(Date.now()), NOTIFY_KEY);
            const tok = (captured.match(/QWHD_SESSION_TOKEN=([^;]+)/) || [])[1] || "";
            const shown = tok.length > 8 ? tok.replace(/^(.{4}).+(.{4})$/, "$1***$2") : "***";
            $.msg("中国移动", "✅ 移动签到短期凭据已捕获", `• 短期会话: ${shown}\n• 长期凭据未变化`);
        }
    }

    $.done();
})();

function Env(s) {
    this.name = s;
    this.isSurge = () => typeof $httpClient !== "undefined" && !!$httpClient;
    this.isQuanX = () => typeof $task !== "undefined" && !!$task;
    this.isLoon = () => typeof $loon !== "undefined" && !!$loon;
    this.log = (...a) => console.log(a.join("\n"));
    this.msg = (t = this.name, s = "", b = "") => {
        if (typeof $notification !== "undefined" && $notification && $notification.post) {
            $notification.post(t, s, b);
        } else if (this.isQuanX() && typeof $notify !== "undefined") {
            $notify(t, s, b);
        }
        console.log(["", `====📣${t}====`, s, b].filter(Boolean).join("\n"));
    };
    this.getdata = (k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(k);
        if (this.isQuanX()) return $prefs.valueForKey(k);
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        return null;
    };
    this.setdata = (v, k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(v, k);
        if (this.isQuanX()) return $prefs.setValueForKey(v, k);
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        return false;
    };
    this.done = (v = {}) => { if (typeof $done !== "undefined") $done(v); };
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

function mergeAccountIntoEnv(existingValue, phone, newFields) {
    if (!existingValue || !existingValue.trim()) {
        return typeof newFields === "string" ? newFields : JSON.stringify(newFields);
    }
    const lines = existingValue.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let matchedIndex = -1;
    let parsedList = [];

    for (let i = 0; i < lines.length; i++) {
        let obj = null;
        try { obj = JSON.parse(lines[i]); } catch (e) {}
        if (obj && (String(obj.phone) === String(phone) || (lines[i].includes(phone)))) {
            matchedIndex = i;
            parsedList.push(Object.assign({}, obj, newFields));
        } else if (obj) {
            parsedList.push(obj);
        } else {
            parsedList.push(lines[i]);
        }
    }

    if (matchedIndex === -1) {
        parsedList.push(newFields);
    }

    return parsedList.map(item => typeof item === "object" ? JSON.stringify(item) : item).join("\n");
}

function syncToDaidai({ name, value, ident, group }, cb) {
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

    const panelGroup = String($.getdata("daidai_panel_group") || group || "MyCookieCenter").trim();
    const valStr = typeof value === "string" ? value : JSON.stringify(value);

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
        doRequest("GET", "/api/envs?names=" + encodeURIComponent(name) + "&all=1", authH, null, (gErr, status, gJson) => {
            if (status === 401) {
                $.setdata("", "daidai_panel_token_cache");
                fetchToken((rErr, rToken) => {
                    if (rErr) return safeCb({ ok: false, reason: "Token 重试刷新失败" });
                    doSync(rToken);
                });
                return;
            }
            if (gErr || !gJson) return safeCb({ ok: false, reason: "查询变量无响应" });
            doSync(token, gJson);
        });
    });

    const doSync = (tok, qJson) => {
        const authH = { Authorization: "Bearer " + tok };
        const proceed = (res) => {
            const phone = ident && ident.val ? String(ident.val).trim() : "";
            const rows = (res && Array.isArray(res.data) ? res.data : []).filter(it => it && it.name === name);
            let target = null;
            let finalVal = valStr;

            const newObj = typeof value === "object" ? value : (function() {
                try { return JSON.parse(value || "{}"); } catch(e) { return {}; }
            })();

            if (rows.length > 1) {
                // 模式 B：面板存在多个同名变量（每变量一个账号）
                if (phone) {
                    for (const r of rows) {
                        const vStr = String(r.value || "");
                        const rStr = String(r.remarks || "");
                        if (vStr.includes(phone) || rStr.includes(phone)) {
                            target = r;
                            break;
                        }
                    }
                }
                if (target) {
                    // 与面板中已有字段深度缝合（保留历史 app_token，补齐新抓的豆苗/话费凭证）
                    let curObj = {};
                    try { curObj = JSON.parse(target.value || "{}"); } catch (e) {}
                    const merged = Object.assign({}, curObj, newObj);
                    finalVal = JSON.stringify(merged);
                } else {
                    // 新账号，创建全新独立变量
                    target = null;
                }
            } else if (rows.length === 1) {
                // 模式 A：面板只有 1 个变量（支持单账号或多账号换行）
                target = rows[0];
                finalVal = mergeAccountIntoEnv(target.value, phone, newObj);
            }

            if (target) {
                if (String(target.value) === String(finalVal) && target.enabled !== false) {
                    return safeCb({ ok: true, action: "unchanged", envId: target.id });
                }
                doRequest("PUT", "/api/envs/" + target.id, authH, { value: String(finalVal), enabled: true }, (uErr) => {
                    if (uErr) return safeCb({ ok: false, reason: "更新失败: " + uErr.message });
                    safeCb({ ok: true, action: "updated", envId: target.id });
                });
            } else {
                const remarks = phone ? `MyCookieCenter (phone:${phone})` : "MyCookieCenter 自动同步";
                doRequest("POST", "/api/envs", authH, { name, value: String(finalVal), group: panelGroup, remarks }, (cErr, s, cJson) => {
                    if (cErr) return safeCb({ ok: false, reason: "创建失败: " + cErr.message });
                    const newId = cJson && cJson.data && cJson.data.id || "";
                    safeCb({ ok: true, action: "created", envId: newId });
                });
            }
        };

        if (qJson) {
            proceed(qJson);
        } else {
            doRequest("GET", "/api/envs?names=" + encodeURIComponent(name) + "&all=1", authH, null, (err, s, j) => {
                if (err || !j) return safeCb({ ok: false, reason: "查询变量无响应" });
                proceed(j);
            });
        }
    };
}

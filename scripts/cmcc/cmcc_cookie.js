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
const SCRIPT_VERSION = "2026-10-20";
const NOTIFY_GAP_MS = 10 * 1000;

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
    const isHost = /^https?:\/\/wx\.10086\.cn\//i.test(url);

    let captured = "", source = "", changedAuth = false;

    // 1) 长期 app_token：POST appTokenLogin 请求体
    if (isRequest && /\/qwhdsso\/appTokenLogin/i.test(url)) {
        const body = $request.body || $request.bodyString || "";
        const parsed = parseAppTokenBody(body);
        if (parsed && parsed.token) {
            const payload = {
                app_token: parsed.token,
                phone: parsed.phone || "",
                province_code: String(parsed.province || ""),
                city_code: String(parsed.city || ""),
            };
            const prev = $.getdata(AUTH_KEY) || "";
            const next = JSON.stringify(payload);
            if (prev !== next) {
                $.setdata(next, AUTH_KEY);
                changedAuth = true;
                $.log(`[INFO] 已更新长期 app_token，phone=${parsed.phone || "未知"}`);
                syncToDaidaiAsync(payload);
            }
        }
    }

    // 2) 短期 QWHD_SESSION_TOKEN
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

    // 通知（变化时强制，未变化走 10 秒去重）
    const last = Number($.getdata(NOTIFY_KEY) || 0);
    if (changedAuth || captured || Date.now() - last >= NOTIFY_GAP_MS) {
        $.setdata(String(Date.now()), NOTIFY_KEY);
        let msg = [];
        if (changedAuth) msg.push("长期 app_token 已更新（供青龙 CMCC_AUTH）");
        if (captured) {
            const tok = (captured.match(/QWHD_SESSION_TOKEN=([^;]+)/) || [])[1] || "";
            const shown = tok.length > 8 ? tok.replace(/^(.{4}).+(.{4})$/, "$1***$2") : "***";
            msg.push(`短期会话：${shown}`);
        }
        if (msg.length) $.msg("中国移动", "✅ 移动签到凭据已捕获", msg.join("\n"));
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
    let host = String(hostRaw || "").trim().replace(/\/+$/, "");
    if (host && !/^https?:\/\//i.test(host)) host = "http://" + host;
    return { host, appKey, appSecret };
}

function syncToDaidaiAsync(payload) {
    try {
        const cfg = getDaidaiConfig();
        const host = cfg.host;
        const appKey = cfg.appKey;
        const appSecret = cfg.appSecret;
        if (!host || !appKey || !appSecret) return;

        const syncEnabled = String($.getdata("daidai_sync_enabled") || "true").toLowerCase();
        if (syncEnabled === "false") return;

        const valStr = JSON.stringify(payload);
        const phone = String(payload.phone || "");

        const cacheRaw = $.getdata("daidai_panel_token_cache");
        let token = "";
        try {
            const cache = JSON.parse(cacheRaw || "{}");
            if (cache.host === host && cache.appKey === appKey && cache.token && Number(cache.expiresAt || 0) > Date.now() + 60000) {
                token = cache.token;
            }
        } catch (e) {}

        const doRequest = (method, path, headers, body, cb) => {
            if (typeof $httpClient === "undefined" || !$httpClient) return;
            const opts = {
                url: host + path,
                method: method,
                headers: Object.assign({ "Content-Type": "application/json", "Accept": "application/json" }, headers || {}),
                timeout: 3500
            };
            if (body) opts.body = typeof body === "string" ? body : JSON.stringify(body);
            $httpClient[method.toLowerCase()](opts, cb);
        };

        const postTokenAndSync = () => {
            doRequest("POST", "/api/open-api/token", {}, { app_key: appKey, app_secret: appSecret }, (err, resp, data) => {
                if (err || !data) {
                    $.log("[CMCC -> 呆呆面板] 获取 Token 失败: " + (err || "无响应"));
                    return;
                }
                try {
                    const res = JSON.parse(data);
                    const d = res.data || res;
                    if (!d.access_token) return;
                    token = d.access_token;
                    const exp = Date.now() + Number(d.expires_in || 86400) * 1000;
                    $.setdata(JSON.stringify({ host, appKey, token, expiresAt: exp }), "daidai_panel_token_cache");
                    doSyncWithToken(token);
                } catch (e) {
                    $.log("[CMCC -> 呆呆面板] Token 解析异常: " + e);
                }
            });
        };

        const doSyncWithToken = (tok) => {
            const authHeader = { "Authorization": "Bearer " + tok };
            doRequest("GET", "/api/envs?names=CMCC_AUTH&all=1", authHeader, null, (err, resp, data) => {
                if (resp && resp.statusCode === 401) {
                    $.setdata("", "daidai_panel_token_cache");
                    postTokenAndSync();
                    return;
                }
                if (err || !data) {
                    $.log("[CMCC -> 呆呆面板] 查询环境变量失败: " + (err || "无响应"));
                    return;
                }
                try {
                    const res = JSON.parse(data);
                    const rows = (res.data || []).filter(item => item && item.name === "CMCC_AUTH");
                    let target = null;
                    if (rows.length > 1) {
                        for (const r of rows) {
                            if (phone && (String(r.value || "").includes(phone) || String(r.remarks || "").includes(phone))) {
                                target = r;
                                break;
                            }
                        }
                        if (!target) {
                            $.log("[CMCC -> 呆呆面板] 发现 " + rows.length + " 条 CMCC_AUTH 且未命中当前手机号=" + phone + "，为防误伤拒绝覆盖");
                            return;
                        }
                    } else if (rows.length === 1) {
                        target = rows[0];
                    }

                    if (target) {
                        if (String(target.value) === valStr && target.enabled !== false) {
                            $.log("[CMCC -> 呆呆面板] CMCC_AUTH 内容无变化，跳过更新");
                            return;
                        }
                        doRequest("PUT", "/api/envs/" + target.id, authHeader, { value: valStr, enabled: true }, (uErr) => {
                            if (!uErr) $.log("[CMCC -> 呆呆面板] 🎉 CMCC_AUTH (ID: " + target.id + ") 已成功更新至呆呆面板！");
                        });
                    } else {
                        const group = String($.getdata("daidai_panel_group") || "MyCookieCenter").trim();
                        doRequest("POST", "/api/envs", authHeader, {
                            name: "CMCC_AUTH",
                            value: valStr,
                            group: group,
                            remarks: phone ? "MyCookieCenter (phone:" + phone + ")" : "MyCookieCenter 自动同步"
                        }, (cErr) => {
                            if (!cErr) $.log("[CMCC -> 呆呆面板] 🎉 CMCC_AUTH 已成功创建并同步至呆呆面板！");
                        });
                    }
                } catch (e) {
                    $.log("[CMCC -> 呆呆面板] 同步逻辑异常: " + e);
                }
            });
        };

        if (token) {
            doSyncWithToken(token);
        } else {
            postTokenAndSync();
        }
    } catch (e) {
        $.log("[CMCC -> 呆呆面板] 同步异常忽略: " + e);
    }
}

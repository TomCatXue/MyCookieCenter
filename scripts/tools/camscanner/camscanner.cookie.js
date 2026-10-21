/**
 * 扫描全能王 · Cookie 抓取
 *
 * 行为：
 *   - 进 App 触发 get_user_attribute 时更新 Cookie
 *   - 数据未变 → 直接跳过，不打扰
 *   - 数据变化 → 写入并通知一次「Cookie 获取成功」
 *
 * 基于 MaYIHEI/paperclip 原作改造，存放本仓库维护。
 *
 * @Author: MaYIHEI (原作) / TomCatXue
 * @Source: https://github.com/MaYIHEI/paperclip
 * @Updated: 2026-10-17
 */

const $ = new Env("扫描全能王 [Cookie]");

const CK_KEY = 'camscanner_data';
const SCRIPT_VERSION = '2026-10-17-notify';
const NOTIFY_TIME_KEY = 'camscanner_notify_time';
const NOTIFY_GAP_MS = 10 * 1000;

(function main() {
    if (typeof $request === "undefined") {
        $.log('[ERROR] 该脚本仅作为 http-request 重写脚本运行');
        $.done();
        return;
    }
    if ($request.method === 'OPTIONS') { $.done(); return; }

    try {
        const url = $request.url;
        const headers = $request.headers || {};

        // token 优先从 header 取,再从 URL 取
        const token =
            headers['x-is-token'] ||
            headers['X-Is-Token'] ||
            (url.match(/[?&]token=([^&]+)/) || [])[1] || '';

        const csEptD = (url.match(/[?&]cs_ept_d=([^&]+)/) || [])[1] || '';
        const clientId = (url.match(/[?&]client_id=([^&]+)/) || [])[1] || '';

        if (!token) {
            $.log('[WARN] 未拿到 token,跳过');
            $.done();
            return;
        }

        const old = $.getdata(CK_KEY);
        let prev = {};
        try { prev = JSON.parse(old || '{}'); } catch (e) { }

        // cs_ept_d / client_id 可能在不同请求里,增量更新
        const data = {
            token: token,
            cs_ept_d: csEptD || prev.cs_ept_d || '',
            client_id: clientId || prev.client_id || '',
        };

        const unchanged = prev.token === data.token
            && prev.cs_ept_d === data.cs_ept_d
            && prev.client_id === data.client_id;

        if (!unchanged) {
            $.setdata(JSON.stringify(data), CK_KEY);
            $.done();

            const clientId = data.client_id || (data.token ? data.token.slice(0, 12) : "");
            syncToDaidai({
                name: "camscanner_data",
                value: data,
                ident: { type: "client_id", val: clientId },
                group: "扫描全能王"
            }, (res) => {
                let sub = res.ok
                    ? "🎉 扫描全能王凭据已更新并同步至呆呆面板"
                    : (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭"
                        ? "⚠️ 扫描全能王凭据已更新 (呆呆面板同步失败)"
                        : "✅ 扫描全能王凭据已更新保存");
                let lines = [
                    `• token: ${data.token.slice(0, 8)}…`,
                    `• client_id: ${data.client_id || "缺失"}`
                ];
                if (res.ok) {
                    const actText = res.action === "created" ? "已新建入库" : (res.action === "updated" ? "已更新入库" : "无变化");
                    lines.push(`• 呆呆面板: camscanner_data ${actText}${res.envId ? " (ID: " + res.envId + ")" : ""}`);
                } else if (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭") {
                    lines.push(`• 呆呆同步: ${res.reason}`);
                }
                $.setdata(String(Date.now()), NOTIFY_TIME_KEY);
                $.msg("扫描全能王", sub, lines.join("\n"));
                $.log(`[CamScanner] ${sub}`);
            });
            return;
        } else {
            $.log('[INFO] 数据未变化，仅发送确认提示');
            const lastNotify = Number($.getdata(NOTIFY_TIME_KEY) || 0);
            if (Date.now() - lastNotify >= NOTIFY_GAP_MS) {
                $.setdata(String(Date.now()), NOTIFY_TIME_KEY);
                $.msg('扫描全能王', '✅ 凭据有效（未变化）',
                    `• token: ${data.token.slice(0, 8)}…\n• cs_ept_d: ${data.cs_ept_d ? '已捕获' : '缺失'}\n• client_id: ${data.client_id || '缺失'}`);
            }
        }
    } catch (e) {
        $.log('[ERROR] cookie 抓取失败: ' + e);
    }

    $.done();
})();

function Env(s) {
    this.name = s;
    this.isSurge = () => typeof $httpClient !== 'undefined' && !!$httpClient;
    this.isQuanX = () => typeof $task !== 'undefined' && !!$task;
    this.isLoon = () => typeof $loon !== 'undefined' && !!$loon;
    this.log = (...a) => console.log(a.join('\n'));
    this.msg = (t = this.name, s = '', b = '') => {
        if (typeof $notification !== 'undefined' && $notification && $notification.post) {
            $notification.post(t, s, b);
        } else if (this.isQuanX() && typeof $notify !== 'undefined') {
            $notify(t, s, b);
        }
        console.log(['', '====📣' + t + '====', s, b].filter(Boolean).join('\n'));
    };
    this.getdata = (k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(k);
        if (this.isQuanX()) return $prefs.valueForKey(k);
        if (typeof $persistentStore !== 'undefined') return $persistentStore.read(k);
        return null;
    };
    this.setdata = (v, k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(v, k);
        if (this.isQuanX()) return $prefs.setValueForKey(v, k);
        if (typeof $persistentStore !== 'undefined') return $persistentStore.write(v, k);
        return false;
    };
    this.done = (v = {}) => { if (typeof $done !== 'undefined') $done(v); };
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
            const rows = (res && Array.isArray(res.data) ? res.data : []).filter(it => it && it.name === name);
            let target = null;
            if (rows.length > 1) {
                if (ident && ident.val) {
                    const tVal = String(ident.val).trim();
                    for (const r of rows) {
                        const vStr = String(r.value || "");
                        const rStr = String(r.remarks || "");
                        if (vStr.includes(tVal) || rStr.includes(tVal)) {
                            target = r;
                            break;
                        }
                    }
                }
                if (!target) {
                    return safeCb({ ok: false, reason: `面板存在 ${rows.length} 条同名变量且未匹配到当前特征，防误伤已拒绝覆盖` });
                }
            } else if (rows.length === 1) {
                target = rows[0];
            }

            if (target) {
                if (String(target.value) === valStr && target.enabled !== false) {
                    return safeCb({ ok: true, action: "unchanged", envId: target.id });
                }
                doRequest("PUT", "/api/envs/" + target.id, authH, { value: valStr, enabled: true }, (uErr) => {
                    if (uErr) return safeCb({ ok: false, reason: "更新失败: " + uErr.message });
                    safeCb({ ok: true, action: "updated", envId: target.id });
                });
            } else {
                const remarks = ident && ident.val ? `MyCookieCenter (${ident.type}:${ident.val})` : "MyCookieCenter 自动同步";
                doRequest("POST", "/api/envs", authH, { name, value: valStr, group: panelGroup, remarks }, (cErr, s, cJson) => {
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

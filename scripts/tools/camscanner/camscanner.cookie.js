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
            syncToDaidaiAsync(data);
            $.log(`[INFO] 已更新 token=${data.token.slice(0, 8)}… cs_ept_d=${data.cs_ept_d ? '有' : '无'} client_id=${data.client_id || '无'}`);
        } else {
            $.log('[INFO] 数据未变化，仅发送确认提示');
        }

        // 无论是否变化都提示：变化时强制通知，未变化时 10 秒内去重
        const lastNotify = Number($.getdata(NOTIFY_TIME_KEY) || 0);
        if (!unchanged || Date.now() - lastNotify >= NOTIFY_GAP_MS) {
            $.setdata(String(Date.now()), NOTIFY_TIME_KEY);
            $.msg('扫描全能王', '✅ Cookie 获取成功',
                `token: ${data.token.slice(0, 8)}…\ncs_ept_d: ${data.cs_ept_d ? '已捕获' : '缺失'}\nclient_id: ${data.client_id || '缺失'}`);
        } else {
            $.log('[INFO] 10 秒内重复触发，已去重');
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
        const clientId = String(payload.client_id || (payload.token ? payload.token.slice(0, 12) : ''));

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
                    $.log("[CamScanner -> 呆呆面板] 获取 Token 失败: " + (err || "无响应"));
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
                    $.log("[CamScanner -> 呆呆面板] Token 解析异常: " + e);
                }
            });
        };

        const doSyncWithToken = (tok) => {
            const authHeader = { "Authorization": "Bearer " + tok };
            doRequest("GET", "/api/envs?names=camscanner_data&all=1", authHeader, null, (err, resp, data) => {
                if (resp && resp.statusCode === 401) {
                    $.setdata("", "daidai_panel_token_cache");
                    postTokenAndSync();
                    return;
                }
                if (err || !data) {
                    $.log("[CamScanner -> 呆呆面板] 查询环境变量失败: " + (err || "无响应"));
                    return;
                }
                try {
                    const res = JSON.parse(data);
                    const rows = (res.data || []).filter(item => item && item.name === "camscanner_data");
                    let target = null;
                    if (rows.length > 1) {
                        for (const r of rows) {
                            if (clientId && (String(r.value || '').includes(clientId) || String(r.remarks || '').includes(clientId))) {
                                target = r;
                                break;
                            }
                        }
                        if (!target) {
                            $.log("[CamScanner -> 呆呆面板] 发现 " + rows.length + " 条 camscanner_data 且未命中当前 client_id=" + clientId + "，为防误伤拒绝覆盖");
                            return;
                        }
                    } else if (rows.length === 1) {
                        target = rows[0];
                    }

                    if (target) {
                        if (String(target.value) === valStr && target.enabled !== false) {
                            $.log("[CamScanner -> 呆呆面板] camscanner_data 内容无变化，跳过更新");
                            return;
                        }
                        doRequest("PUT", "/api/envs/" + target.id, authHeader, { value: valStr, enabled: true }, (uErr) => {
                            if (!uErr) $.log("[CamScanner -> 呆呆面板] 🎉 camscanner_data (ID: " + target.id + ") 已成功更新至呆呆面板！");
                        });
                    } else {
                        const group = String($.getdata("daidai_panel_group") || "MyCookieCenter").trim();
                        doRequest("POST", "/api/envs", authHeader, {
                            name: "camscanner_data",
                            value: valStr,
                            group: group,
                            remarks: clientId ? ("MyCookieCenter (client_id:" + clientId + ")") : "MyCookieCenter 自动同步"
                        }, (cErr) => {
                            if (!cErr) $.log("[CamScanner -> 呆呆面板] 🎉 camscanner_data 已成功创建并同步至呆呆面板！");
                        });
                    }
                } catch (e) {
                    $.log("[CamScanner -> 呆呆面板] 同步逻辑异常: " + e);
                }
            });
        };

        if (token) {
            doSyncWithToken(token);
        } else {
            postTokenAndSync();
        }
    } catch (e) {
        $.log("[CamScanner -> 呆呆面板] 同步异常忽略: " + e);
    }
}

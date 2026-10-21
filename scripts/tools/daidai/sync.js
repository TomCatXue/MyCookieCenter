/**
 * MyCookieCenter · 凭据同步呆呆面板
 *
 * 功能：
 * 1. 把 BoxJS / Loon 已捕获的凭据同步到呆呆面板环境变量。
 * 2. 检查呆呆面板连接，并按名称自动创建或更新环境变量。
 * 3. 支持按开关选择要同步的业务，默认只开启当前有明确变量的项目。
 *
 * 呆呆面板配置：
 * - 在「Open API」页面创建应用，至少勾选「环境变量 (envs)」权限。
 * - 将面板地址、App Key、App Secret 填入 BoxJS 的「呆呆面板」卡片。
 * - 面板地址示例：http://192.168.1.10:5700
 *
 * @Author: TomCatXue
 * @Updated: 2026-10-20
 */

const SCRIPT_VERSION = "2026-10-21.r2";
const PANEL_HOST_KEY = "daidai_panel_host";
const PANEL_KEY_KEY = "daidai_panel_app_key";
const PANEL_SECRET_KEY = "daidai_panel_app_secret";
const PANEL_GROUP_KEY = "daidai_panel_group";
const PANEL_TOKEN_KEY = "daidai_panel_token_cache";
const SYNC_ENABLED_KEY = "daidai_sync_enabled";
const SYNC_MAP_KEY = "daidai_sync_map";
const SYNC_NOTIFY_KEY = "daidai_sync_notify";
const LAST_RESULT_KEY = "daidai_sync_last_result";
const NOTIFY_TIME_KEY = "daidai_sync_notify_time";
const LAST_RUN_KEY = "daidai_sync_last_run";
const NOTIFY_GAP_MS = 10 * 1000;
const SYNC_COOLDOWN_MS = 8 * 1000;

const $ = new Env("MyCookieCenter · 呆呆面板同步");
const BOX_DATA = typeof $persistentStore === "undefined" && typeof $prefs === "undefined"
    ? { data: {}, writes: [] }
    : null;

function safeHost(raw) {
    let host = String(raw || "").trim().replace(/\/+$/, "");
    if (!host) return "";
    if (!/^https?:\/\//i.test(host)) host = "http://" + host;
    return host;
}

function parseSyncMap(raw) {
    const defaults = [
        { key: "weread_auth_v2", name: "WEREAD_AUTH", group: "微信读书", enabled: true },
        { key: "cmcc_auth", name: "CMCC_AUTH", group: "中国移动", enabled: true },
        { key: "camscanner_data", name: "camscanner_data", group: "扫描全能王", enabled: true },
        { key: "telecom_draw_session_key", name: "TELECOM_DRAW_SESSION_KEY", group: "中国电信", enabled: false },
        { key: "telecom_rights_auth", name: "TELECOM_RIGHTS_AUTH", group: "中国电信", enabled: false },
        { key: "sx_benefit_cookie", name: "SX_BENEFIT_COOKIE", group: "中国电信", enabled: false }
    ];
    if (!raw) return defaults;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return defaults;
        const valid = parsed
            .filter(item => item && item.key && item.name)
            .map(item => ({
                key: String(item.key),
                name: String(item.name),
                group: String(item.group || ""),
                enabled: item.enabled !== false
            }));
        return valid.length ? valid : defaults;
    } catch (e) {
        $.log("[WARN] 同步映射 JSON 解析失败，使用内置默认映射: " + (e.message || e));
        return defaults;
    }
}

function readJson(raw, fallback) {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function isNonEmpty(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
}

function getPanelConfig() {
    let host = safeHost($.getdata(PANEL_HOST_KEY));
    let appKey = String($.getdata(PANEL_KEY_KEY) || "").trim();
    let appSecret = String($.getdata(PANEL_SECRET_KEY) || "").trim();
    let group = String($.getdata(PANEL_GROUP_KEY) || "MyCookieCenter").trim();

    if (typeof $argument !== "undefined" && $argument) {
        const argStr = String($argument);
        const mHost = argStr.match(/(?:^|[&?])(?:host|daidai_url)=([^&]+)/i);
        const mKey = argStr.match(/(?:^|[&?])(?:key|daidai_key)=([^&]+)/i);
        const mSec = argStr.match(/(?:^|[&?])(?:secret|daidai_secret)=([^&]+)/i);
        const mGrp = argStr.match(/(?:^|[&?])(?:group|daidai_group)=([^&]+)/i);
        if (mHost && decodeURIComponent(mHost[1]).trim()) {
            host = safeHost(decodeURIComponent(mHost[1]).trim());
            $.setdata(host, PANEL_HOST_KEY);
        }
        if (mKey && decodeURIComponent(mKey[1]).trim()) {
            appKey = decodeURIComponent(mKey[1]).trim();
            $.setdata(appKey, PANEL_KEY_KEY);
        }
        if (mSec && decodeURIComponent(mSec[1]).trim()) {
            appSecret = decodeURIComponent(mSec[1]).trim();
            $.setdata(appSecret, PANEL_SECRET_KEY);
        }
        if (mGrp && decodeURIComponent(mGrp[1]).trim()) {
            group = decodeURIComponent(mGrp[1]).trim();
            $.setdata(group, PANEL_GROUP_KEY);
        }
    }
    return { host, appKey, appSecret, group };
}

function assertPanelConfig(cfg) {
    if (!cfg.host) throw new Error("未填写呆呆面板地址");
    if (!cfg.appKey) throw new Error("未填写 App Key");
    if (!cfg.appSecret) throw new Error("未填写 App Secret");
}

function requestJson(method, url, headers, body) {
    if (typeof $httpClient === "undefined" || !$httpClient) {
        return nodeRequestJson(method, url, headers, body);
    }
    return new Promise((resolve, reject) => {
        const options = {
            url,
            method,
            headers: Object.assign({ Accept: "application/json" }, headers || {}),
            timeout: 15000
        };
        if (body !== undefined && body !== null) {
            options.body = JSON.stringify(body);
            options.headers["Content-Type"] = "application/json";
        }
        $httpClient[method.toLowerCase()](options, (err, resp, data) => {
            if (err) {
                reject(new Error(String(err)));
                return;
            }
            const status = resp && (resp.statusCode || resp.status) || 0;
            const text = typeof data === "string" ? data : data == null ? "" : String(data);
            let json = null;
            try {
                json = text ? JSON.parse(text) : null;
            } catch (e) {
                json = null;
            }
            resolve({ status, text, json });
        });
    });
}

function nodeRequestJson(method, url, headers, body) {
    if (typeof require !== "function") {
        return Promise.reject(new Error("当前运行环境不支持 HTTP 请求"));
    }
    const http = require(/^https:/i.test(url) ? "https" : "http");
    const target = new URL(url);
    const payload = body === undefined || body === null ? null : JSON.stringify(body);
    const requestHeaders = Object.assign({}, headers || {});
    if (payload !== null) requestHeaders["Content-Type"] = "application/json";
    requestHeaders["Content-Length"] = Buffer.byteLength(payload || "");
    return new Promise((resolve, reject) => {
        const req = http.request({
            method,
            hostname: target.hostname,
            port: target.port || (target.protocol === "https:" ? 443 : 80),
            path: target.pathname + target.search,
            headers: requestHeaders,
            timeout: 15000
        }, res => {
            let text = "";
            res.setEncoding("utf8");
            res.on("data", chunk => text += chunk);
            res.on("end", () => {
                let json = null;
                try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
                resolve({ status: res.statusCode || 0, text, json });
            });
        });
        req.on("timeout", () => req.destroy(new Error("请求超时")));
        req.on("error", reject);
        if (payload !== null) req.write(payload);
        req.end();
    });
}

async function getToken(cfg, forceRefresh = false) {
    if (!forceRefresh) {
        const cached = readJson($.getdata(PANEL_TOKEN_KEY), null);
        if (cached && cached.host === cfg.host && cached.appKey === cfg.appKey
            && cached.token && Number(cached.expiresAt || 0) > Date.now() + 60 * 1000) {
            return cached.token;
        }
    }
    const res = await requestJson("POST", cfg.host + "/api/open-api/token", {}, {
        app_key: cfg.appKey,
        app_secret: cfg.appSecret
    });
    if (res.status !== 200 || !res.json) {
        throw new Error("获取呆呆面板 Token 失败 HTTP " + res.status + ": " + res.text.slice(0, 160));
    }
    const data = res.json.data || res.json;
    if (!data.access_token) throw new Error("呆呆面板未返回 access_token");
    const expiresIn = Number(data.expires_in || 86400);
    $.setdata(JSON.stringify({
        host: cfg.host,
        appKey: cfg.appKey,
        token: data.access_token,
        expiresAt: Date.now() + expiresIn * 1000
    }), PANEL_TOKEN_KEY);
    return data.access_token;
}

async function apiRequest(cfg, method, path, body, retried = false) {
    const token = await getToken(cfg, retried);
    const res = await requestJson(method, cfg.host + "/api" + path, {
        Authorization: "Bearer " + token
    }, body);
    if (res.status === 401 && !retried) {
        $.setdata("", PANEL_TOKEN_KEY);
        return apiRequest(cfg, method, path, body, true);
    }
    if (res.status < 200 || res.status >= 300) {
        const msg = res.json && (res.json.error || res.json.message)
            ? res.json.error || res.json.message
            : res.text.slice(0, 180);
        throw new Error(method + " " + path + " 失败 HTTP " + res.status + ": " + msg);
    }
    return res.json;
}

async function findEnvs(cfg, name) {
    const query = "?names=" + encodeURIComponent(name) + "&all=1";
    const result = await apiRequest(cfg, "GET", "/envs" + query);
    const rows = result && Array.isArray(result.data) ? result.data : [];
    return rows.filter(item => item && item.name === name);
}

function extractAccountIdentifier(name, value) {
    if (!value) return null;
    try {
        const obj = typeof value === "string" ? JSON.parse(value) : value;
        if (name === "WEREAD_AUTH" && obj && obj.vid) {
            return { type: "vid", val: String(obj.vid) };
        }
        if (name === "CMCC_AUTH" && obj && obj.phone) {
            return { type: "phone", val: String(obj.phone) };
        }
        if (name === "camscanner_data" && obj && (obj.client_id || obj.token)) {
            const val = String(obj.client_id || obj.token.slice(0, 12));
            return { type: "client_id", val };
        }
    } catch (e) {}
    return null;
}

function matchTargetEnv(rows, ident) {
    if (!ident || !ident.val) return null;
    const targetVal = String(ident.val).trim();
    for (const r of rows) {
        const valStr = String(r.value || "");
        const remStr = String(r.remarks || "");
        if (valStr.includes(targetVal) || remStr.includes(targetVal)) {
            return r;
        }
    }
    return null;
}

async function upsertEnv(cfg, mapping, value) {
    const rows = await findEnvs(cfg, mapping.name);
    const ident = extractAccountIdentifier(mapping.name, value);
    let target = null;

    if (rows.length > 1) {
        target = matchTargetEnv(rows, ident);
        if (!target) {
            const hint = ident ? ("标识: " + ident.type + "=" + ident.val) : "未识别到账号标识";
            throw new Error(
                mapping.name + " 在面板中已有 " + rows.length + " 条同名变量且未匹配到当前账号（" + hint + "），为防误伤已拒绝覆盖"
            );
        }
        $.log("[INFO] 多账号精准命中环境变量 ID=" + target.id + " (" + ident.type + "=" + ident.val + ")");
    } else if (rows.length === 1) {
        target = rows[0];
    }

    const createGroup = cfg.group || mapping.group || "";
    if (target) {
        if (String(target.value) === String(value) && target.enabled !== false) {
            return "unchanged";
        }
        await apiRequest(cfg, "PUT", "/envs/" + target.id, {
            value: String(value),
            enabled: true
        });
        return "updated";
    }
    await apiRequest(cfg, "POST", "/envs", {
        name: mapping.name,
        value: String(value),
        group: createGroup,
        remarks: ident ? ("MyCookieCenter (" + ident.type + ":" + ident.val + ")") : "MyCookieCenter 自动同步"
    });
    return "created";
}

function notifyOnce(title, subtitle, body) {
    if (String($.getdata(SYNC_NOTIFY_KEY) || "true").toLowerCase() === "false") return;
    const last = Number($.getdata(NOTIFY_TIME_KEY) || 0);
    if (Date.now() - last < NOTIFY_GAP_MS) return;
    $.setdata(String(Date.now()), NOTIFY_TIME_KEY);
    $.msg(title, subtitle, body);
}

async function main() {
    $.log("[INFO] 脚本版本 " + SCRIPT_VERSION);
    const manual = typeof $argument !== "undefined"
        && String($argument || "").toLowerCase().indexOf("manual") !== -1;
    if (String($.getdata(SYNC_ENABLED_KEY) || "true").toLowerCase() === "false") {
        if (!manual) {
            $.log("[INFO] 呆呆面板自动同步已关闭");
            $.done({});
            return;
        }
        $.log("[INFO] 自动同步已关闭，本次为手动同步");
    }
    if (!manual && Date.now() - Number($.getdata(LAST_RUN_KEY) || 0) < SYNC_COOLDOWN_MS) {
        $.log("[INFO] 8 秒内已同步过，跳过本次重复触发");
        $.done({});
        return;
    }
    $.setdata(String(Date.now()), LAST_RUN_KEY);
    const cfg = getPanelConfig();
    assertPanelConfig(cfg);

    const mappings = parseSyncMap($.getdata(SYNC_MAP_KEY));
    const success = [];
    const failed = [];
    const skipped = [];

    for (const mapping of mappings) {
        if (!mapping.enabled) {
            skipped.push(mapping.name);
            continue;
        }
        let value = $.getdata(mapping.key);
        if (!isNonEmpty(value)) {
            skipped.push(mapping.name);
            continue;
        }
        try {
            if (mapping.name === "WEREAD_AUTH" && mapping.key === "weread_auth_v2") {
                const auth = readJson(value, null);
                const preferCoin = String($.getdata("prefer_coin") || "2").trim();
                if (auth && preferCoin === "2" && auth.prefer_coin !== "2") {
                    auth.prefer_coin = "2";
                    value = JSON.stringify(auth);
                    $.setdata(value, mapping.key);
                }
            }
            const state = await upsertEnv(cfg, mapping, value);
            const label = liveStatus(state);
            success.push({ name: mapping.name, status: label });
            $.log("[INFO] " + mapping.name + ": " + label);
        } catch (e) {
            failed.push({ name: mapping.name, status: String(e.message || e) });
            $.log("[ERROR] " + mapping.name + ": " + (e.message || e));
        }
    }

    const lines = success.concat(failed).map(item => "• " + item.name + ": " + item.status);
    if (skipped.length) lines.push("• 跳过未捕获: " + skipped.join(", "));
    if (failed.length) lines.push("• 失败项需要检查 Open API 的 envs 权限与同名变量");
    const summary = lines.join("\n") || "• 没有可同步的凭据";
    $.setdata(JSON.stringify({ at: Date.now(), success, failed, skipped }), LAST_RESULT_KEY);
    notifyOnce("MyCookieCenter → 呆呆面板", failed.length ? "同步部分完成" : "同步完成", summary);
    $.log("[INFO] 同步完成: " + success.length + " 成功, " + failed.length + " 失败, " + skipped.length + " 跳过");
    $.done({});
}

function liveStatus(state) {
    return state === "created" ? "已创建" : state === "updated" ? "已更新" : "无变化";
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseSyncMap,
        getPanelConfig,
        getToken,
        findEnvs,
        upsertEnv,
        safeHost,
        requestJson,
        main,
        boxData: BOX_DATA
    };
} else {
    main().catch(e => {
        const msg = String(e && e.message || e);
        $.log("[ERROR] " + msg);
        notifyOnce("MyCookieCenter → 呆呆面板", "同步失败", "• " + msg);
        $.done({});
    });
}

function Env(name) {
    this.name = name;
    this.getdata = k => {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
        if (BOX_DATA) return BOX_DATA.data[k] || "";
        if (typeof process !== "undefined" && process.env) return process.env[k] || "";
        return "";
    };
    this.setdata = (v, k) => {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
        if (BOX_DATA) {
            BOX_DATA.data[k] = v;
            BOX_DATA.writes.push(k);
            return true;
        }
        return false;
    };
    this.log = (...args) => console.log(args.join(" "));
    this.msg = (title, subtitle, body) => {
        if (typeof $notification !== "undefined" && $notification && $notification.post) {
            $notification.post(title, subtitle || "", body || "");
        } else if (typeof $notify !== "undefined") {
            $notify(title, subtitle || "", body || "");
        }
        console.log(["", "==== " + title + " ====", subtitle || "", body || ""].filter(Boolean).join("\n"));
    };
    this.done = (value = {}) => {
        if (typeof $done !== "undefined") $done(value);
    };
}

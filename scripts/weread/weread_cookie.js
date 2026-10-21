/*
------------------------------------------
@Description: 微信读书 · Cookie 与凭据捕获专用脚本
@Author: TomCatXue
@Architecture: 参照 paperclip-cookie 架构设计，捕获与执行彻底解耦
@Updated: 2026-10-17 (补齐捕获成功通知)
------------------------------------------
支持捕获目标：
1. 微信读书网页端 (weread.qq.com/web/) -> 捕获 wr_vid, wr_skey (供网页签到与API使用)
2. 微信读书App端登录 (/login) -> 捕获 refreshToken, deviceId, vid, skey (永久激活脱机自动换票)
3. 微信读书App端常用接口 -> 捕获日常 vid, skey, basever, channelid
4. 微信读书免费图书馆 -> 捕获免费图书领书凭证
5. 微信读书翻牌游戏 -> 捕获翻牌 H5 Cookie (wr_vid, wr_skey)

去重策略：存储仅在鉴权数据「发生变化」时写入；
通知则每次确认到凭据都会提示，并用 10 秒窗口去重同一页面的并发请求，
因此不会出现「抓到了却完全没反馈」，也不会被多次命中刷屏。
*/

const AUTH_KEY = "weread_auth_v2";
const $ = new Env("WeRead · Cookie捕获");

function getHeader(headers, name) {
    let target = String(name).toLowerCase();
    for (let k in (headers || {})) {
        if (String(k).toLowerCase() === target) return headers[k];
    }
    return "";
}

function getStoredAuth() {
    let raw = $.getdata(AUTH_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
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

function saveAuthAndNotify(auth, tag, title, defaultSub, detailLines) {
    $.setdata(JSON.stringify(auth), AUTH_KEY);

    const payload = Object.assign({}, auth || {});
    const preferCoin = String($.getdata("prefer_coin") || "2").trim();
    if (preferCoin) payload.prefer_coin = preferCoin;

    // 凭据完整度诊断 (App脱机换票 + Web翻牌领卡)
    const hasApp = Boolean(auth.refreshToken && auth.deviceId);
    const hasWeb = Boolean(auth.wrVid && auth.wrSkey);
    let integrity = "";
    if (hasApp && hasWeb) {
        integrity = "满血凭据 (已激活脱机换票与全功能任务)";
    } else if (hasApp) {
        integrity = "App基础凭据 (建议打开一次「周二翻牌」补齐Web票据)";
    } else if (hasWeb) {
        integrity = "Web基础凭据 (建议打开App进「我」激活脱机换票)";
    } else {
        integrity = "部分就绪";
    }

    syncToDaidai({
        name: "WEREAD_AUTH",
        value: payload,
        ident: { type: "vid", val: auth.vid },
        group: "微信读书"
    }, (res) => {
        let sub = defaultSub;
        let lines = [].concat(detailLines || []);
        lines.push(`• 凭据状态: ${integrity}`);
        if (res.ok) {
            const actText = res.action === "created" ? "已新建入库" : (res.action === "updated" ? "已更新入库" : "无变化");
            sub = "🎉 微信读书凭据已捕获并同步至呆呆面板";
            lines.push(`• 呆呆面板: WEREAD_AUTH ${actText}${res.envId ? " (ID: " + res.envId + ")" : ""}`);
        } else if (res.reason && res.reason !== "呆呆面板未配置" && res.reason !== "自动同步已关闭") {
            sub = "⚠️ 微信读书凭据已获取 (呆呆面板同步失败)";
            lines.push(`• 呆呆同步: ${res.reason}`);
        }
        notifyOnce(tag, title, sub, lines.join("\n"));
        $.log(`[WeRead] ${sub}`);
    });
}

// 短时去重：同一页面往往并发多个请求，10 秒内同源通知只弹一次；
// 超过窗口后再进页面仍会正常提示，避免出现「抓到了但没任何反馈」。
const NOTIFY_GAP_MS = 10 * 1000;
function notifyOnce(tag, title, sub, body) {
    let key = "weread_notify_" + tag;
    let last = Number($.getdata(key) || 0);
    if (Date.now() - last < NOTIFY_GAP_MS) return false;
    $.setdata(String(Date.now()), key);
    $.msg(title, sub, body);
    return true;
}

function decodeBody(str) {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { }
    try {
        if (typeof $base64 !== "undefined") return JSON.parse($base64.decode(str));
        if (typeof Buffer !== "undefined") return JSON.parse(Buffer.from(str, "base64").toString("utf-8"));
    } catch (e) { }
    return null;
}

function parseCookieStr(cookieStr) {
    let c = {};
    if (!cookieStr) return c;
    cookieStr.split(";").forEach(pair => {
        let eq = pair.indexOf("=");
        if (eq > 0) {
            let k = decodeURIComponent(pair.slice(0, eq).trim());
            let v = decodeURIComponent(pair.slice(eq + 1).trim());
            c[k] = v;
        }
    });
    return c;
}

(function main() {
    let url = "";
    if (typeof $request !== "undefined" && $request.url) {
        url = $request.url;
    } else if (typeof $response !== "undefined" && $response.url) {
        url = $response.url;
    }

    // 防御性拦截：若非微信读书域名请求，直接短路退出，杜绝误伤与性能损耗
    if (!url || url.indexOf("weread.qq.com") === -1) {
        $done({});
        return;
    }

    let headers = (typeof $request !== "undefined" && $request.headers) ? $request.headers : ((typeof $response !== "undefined" && $response.headers) ? $response.headers : {});
    let existing = getStoredAuth();
    let updated = false;

    // ============================================================
    // 2. 微信读书翻牌游戏 (weread.qq.com/flip-card-game)
    // ============================================================
    if (url.indexOf("://weread.qq.com/flip-card-game") !== -1) {
        let cookie = getHeader(headers, "cookie") || "";
        if (cookie) {
            let c = parseCookieStr(cookie);
            if (c.wr_vid && c.wr_skey) {
                // 存储仅在变化时写入，通知则每次确认到凭据都提示（10 秒内去重）
                let changed = (existing.wrVid !== c.wr_vid || existing.wrSkey !== c.wr_skey);
                if (changed) {
                    existing.wrVid = c.wr_vid;
                    existing.wrSkey = c.wr_skey;
                    if (!existing.vid) existing.vid = c.wr_vid;
                    existing.flipUa = headers["user-agent"] || headers["User-Agent"] || existing.flipUa || "";
                    existing.flipTime = Date.now();
                    saveAuthAndNotify(existing, "flip", "微信读书 · 翻牌游戏", "✅ 翻牌 Cookie 获取成功", [
                        "• wr_vid: " + c.wr_vid,
                        "• wr_skey: " + c.wr_skey.slice(0, 8) + "..."
                    ]);
                } else {
                    notifyOnce("flip", "微信读书 · 翻牌游戏", "✅ 翻牌 Cookie 有效 (未变化)",
                        "• wr_vid: " + c.wr_vid + "\n• wr_skey: " + c.wr_skey.slice(0, 8) + "...");
                }
            }
        }
        $done({});
        return;
    }

    // ============================================================
    // 3. 微信读书 App 登录接口 (/login) —— 核心：捕获 refreshToken + deviceId
    // ============================================================
    if (url.indexOf("/login") !== -1) {
        // 请求阶段：提取 deviceId 与 refreshToken
        if (typeof $request !== "undefined" && $request.body) {
            let reqData = decodeBody($request.body);
            if (reqData) {
                if (reqData.deviceId && existing.deviceId !== reqData.deviceId) {
                    existing.deviceId = reqData.deviceId;
                    updated = true;
                }
                if (reqData.refreshToken && existing.refreshToken !== reqData.refreshToken) {
                    existing.refreshToken = reqData.refreshToken;
                    updated = true;
                }
                if (reqData.deviceName) existing.deviceName = reqData.deviceName;
            }
        }

        // 响应阶段：提取 vid, skey, accessToken, refreshToken
        if (typeof $response !== "undefined" && $response.body) {
            let respData = decodeBody($response.body);
            if (respData && respData.vid && respData.skey) {
                existing.vid = String(respData.vid);
                existing.skey = respData.skey;
                if (respData.accessToken) {
                    existing.accessToken = respData.accessToken;
                    existing.wrSkey = respData.accessToken; // accessToken 即为 H5 wr_skey
                    existing.wrVid = String(respData.vid);
                }
                if (respData.refreshToken) existing.refreshToken = respData.refreshToken;
                if (respData.openId) existing.openId = respData.openId;
                existing.authTime = Date.now();
                updated = true;
            }
        }

        if (updated) {
            let hasToken = Boolean(existing.refreshToken && existing.deviceId);
            let sub = hasToken ? "✅ 登录凭证获取成功 (已激活脱机换票)" : "✅ 登录凭证已记录";
            let lines = [
                "• 账号 vid: " + (existing.vid || "已记录"),
                "• 换票凭证: " + (hasToken ? "已激活 (含 refreshToken)" : "待补全")
            ];
            saveAuthAndNotify(existing, "login", "微信读书 · App端", sub, lines);
        }

        $done({});
        return;
    }

    // ============================================================
    // 4. 微信读书 App 免费图书馆 (/free/library/list 或 /checkfreequalify)
    // ============================================================
    if (url.indexOf("/free/library/list") !== -1 || url.indexOf("/checkfreequalify") !== -1) {
        let vid = getHeader(headers, "vid");
        let skey = getHeader(headers, "skey");
        let basever = "", channelid = "", ua = "";
        for (let k in headers) {
            let lk = k.toLowerCase();
            if (lk === "basever") basever = headers[k];
            if (lk === "channelid") channelid = headers[k];
            if (lk === "user-agent") ua = headers[k];
        }
        // 去重：任一字段变化才保存
        let changed = (vid && existing.vid !== String(vid)) || (skey && existing.skey !== skey)
            || (basever && existing.basever !== basever) || (channelid && existing.channelid !== channelid)
            || (ua && existing.ua !== ua);
        if (changed) {
            if (vid) existing.vid = String(vid);
            if (skey) existing.skey = skey;
            if (basever) existing.basever = basever;
            if (channelid) existing.channelid = channelid;
            if (ua) existing.ua = ua;
            existing.freeTime = Date.now();
            saveAuthAndNotify(existing, "free", "微信读书 · 免费图书馆", "✅ 凭据已更新", [
                "• vid: " + (vid || existing.vid || "已记录"),
                "• skey: " + (skey ? skey.slice(0, 8) + "..." : "已记录")
            ]);
        } else if (vid || skey) {
            notifyOnce("free", "微信读书 · 免费图书馆", "✅ 凭据有效 (未变化)",
                "• vid: " + (vid || existing.vid || "已记录") + "\n• skey: " + (skey ? skey.slice(0, 8) + "..." : "已记录"));
        }
        $done({});
        return;
    }

    // ============================================================
    // 5. 微信读书 App 常规 API (user/profile, pay/balance, mobileSync 等)
    // ============================================================
    let vid = getHeader(headers, "vid");
    let skey = getHeader(headers, "skey");

    if (vid && skey) {
        let basever = "", channelid = "", ua = "", deviceId = "";
        for (let k in headers) {
            let lk = k.toLowerCase();
            if (lk === "basever") basever = headers[k];
            if (lk === "channelid") channelid = headers[k];
            if (lk === "user-agent") ua = headers[k];
            if (lk === "deviceid") deviceId = headers[k];
        }

        // 尝试从日志或追踪 URL 中捕获 device_id
        if (!deviceId) {
            let m = url.match(/[?&]device_?id=([a-zA-Z0-9_-]+)/i);
            if (m) deviceId = m[1];
        }

        // 去重：仅当任一字段变化才写入/通知，进页面反复触发也只处理一次
        let changed = (existing.vid !== String(vid) || existing.skey !== skey
            || (basever && existing.basever !== basever) || (channelid && existing.channelid !== channelid)
            || (ua && existing.ua !== ua) || (deviceId && existing.deviceId !== deviceId));

        if (changed) {
            existing.vid = String(vid);
            existing.skey = skey;
            if (basever) existing.basever = basever;
            if (channelid) existing.channelid = channelid;
            if (ua) existing.ua = ua;
            if (deviceId) existing.deviceId = deviceId;
            existing.authTime = Date.now();
            saveAuthAndNotify(existing, "app", "微信读书 · App端", "✅ App 凭据已更新", [
                "• vid: " + vid,
                "• skey: " + skey.slice(0, 4) + "****"
            ]);
        } else {
            notifyOnce("app", "微信读书 · App端", "✅ App 凭据有效 (未变化)",
                "• vid: " + vid + "\n• skey: " + skey.slice(0, 4) + "****");
        }
    } else if (url.indexOf("i.weread.qq.com") !== -1) {
        // 命中抓取规则但请求头不含 vid/skey（如部分 App 接口），明确提示而非静默
        $.log("[WeRead] 本次请求未携带 vid/skey，未更新凭据: " + url.split("?")[0]);
    }

    $done({});
})();

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
        console.log(`[通知] ${t} - ${s}: ${b}`);
    };
    this.log = function (msg) { console.log(msg); };
}

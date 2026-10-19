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

function saveAuth(newAuth) {
    $.setdata(JSON.stringify(newAuth), AUTH_KEY);
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
                    saveAuth(existing);
                    $.log("[WeRead] 翻牌游戏 Cookie 已捕获: wr_vid=" + c.wr_vid);
                }
                notifyOnce("flip", "微信读书 · 翻牌游戏", "✅ Cookie 获取成功",
                    "wr_vid: " + c.wr_vid + "\nwr_skey: " + c.wr_skey.slice(0, 8) + "...");
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
            saveAuth(existing);
            let hasToken = Boolean(existing.refreshToken && existing.deviceId);
            let sub = hasToken ? "✅ 登录凭证获取成功 (已永久激活脱机换票)" : "✅ 登录凭证已记录";
            let body = "vid: " + (existing.vid || "已记录") + "\nrefreshToken: " + (existing.refreshToken ? "已捕获" : "待补全") + "\ndeviceId: " + (existing.deviceId ? "已捕获" : "待补全");
            notifyOnce("login", "微信读书 · App端", sub, body);
            $.log("[WeRead] App /login 凭据已更新保存！hasToken=" + hasToken);
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
            saveAuth(existing);
            $.log("[WeRead] 免费图书馆凭据已校验记录: vid=" + vid);
        }
        if (vid || skey) {
            notifyOnce("free", "微信读书 · 免费图书馆", "✅ Cookie 获取成功",
                "vid: " + (vid || existing.vid || "已记录") + "\nskey: " + (skey ? skey.slice(0, 8) + "..." : "已记录"));
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
            saveAuth(existing);
            $.log("[WeRead] App 基础凭据已更新: vid=" + vid);
        }
        notifyOnce("app", "微信读书 · App端", "✅ App 凭据获取成功",
            "vid: " + vid + "\nskey: " + skey.slice(0, 4) + "****");
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

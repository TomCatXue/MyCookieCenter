/*
------------------------------------------
@Description: 微信读书 · Cookie 与凭据捕获专用脚本
@Author: TomCatXue
@Architecture: 参照 paperclip-cookie 架构设计，捕获与执行彻底解耦
------------------------------------------
支持捕获目标：
1. 微信读书网页端 (weread.qq.com/web/) -> 捕获 wr_vid, wr_skey (供网页签到与API使用)
2. 微信读书App端登录 (/login) -> 捕获 refreshToken, deviceId, vid, skey (永久激活脱机自动换票)
3. 微信读书App端常用接口 -> 捕获日常 vid, skey, basever, channelid
4. 微信读书免费图书馆 -> 捕获免费图书领书凭证
5. 微信读书翻牌游戏 -> 捕获翻牌 H5 Cookie (wr_vid, wr_skey)
*/

const AUTH_KEY = "weread_auth_v2";
const WEB_COOKIE_KEY = "weread_web_cookie";
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
    if (typeof $request === "undefined") {
        $done({});
        return;
    }

    let url = $request.url || "";
    let headers = $request.headers || {};
    let existing = getStoredAuth();
    let updated = false;

    // ============================================================
    // 1. 微信读书网页端 (weread.qq.com/web/)
    // ============================================================
    if (url.indexOf("://weread.qq.com/web/") !== -1 || (url.indexOf("://weread.qq.com/") !== -1 && url.indexOf("flip-card-game") === -1 && url.indexOf("sentry") === -1 && url.indexOf("cls") === -1)) {
        let cookie = getHeader(headers, "cookie") || "";
        if (cookie) {
            let c = parseCookieStr(cookie);
            if (c.wr_vid && c.wr_skey) {
                let changed = (existing.webVid !== c.wr_vid || existing.webSkey !== c.wr_skey);
                existing.webVid = c.wr_vid;
                existing.webSkey = c.wr_skey;
                if (!existing.vid) existing.vid = c.wr_vid;
                existing.webUa = headers["user-agent"] || headers["User-Agent"] || existing.webUa || "";
                existing.webTime = Date.now();
                $.setdata(cookie, WEB_COOKIE_KEY);
                saveAuth(existing);
                if (changed) {
                    $.msg("微信读书 · 网页端", "✅ Cookie 获取成功", "wr_vid: " + c.wr_vid + "\nwr_skey: " + c.wr_skey.slice(0, 8) + "...");
                }
                $.log("[WeRead] 网页端 Cookie 已捕获: wr_vid=" + c.wr_vid);
            }
        }
        $done({});
        return;
    }

    // ============================================================
    // 2. 微信读书翻牌游戏 (weread.qq.com/flip-card-game)
    // ============================================================
    if (url.indexOf("://weread.qq.com/flip-card-game") !== -1) {
        let cookie = getHeader(headers, "cookie") || "";
        if (cookie) {
            let c = parseCookieStr(cookie);
            if (c.wr_vid && c.wr_skey) {
                let changed = (existing.wrVid !== c.wr_vid || existing.wrSkey !== c.wr_skey);
                existing.wrVid = c.wr_vid;
                existing.wrSkey = c.wr_skey;
                if (!existing.vid) existing.vid = c.wr_vid;
                existing.flipUa = headers["user-agent"] || headers["User-Agent"] || existing.flipUa || "";
                existing.flipTime = Date.now();
                saveAuth(existing);
                if (changed) {
                    $.msg("微信读书 · 翻牌游戏", "✅ Cookie 获取成功", "wr_vid: " + c.wr_vid + "\nwr_skey: " + c.wr_skey.slice(0, 8) + "...");
                }
                $.log("[WeRead] 翻牌游戏 Cookie 已捕获: wr_vid=" + c.wr_vid);
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
            $.msg("微信读书 · App端", sub, body);
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
        if (vid) existing.vid = String(vid);
        if (skey) existing.skey = skey;
        for (let k in headers) {
            let lk = k.toLowerCase();
            if (lk === "basever") existing.basever = headers[k];
            if (lk === "channelid") existing.channelid = headers[k];
            if (lk === "user-agent") existing.ua = headers[k];
        }
        existing.freeTime = Date.now();
        saveAuth(existing);
        $.log("[WeRead] 免费图书馆凭据已校验记录: vid=" + vid);
        $done({});
        return;
    }

    // ============================================================
    // 5. 微信读书 App 常规 API (user/profile, pay/balance, mobileSync 等)
    // ============================================================
    let vid = getHeader(headers, "vid");
    let skey = getHeader(headers, "skey");

    if (vid && skey) {
        let isFirstOrChanged = (existing.vid !== String(vid) || existing.skey !== skey);
        existing.vid = String(vid);
        existing.skey = skey;
        for (let k in headers) {
            let lk = k.toLowerCase();
            if (lk === "basever") existing.basever = headers[k];
            if (lk === "channelid") existing.channelid = headers[k];
            if (lk === "user-agent") existing.ua = headers[k];
            if (lk === "deviceid") existing.deviceId = headers[k];
        }

        // 尝试从日志或追踪 URL 中捕获 device_id
        if (!existing.deviceId) {
            let m = url.match(/[?&]device_?id=([a-zA-Z0-9_-]+)/i);
            if (m) existing.deviceId = m[1];
        }

        existing.authTime = Date.now();
        saveAuth(existing);

        if (isFirstOrChanged) {
            $.msg("微信读书 · App端", "✅ App 凭据获取成功", "vid: " + vid + "\nskey: " + skey.slice(0, 4) + "****");
            $.log("[WeRead] App 基础凭据已更新: vid=" + vid);
        }
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

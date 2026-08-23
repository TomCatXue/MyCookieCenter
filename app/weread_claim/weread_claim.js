/*
#!name=微信读书自动领取奖励
#!desc=定时自动领取已达标阅读时长奖励（书币/体验卡），可切换偏好；每周二 20:00 自动翻牌游戏
#!author=Codex
#!homepage=https://github.com/TomCatXue/MyCookieCenter
#!icon=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/icons/weread.png
#!tag=微信读书,自动领取,阅读奖励,翻牌游戏

[Argument]
# 奖励偏好: 1=优先体验卡, 2=优先书币
prefer_coin = input,2,tag=奖励选择,desc=1=优先体验卡 2=优先书币
# 抓取Cookie: 开=自动抓取登录信息(vid/skey/refreshToken), 关=不抓取（需手动配置）
capture_cookie = switch,true,tag=抓取Cookie,desc=开启：自动抓取登录信息 / 关闭：不抓取

[MITM]
hostname = i.weread.qq.com, weread.qq.com

[Script]
# 捕获鉴权信息（vid + skey，而非 Cookie）：打开微信读书 App 随便刷一下（几乎任何页面都会触发）
http-request ^https?://i\.weread\.qq\.com/.* script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag6, tag=WeReadClaim Auth, requires-body=false, enable={capture_cookie}

# 捕获 /login 请求体（Base64 编码），提取 deviceId
http-request POST ^https?://i\.weread\.qq\.com/login script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag6, tag=WeReadClaim Login, requires-body=true, enable={capture_cookie}

# 捕获 /login 响应体，提取 vid/skey/refreshToken（自动刷新的前置条件）
http-response POST ^https?://i\.weread\.qq\.com/login script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag6, tag=WeReadClaim LoginResp, requires-body=true, enable={capture_cookie}

# 捕获 weread.qq.com Cookie（wr_skey/wr_vid，翻牌游戏用）
http-request ^https?://weread\.qq\.com/.* script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag6, tag=WeReadClaim FlipCookie, requires-body=false, enable={capture_cookie}

# 定时领取：每晚 23:00 自动检查并领取
# 不设 argument=，让 Loon 自动把 [Argument] 值注入 $argument；http-request 中转存储兜底
cron "0 23 * * *" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag6, tag=WeReadClaim 签到, enable=true

# 翻牌游戏：每周二 20:00 自动翻牌
cron "0 20 * * 2" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag6, argument="task=flip", tag=WeReadClaim 翻牌, enable=true
*/

const AUTH_KEY = "weread_auth_v2";
const FLIP_STATE_KEY = "weread_flip_state_v1";
const SCRIPT_VERSION = "2026-08-23-diag6";
const API = "https://i.weread.qq.com";
const FLIP_API = "https://weread.qq.com/flip-card-game/api";
const PF = "weread_wx-2001-iap-2001-iphone";

const FLIP_CARD_ORDER = [2, 5, 4, 7, 8, 6, 0, 1, 3];

let $ = new Env("WeRead");

async function main() {
    try {
        if (typeof $request !== "undefined") {
            saveAuth();
            $done({});
            return;
        }

        // BoxJS 诊断模式：$argument 在 Loon cron 中存在、在 BoxJS 中缺失，借此区分运行环境，
        // 保证 Loon 定时任务绝不会误触诊断（即使开关被遗忘也不会影响签到/翻牌）。
        if (typeof $argument === "undefined" && isDiagOn()) {
            await runDiagnose();
            $.setdata("", "weread_diagnose"); // 一次性自清零，避免重复触发
            $done({});
            return;
        }

        // cron 任务：通过 $argument 区分任务类型
        let arg = parseArgument(typeof $argument !== "undefined" ? $argument : {});
        if (arg.task === "flip") {
            await runFlipCard();
        } else {
            await runClaim();
        }
    } catch (e) {
        $.msg("WeRead", "执行异常", String(e));
    }

    $done({});
}

if (typeof module === "undefined" || !module.exports) {
    main();
}


function saveAuth() {
    let h = $request.headers || {};
    let url = ($request.url || "");

    // --- weread.qq.com (非 i.weread.qq.com): Cookie-based auth (wr_vid / wr_skey) ---
    // 注意：不能用 indexOf("weread.qq.com")，因为 i.weread.qq.com 也含此子串
    // 用 "://weread.qq.com" 精确匹配协议后的域名开头
    if (url.indexOf("://weread.qq.com") !== -1) {
        let cookie = getHeader(h, "cookie") || "";
        if (!cookie) return;

        let wrVid = "", wrSkey = "";
        cookie.split(";").forEach(pair => {
            let eq = pair.indexOf("=");
            if (eq > 0) {
                let name = decodeURIComponent(pair.slice(0, eq).trim());
                let val = decodeURIComponent(pair.slice(eq + 1).trim());
                if (name === "wr_vid") wrVid = val;
                if (name === "wr_skey") wrSkey = val;
            }
        });

        if (wrVid && wrSkey) {
            // 翻牌游戏的 wr_vid/wr_skey 存到独立字段，不覆盖 i.weread.qq.com 的 vid/skey
            let existing = getAuth() || {};
            let auth = {
                vid: existing.vid || "",
                skey: existing.skey || "",
                wrVid: wrVid,
                wrSkey: wrSkey,
                flipUa: h["user-agent"] || existing.flipUa || existing.ua || "",
                refreshToken: existing.refreshToken || "",
                deviceId: existing.deviceId || "",
                basever: existing.basever || "",
                channelid: existing.channelid || "",
                ua: existing.ua || "",
                authTime: Date.now()
            };

            $.setdata(JSON.stringify(auth), AUTH_KEY);
            $.log("[WeRead] weread.qq.com Cookie saved: wrVid=" + wrVid.slice(0, 8) + "...");
        }
        return;
    }

    // --- /login 响应：从 RESPONSE body 提取 vid/skey/refreshToken ---
    // /login 请求本身不带 vid/skey header（它们在响应中返回），必须在下方 vid/skey 检查之前处理
    if (url.indexOf("/login") !== -1 && typeof $response !== "undefined" && $response.body) {
        let loginData = decode($response.body);
        if (loginData && loginData.vid && loginData.skey) {
            let existing = getAuth() || {};
            let auth = {
                vid: loginData.vid,
                skey: loginData.skey,
                refreshToken: loginData.refreshToken || existing.refreshToken || "",
                deviceId: existing.deviceId || "",
                openId: loginData.openId || existing.openId || "",
                basever: existing.basever || "",
                channelid: existing.channelid || "",
                ua: existing.ua || "",
                wrVid: existing.wrVid || "",
                wrSkey: existing.wrSkey || ""
            };
            // 从请求体补充 deviceId
            if (typeof $request !== "undefined" && $request.body) {
                let reqBody = decode($request.body);
                if (reqBody && reqBody.deviceId) auth.deviceId = reqBody.deviceId;
            }
            auth.authTime = Date.now();
            $.setdata(JSON.stringify(auth), AUTH_KEY);
            $.log("[WeRead] /login response saved: vid=" + String(loginData.vid).slice(0, 8)
                + "..., refreshToken=" + (auth.refreshToken ? "present" : "missing")
                + ", deviceId=" + (auth.deviceId ? "present" : "missing"));
        }
        return;
    }

    // --- /login 请求：从 REQUEST body 提取 deviceId + refreshToken ---
    // /login 请求本身不带 vid/skey header，必须在下方 vid/skey 检查之前处理
    if (url.indexOf("/login") !== -1 && typeof $request !== "undefined" && $request.body) {
        let reqBody = decode($request.body);
        if (reqBody) {
            let existing = getAuth() || {};
            let updated = false;
            if (reqBody.deviceId && !existing.deviceId) {
                existing.deviceId = reqBody.deviceId;
                updated = true;
            }
            if (reqBody.refreshToken && !existing.refreshToken) {
                existing.refreshToken = reqBody.refreshToken;
                updated = true;
            }
            if (updated) {
                $.setdata(JSON.stringify(existing), AUTH_KEY);
                $.log("[WeRead] /login request: deviceId=" + (existing.deviceId ? "present" : "missing")
                    + ", refreshToken=" + (existing.refreshToken ? "present" : "missing"));
            }
        }
        return;
    }

    // --- i.weread.qq.com: Header-based auth (vid / skey) ---
    let vid, skey;
    for (let k in h) {
        let key = k.toLowerCase();
        if (key === "vid") vid = h[k];
        if (key === "skey") skey = h[k];
    }

    if (!vid || !skey) return;

    // Skip if auth already saved with same credentials — avoid redundant writes
    let existing = getAuth() || {};
    if (existing.vid === vid && existing.skey === skey) return;

    // Auth is new or changed — extract all fields and save
    let auth = { vid, skey };
    // 保留已有的翻牌凭证和刷新字段
    if (existing.wrVid) auth.wrVid = existing.wrVid;
    if (existing.wrSkey) auth.wrSkey = existing.wrSkey;
    if (existing.refreshToken) auth.refreshToken = existing.refreshToken;
    if (existing.deviceId) auth.deviceId = existing.deviceId;
    if (existing.openId) auth.openId = existing.openId;
    for (let k in h) {
        let key = k.toLowerCase();
        if (key === "basever") auth.basever = h[k];
        if (key === "channelid") auth.channelid = h[k];
        if (key === "user-agent") auth.ua = h[k];
        if (key === "deviceid") auth.deviceId = h[k];
    }

    // /login 响应和请求已在上方独立处理（vid/skey 检查之前），此处不会到达

    auth.authTime = Date.now();
    $.setdata(JSON.stringify(auth), AUTH_KEY);
    $.log("[WeRead] auth saved, deviceId=" + (auth.deviceId ? "present" : "missing")
        + ", refreshToken=" + (auth.refreshToken ? "present" : "missing"));

}


function getHeader(headers, name) {
    let target = String(name).toLowerCase();
    for (let key in (headers || {})) {
        if (String(key).toLowerCase() === target) return headers[key];
    }
    return "";
}


function getAuth() {
    let data = $.getdata(AUTH_KEY);
    if (!data) return null;

    try {
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}


function parseArgument(arg) {
    // Loon cron 传入的 $argument 是字符串 "prefer_coin=switch,true&..."
    // 需解析为对象 { prefer_coin: "switch,true", capture_cookie: "switch,true" }
    if (typeof arg === "object") return arg;
    let obj = {};
    if (typeof arg === "string" && arg) {
        arg.split("&").forEach(pair => {
            let eq = pair.indexOf("=");
            if (eq > 0) {
                obj[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
            }
        });
    }
    return obj;
}


function getHeaders(a) {
    let h = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": a.ua || "WeRead",
        "channelid": a.channelid || "AppStore",
        "basever": a.basever || "",
        "v": a.basever || "",
        "vid": a.vid
    };
    // skey 必传：方案 C 已确认为不可行，不带 skey 返回 401
    if (a.skey) h.skey = a.skey;
    return h;
}


function encode(obj) {
    let str = JSON.stringify(obj);

    if (typeof $base64 !== "undefined") {
        return $base64.encode(str);
    }

    return str;
}


function decode(str) {
    try {
        if (typeof $base64 !== "undefined") {
            return JSON.parse($base64.decode(str));
        }

        return JSON.parse(str);
    } catch (e) {
        return null;
    }
}


// Build a human-readable description for a claimed reward
function describeChoice(choice, resp) {
    // Try to extract detail from exchange response first
    if (resp && resp.body) {
        let ex = decode(resp.body);
        if (ex) {
            if (ex.awardName) return ex.awardName;
            if (ex.exchangeName) return ex.exchangeName;
            if (ex.desc) return ex.desc;
            if (ex.choiceName) return ex.choiceName;
        }
    }
    // Then try fields on the choice object itself
    if (choice.choiceName) return choice.choiceName;
    if (choice.name) return choice.name;
    if (choice.desc) return choice.desc;
    // Fallback to choiceType-based description
    if (choice.choiceType === 2) return "书币";
    if (choice.choiceType === 1) return "体验卡";
    return "奖励";
}


// 解析奖励偏好 prefer_coin。
// Loon [Argument] 段的值通过 $persistentStore.read("prefer_coin") 读取（见 Env.getdata），
// 返回用户选择的 "1"(优先体验卡) / "2"(优先书币) 字符串；兼容个别版本带 "input," 前缀。
// 1=优先体验卡, 2=优先书币（默认）。
function resolvePreferCoin(rawPrefer) {
    let preferVal = rawPrefer;
    if (typeof preferVal === "string") {
        preferVal = preferVal.replace(/^(input|switch),/, "");
    }
    let preferCoin = true; // 默认书币优先
    if (preferVal === 1 || preferVal === "1" || preferVal === false || preferVal === "false") {
        preferCoin = false; // 体验卡优先
    }
    return {
        raw: rawPrefer,
        preferCoin: preferCoin,
        firstType: preferCoin ? 2 : 1,
        secondType: preferCoin ? 1 : 2
    };
}


function post(url, body, headers) {
    return new Promise((resolve, reject) => {

        $httpClient.post({
            url,
            headers,
            body,
            timeout: 10000
        }, (err, res, data) => {

            if (err) reject(err);
            else resolve({
                status: res.status,
                body: data
            });

        });

    });
}


// 从 renewal 响应中提取新 skey（Set-Cookie 优先，body 兜底）。
// 从 refreshAppSkeyViaWeb / tryWebRenewal 中抽出，供诊断的纯查询路径复用，避免副作用。
function extractSkeyFromResponse(res, data) {
    let setCookie = "";
    if (res.headers) {
        let sc = res.headers["Set-Cookie"] || res.headers["set-cookie"] || "";
        if (Array.isArray(sc)) setCookie = sc.join("; ");
        else setCookie = String(sc);
    }

    let newSkey = "";
    setCookie.split(/;|,/).forEach(part => {
        part = part.trim();
        if (part.startsWith("wr_skey=")) {
            newSkey = decodeURIComponent(part.substring("wr_skey=".length));
        }
    });

    if (!newSkey) {
        let bodyData = null;
        try { bodyData = JSON.parse(data); } catch (e) { }
        if (bodyData && (bodyData.skey || bodyData.wr_skey)) {
            newSkey = bodyData.skey || bodyData.wr_skey;
        }
    }

    return newSkey;
}


// 诊断用纯查询 renewal：与 refreshAppSkeyViaWeb 同样的请求，但不回写 auth/存储，
// 只返回 { ok, newSkey, status, error }，便于诊断在不改变运行态的情况下判断结果。
// opts 可选: { body, contentType, extraHeaders } — 缺省走基线格式 (编码 rq / JSON)。
async function callRenewalProbe(vid, skey, ua, opts) {
    opts = opts || {};
    if (!vid || !skey) {
        return { ok: false, error: "无 vid/skey" };
    }

    let body = opts.body || JSON.stringify({ "rq": "%2Fweb%2Fbook%2Fread", "ql": false });
    let headers = {
        "User-Agent": ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        "Content-Type": opts.contentType || "application/json",
        "Origin": "https://weread.qq.com",
        "Referer": "https://weread.qq.com/",
        "Cookie": "wr_skey=" + skey + "; wr_vid=" + vid
    };
    if (opts.extraHeaders) {
        for (let k in opts.extraHeaders) headers[k] = opts.extraHeaders[k];
    }

    return new Promise((resolve) => {
        $httpClient.post({
            url: "https://weread.qq.com/web/login/renewal",
            headers: headers,
            body: body,
            timeout: 10000
        }, (err, res, data) => {
            if (err) {
                resolve({ ok: false, error: "请求失败: " + String(err) });
                return;
            }
            if (res.status !== 200) {
                resolve({ ok: false, status: res.status, body: String(data).slice(0, 120) });
                return;
            }
            let newSkey = extractSkeyFromResponse(res, data);
            if (newSkey) {
                resolve({ ok: true, newSkey: newSkey, status: 200 });
            } else {
                resolve({ ok: false, status: 200, error: "响应中未找到 skey, body=" + String(data).slice(0, 120) });
            }
        });
    });
}


// BoxJS 诊断开关读取。BoxJS switch 存储形如 "switch,true" 或纯 "true"，
// 取逗号后末段判定，兼容两种格式。
function isDiagOn() {
    let raw = String($.getdata("weread_diagnose") || "").trim();
    if (!raw) return false;
    let parts = raw.split(",");
    let val = parts[parts.length - 1];
    return val === "true" || val === "1";
}


// 方案B 同源假设诊断（BoxJS 触发，$.log 输出到 BoxJS 日志区）。
// 三步：①探测当前 skey 对 App API 有效性 → ②网页 renewal 取新 skey → ③用新 skey 探测 App API。
// 由此区分 cron 401 失败的根因：
//   根因甲 = renewal 拒绝过期 skey（可修复：改为过期前主动续期）
//   根因乙 = 新 skey 对 App API 无效（同源假设不成立，方案B 死，应移除）
// 若新 skey 对 App 有效，附带回写（诊断兼做一次主动续期）。
async function runDiagnose() {
    $.log("════════════════════════════════════════");
    $.log("[WeRead 诊断] 方案B 同源假设验证开始 (v" + SCRIPT_VERSION + ")");
    $.log("════════════════════════════════════════");

    let auth = getAuth();
    if (!auth || !auth.vid || !auth.skey) {
        $.log("[WeRead 诊断] ✗ 无认证信息或 vid/skey 缺失");
        $.log("[WeRead 诊断] 请先打开微信读书 App 触发抓取，再运行诊断");
        $.msg("WeRead 诊断", "无法运行", "无 vid/skey，请先抓取认证");
        $.log("════════════════════════════════════════");
        return;
    }

    $.log("[WeRead 诊断] vid=" + String(auth.vid).slice(0, 8) + "... skey=" + String(auth.skey).slice(0, 8) + "...");
    let hasWeb = !!(auth.wrVid && auth.wrSkey);
    $.log("[WeRead 诊断] wrVid=" + (auth.wrVid ? String(auth.wrVid).slice(0, 8) + "..." : "(无)") + " wrSkey=" + (auth.wrSkey ? String(auth.wrSkey).slice(0, 8) + "..." : "(无)"));
    $.log("[WeRead 诊断] skey 与 wrSkey: " + (hasWeb ? (auth.skey === auth.wrSkey ? "同值 (App skey == web wr_skey)" : "异值 (App skey ≠ web wr_skey)") : "无法对比 (无 wrSkey)"));
    $.log("");

    // 步骤1: 当前 skey 对 App API 的有效性
    $.log("[WeRead 诊断] ── 步骤1: 探测当前 skey 对 App API 是否有效 ──");
    let probe1, step1Err = null;
    try {
        probe1 = await post(API + "/weekly/exchange", buildExchangeQuery(), getHeaders(auth));
    } catch (e) {
        step1Err = String(e);
        probe1 = { status: -1, body: "" };
    }
    if (step1Err) {
        $.log("[WeRead 诊断] 步骤1 结果: HTTP 调用异常 — " + step1Err);
        $.log("[WeRead 诊断] BoxJS 运行环境的 $httpClient 无法连通 i.weread.qq.com，诊断中止。");
        $.log("[WeRead 诊断] 可能原因: ①capture_cookie 开关拦截了探测请求; ②网络/代理路由问题; ③Loon 子请求超时");
        $.msg("WeRead 诊断", "HTTP 异常 (步骤1)", step1Err);
        $.log("════════════════════════════════════════");
        return;
    }
    let skeyValid = (probe1.status === 200);
    $.log("[WeRead 诊断] 步骤1 结果: HTTP " + probe1.status + (skeyValid ? " → 当前 skey 有效 ✓" : " → 当前 skey 已失效 ✗"));
    if (skeyValid) {
        $.log("[WeRead 诊断] 当前 skey 仍有效，正好可验证 renewal 新 skey 对 App 是否同样有效 (根因乙)");
    } else {
        $.log("[WeRead 诊断] 当前 skey 已失效，这正是 cron 401 现场，可直接观察 renewal 能否救回");
    }
    $.log("");

    // 步骤2: 用正确/错误的 Cookie 分别调 renewal，验证 -2013 根因
    // 已知: App skey ≠ Web wrSkey（见头部打印）。上轮诊断用 auth.skey 作 Cookie 是错误的。
    // 本轮同时测两种 Cookie，确认端点是否可用。
    $.log("[WeRead 诊断] ── 步骤2: 调用网页版 /web/login/renewal ──");
    let cookieVariants = [
        { label: "App skey 作 Cookie (旧诊断路径)", skey: auth.skey },
        { label: "Web wrSkey 作 Cookie (正确路径)", skey: auth.wrSkey || auth.skey }
    ];
    let renewalOK = null, newSkey = null;
    for (let cv of cookieVariants) {
        let r = await callRenewalProbe(auth.vid, cv.skey, auth.ua, {
            body: JSON.stringify({ rq: "%2Fweb%2Fbook%2Fread", ql: false })
        });
        let line = r.ok
            ? "成功, 新 skey=" + String(r.newSkey).slice(0, 8) + "..."
            : "失败 — " + (r.error || ("HTTP " + r.status + (r.body ? " body=" + r.body : "")));
        $.log("[WeRead 诊断]     " + cv.label + ": " + line);
        if (r.ok && cv.label.indexOf("正确") !== -1) {
            renewalOK = true;
            newSkey = r.newSkey;
        }
    }
    $.log("");

    if (!renewalOK) {
        $.log("[WeRead 诊断] ★ 结论: 即使使用正确的 Web wrSkey Cookie，renewal 仍失败 ★");
        $.log("[WeRead 诊断] /web/login/renewal 端点格式可能已彻底变更。");
        $.log("[WeRead 诊断] 下一步: 需抓包微信读书网页版真实的 /web/login/renewal 请求，对比 body/header。");
        $.log("[WeRead 诊断] 翻牌游戏 tryWebRenewal 暂不可用，待抓包确认后端格式后修复。");
        $.msg("WeRead 诊断", "renewal 彻底失败", "格式已变，需抓包");
        $.log("════════════════════════════════════════");
        return;
    }

    $.log("[WeRead 诊断] 步骤2 结果: Web wrSkey 作 Cookie 成功 ✓");
    $.log("[WeRead 诊断] 确认: 旧诊断用错 Cookie (auth.skey 而非 auth.wrSkey)，导致 -2013。");
    $.log("[WeRead 诊断] 端点本身格式正确 (rq+ql:false+Origin/Referer)，tryWebRenewal 对翻牌仍有效。");
    $.log("");

    // 步骤3: 用 renewal 新 skey 探测 App API（验证同源假设）
    // 已知 App skey ≠ web wrSkey，但新 wrSkey 可能因某种机制仍能访问 App API，实测为准。
    $.log("[WeRead 诊断] ── 步骤3: 用 renewal 新 wrSkey 探测 App API ──");
    let testAuth = Object.assign({}, auth, { skey: newSkey, wrSkey: newSkey });
    let probe2, step3Err = null;
    try {
        probe2 = await post(API + "/weekly/exchange", buildExchangeQuery(), getHeaders(testAuth));
    } catch (e) {
        step3Err = String(e);
        probe2 = { status: -1, body: "" };
    }
    if (step3Err) {
        $.log("[WeRead 诊断] 步骤3 结果: HTTP 调用异常 — " + step3Err);
        $.log("[WeRead 诊断] 不回写新 skey (未确认其 App 有效性)。");
        $.msg("WeRead 诊断", "步骤3 HTTP 异常", step3Err);
    } else {
        let newSkeyWorks = (probe2.status === 200);
        $.log("[WeRead 诊断] 步骤3 结果: HTTP " + probe2.status + (newSkeyWorks ? " → 新 wrSkey 对 App 有效 ✓" : " → 新 wrSkey 对 App 无效 ✗"));
        $.log("");
        $.log("[WeRead 诊断] ── 综合结论 ──");
        if (newSkeyWorks) {
            $.log("[WeRead 诊断] ★ 结论: 同源假设成立（出乎意料）+ 方案B 可用 ★");
            $.log("[WeRead 诊断] 虽然 App skey ≠ web wrSkey 值不同，但 renewal 返回的新 wrSkey 居然对 App API 有效。");
            $.log("[WeRead 诊断] 修复 refreshAppSkeyViaWeb 使用 wrSkey 作 Cookie 即可恢复方案B。");
            $.msg("WeRead 诊断", "同源假设成立", "新 wrSkey 对 App 有效；需修复 Cookie");
            // 回写有效新 skey
            auth.skey = newSkey;
            auth.wrSkey = newSkey;
            auth.skeyRenewTime = Date.now();
            $.setdata(JSON.stringify(auth), AUTH_KEY);
            $.log("[WeRead 诊断] 已回写有效新 skey ✓");
        } else {
            $.log("[WeRead 诊断] ★ 结论: 根因乙确认 — 同源假设不成立 ★");
            $.log("[WeRead 诊断] App skey 与 Web wrSkey 是两套完全独立的凭据体系。");
            $.log("[WeRead 诊断] 网页 renewal 返回的 wrSkey 无法用于 App API (HTTP " + probe2.status + ")。");
            $.log("[WeRead 诊断] 方案B 不可行: refreshAppSkeyViaWeb 应从 runClaim 中移除。");
            $.log("[WeRead 诊断] tryWebRenewal 对翻牌游戏仍保留 (wrSkey 续期 wrSkey 是有效的)。");
            $.msg("WeRead 诊断", "根因乙确认", "方案B 不可行");
        }
    }
    $.log("════════════════════════════════════════");
}


// 构建查询请求体（复用）
function buildExchangeQuery() {
    return encode({
        awardLevelId: 0,
        unread: 1,
        isExchangeAward: 0,
        pf: PF,
        awardChoiceType: 0
    });
}

async function runClaim() {

    let auth = getAuth();

    if (!auth) {
        $.msg("WeRead", "没有认证", "点击打开微信读书捕获登录信息", "weread://");
        return;
    }

    // 快速检测 skey 是否有效：先发一个查询请求
    let probe = await post(API + "/weekly/exchange", buildExchangeQuery(), getHeaders(auth));

    if (probe.status === 401) {
        // 诊断已确认：App skey ≠ Web wrSkey，方案B 不可行。
        // 网页 renewal 续期的是 wrSkey（web Cookie），对 App API 无效。
        // 唯一自动续期路径：/login 响应捕获（用户打开 App 时自动刷新）。
        // 不清空 auth：保留 wrVid/wrSkey 给翻牌游戏，保留 vid 供下次捕获复用。
        $.log("[WeRead] 401 — skey 已过期，无法自动续期");
        $.log("[WeRead] 请打开微信读书 App，脚本会自动捕获新的 vid/skey");
        $.msg("WeRead", "认证已过期", "点击打开微信读书自动刷新", "weread://");
        return;
    }

    if (probe.status !== 200) {
        $.msg("WeRead", "请求失败", "HTTP " + probe.status);
        return;
    }

    // Probe succeeded, proceed with claim
    return await runClaimWithAuth(auth, probe.body);
}


// Core claim logic, given valid auth and optional cached query result
async function runClaimWithAuth(auth, cachedBody) {

    let data;
    let queryBody = cachedBody;

    if (!cachedBody) {
        let result = await post(
            API + "/weekly/exchange",
            encode({
                awardLevelId: 0,
                unread: 1,
                isExchangeAward: 0,
                pf: PF,
                awardChoiceType: 0
            }),
            getHeaders(auth)
        );

        if (result.status !== 200) {
            $.msg("WeRead", "请求失败", "HTTP " + result.status);
            return;
        }
        queryBody = result.body;
    }

    data = decode(queryBody);

    if (!data) {
        $.msg("WeRead", "解析失败", queryBody.slice(0, 100));
        return;
    }


    let awards = [];

    if (data.readtimeAwards)
        data.readtimeAwards.forEach(a => { a._src = "阅读时长"; awards.push(a); });

    if (data.readdayAwards)
        data.readdayAwards.forEach(a => { a._src = "阅读天数"; awards.push(a); });


    let count = 0;
    let details = [];

    // 读取奖励偏好：Loon 把 [Argument] 段参数值存在 persistentStore（key = 参数名），
    // 直接用 $.getdata("prefer_coin") 读取用户在插件界面选择的值。
    // 注意：$argument 只对应 argument="..." 里的静态字符串，无法读取 [Argument] 段参数。
    let prefer = resolvePreferCoin($.getdata("prefer_coin"));
    let firstType = prefer.firstType;
    let secondType = prefer.secondType;
    $.log("[WeRead] prefer_coin 原始值=" + String(prefer.raw) + ", preferCoin=" + prefer.preferCoin + ", firstType=" + firstType);

    for (let item of awards) {

        if (item.awardStatus !== 1)
            continue;


        let choices = item.awardChoices || [];

        let choice =
            choices.find(x => x.choiceType === firstType && x.canChoice === 1)
            ||
            choices.find(x => x.choiceType === secondType && x.canChoice === 1);


        if (!choice)
            continue;


        let r = await post(
            API + "/weekly/exchange",
            encode({
                unread: 1,
                awardChoiceType: choice.choiceType,
                awardLevelId: item.awardLevelId,
                isExchangeAward: 1,
                pf: PF
            }),
            getHeaders(auth)
        );


        if (r.status === 401) {
            $.msg("WeRead", "认证已过期", "点击打开微信读书自动刷新", "weread://");
            return;
        }

        if (r.status === 200) {
            count++;
            details.push((item._src || "奖励") + "·" + describeChoice(choice, r));
        }

    }


    if (count > 0)
        $.msg("WeRead", "领取完成", "成功领取 " + count + " 个奖励\n" + details.join("、"));
    else
        $.msg("WeRead", "领取完成", "暂无可领取的奖励");

}


// ── GET helper ──────────────────────────────────────────

function get(url, headers) {
    return new Promise((resolve, reject) => {
        $httpClient.get({
            url,
            headers,
            timeout: 10000
        }, (err, res, data) => {
            if (err) reject(err);
            else resolve({ status: res.status, body: data });
        });
    });
}

// ── Flip card helpers ───────────────────────────────────

function pickNextFlip(data) {
    let cards = data.cardList || [];
    let used = {};
    cards.forEach(c => {
        if (typeof c.cardIndex === "number" && c.cardIndex >= 0) {
            used[c.cardIndex] = true;
        }
    });

    let giftIndex = Array.isArray(data.flipList) ? data.flipList.length : Object.keys(used).length;
    let cardIndex = -1;
    for (let i = 0; i < FLIP_CARD_ORDER.length; i++) {
        let candidate = FLIP_CARD_ORDER[i];
        if (!used[candidate]) {
            cardIndex = candidate;
            break;
        }
    }

    return cardIndex >= 0 ? { cardIndex, giftIndex } : null;
}

function getSavedFlipState() {
    let raw = $.getdata(FLIP_STATE_KEY);
    if (!raw) return null;

    try {
        let saved = JSON.parse(raw);
        let maxAge = 8 * 24 * 60 * 60 * 1000;
        if (saved.savedAt && Date.now() - saved.savedAt > maxAge) return null;
        return saved.data || null;
    } catch (e) {
        return null;
    }
}

function saveFlipState(data) {
    if (!data) return;
    $.setdata(JSON.stringify({ savedAt: Date.now(), data }), FLIP_STATE_KEY);
}

function clearFlipState() {
    $.setdata("", FLIP_STATE_KEY);
}

function describeCardPrize(card) {
    if (!card) return "未知奖励";
    if (card.bookInfo && card.bookInfo.title) return card.bookInfo.title;
    if (card.cardType === "money" || card.type === "money") return "书币";
    if (card.cardType === "infinite" || card.type === "infinite") return "体验卡";
    if (card.cardType === "book") {
        return card.bookInfo && card.bookInfo.title ? card.bookInfo.title : "书籍";
    }
    return "未知奖励";
}

function describeFlipResult(data, justFlippedIndex) {
    if (!data) return "未知奖励";
    if (data.prizeName) return data.prizeName;
    if (data.reward) return data.reward;
    if (data.giftName) return data.giftName;

    let cards = Array.isArray(data.cardList) ? data.cardList : [];
    // 一次运行里多张牌都已 status===3，必须按本次刚翻的 cardIndex 定位，否则会误报早先那张的奖励
    if (typeof justFlippedIndex === "number") {
        for (let i = 0; i < cards.length; i++) {
            if (cards[i].cardIndex === justFlippedIndex) {
                return describeCardPrize(cards[i]);
            }
        }
    }
    for (let i = 0; i < cards.length; i++) {
        let s = cards[i].status;
        if (s === 1 || s === 2 || s === 3 || s === 4) {
            return describeCardPrize(cards[i]);
        }
    }

    return "未知奖励";
}

// Parse Cookie string into key-value object
function parseCookie(str) {
    let obj = {};
    if (!str) return obj;
    str.split(";").forEach(pair => {
        let eq = pair.indexOf("=");
        if (eq > 0) {
            obj[decodeURIComponent(pair.slice(0, eq).trim())] = decodeURIComponent(pair.slice(eq + 1).trim());
        }
    });
    return obj;
}

// Build Cookie header for weread.qq.com
function getFlipHeaders(auth) {
    // 翻牌游戏用 wrVid/wrSkey（Cookie 认证），与 i.weread.qq.com 的 vid/skey 分开存储
    let wrVid = auth.wrVid || auth.vid || "";
    let wrSkey = auth.wrSkey || auth.skey || "";
    let flipUa = auth.flipUa || auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;WeRead/10.2.1 (iPhone; iOS 26.3.1; Scale/3.00)";
    return {
        "User-Agent": flipUa,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": "https://weread.qq.com/flip-card-game?isAnimateNavBarBackground=1&isShowNavBarShadow=0&isStatusbarLight=1&backgroundColor=%25234CB6FA&navBarTintColor=%2523ffffff&navBarTitleColor=%2523ffffff&navBarBackgroundColor=%25234CB6FA",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "priority": "u=3, i",
        "Cookie": "wr_skey=" + wrSkey + "; wr_vid=" + wrVid
    };
}

// Try to flip all available cards (max 6 flips per week)
async function runFlipCardDirect(auth) {
    $.log("[WeRead] 翻牌游戏 — 开始... version=" + SCRIPT_VERSION);

    if (!auth) auth = getAuth();

    if (!auth || !(auth.wrVid || auth.vid) || !(auth.wrSkey || auth.skey)) {
        $.msg("WeRead", "翻牌", "点击打开微信读书捕获登录信息", "weread://");
        return;
    }

    let results = [];
    let attempts = 0;
    let state = getSavedFlipState() || {};
    const MAX_ATTEMPTS = 6;

    while (attempts < MAX_ATTEMPTS) {
        let target = pickNextFlip(state);

        if (!target && state && state.cardList) {
            clearFlipState();
            state = {};
            target = pickNextFlip(state);
        }

        if (!target) {
            $.log("[WeRead] 翻牌 — 没有未翻开的卡片");
            break;
        }

        $.log("[WeRead] 翻牌 — 第 " + (attempts + 1) + "/" + MAX_ATTEMPTS
            + " 次, cardIndex=" + target.cardIndex + ", giftIndex=" + target.giftIndex);

        let flipUrl = FLIP_API + "/flipCardFlip?cardIndex=" + target.cardIndex
            + "&giftIndex=" + target.giftIndex + "&pf=ios&platform=ios_html";
        let flipRes = await get(flipUrl, getFlipHeaders(auth));

        attempts++;

        if (flipRes.status === 401 || flipRes.status === 403) {
            // renewal 端点已确认不可用 (-2013)，直接通知用户
            $.log("[WeRead] 翻牌 — Cookie 过期，通知用户打开 App 刷新");
            $.msg("WeRead", "翻牌认证过期", "点击打开微信读书刷新", "weread://");
            break;
        }

        if (flipRes.status === 200) {
            let flipData;
            try {
                flipData = JSON.parse(flipRes.body || "{}");
            } catch (e) {
                flipData = decode(flipRes.body) || {};
            }
            state = flipData;
            saveFlipState(state);

            let prize = describeFlipResult(flipData, target.cardIndex);
            let type = flipData.prizeType || flipData.type || "";
            results.push("第 " + attempts + " 次: " + prize + (type ? " (" + type + ")" : ""));
            $.log("[WeRead] 翻牌 — 第 " + attempts + " 次成功: " + prize);

            if (!flipData.remainingCount || flipData.remainingCount <= 0) {
                $.log("[WeRead] 翻牌 — 无剩余翻牌次数");
                break;
            }
        } else {
            $.log("[WeRead] 翻牌 — 第 " + attempts + " 次失败 HTTP " + flipRes.status);
            results.push("第 " + attempts + " 次: 失败 (HTTP " + flipRes.status + ")");
            break;
        }

        if (attempts < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    if (results.length > 0) {
        $.msg("WeRead", "翻牌完成", results.join("\n"));
    } else {
        $.msg("WeRead", "翻牌", "暂无可翻的卡片");
    }
}

async function runFlipCard(auth) {
    return await runFlipCardDirect(auth);
}


// Try to refresh vid/skey via /login using saved refreshToken + deviceId


function Env(name) {

    this.name = name;

    this.getdata = function (k) {

        if (typeof $persistentStore !== "undefined")
            return $persistentStore.read(k);

        if (typeof $prefs !== "undefined")
            return $prefs.valueForKey(k);

        return null;
    };


    this.setdata = function (v, k) {

        if (typeof $persistentStore !== "undefined")
            return $persistentStore.write(v, k);

        if (typeof $prefs !== "undefined")
            return $prefs.setValueForKey(v, k);

        return false;
    };


    this.msg = function (t, s, b, url) {

        if (typeof $notification === "undefined") return;

        if (url) {
            // Loon: $notification.post(title, subtitle, body, urlString)
            // Surge: $notification.post(title, subtitle, body, { "url": url })
            // Quantumult X: $notification.post(title, subtitle, body, { "open-url": url })
            if (typeof $loon !== "undefined") {
                $notification.post(t, s, b, url);
            } else if (typeof $surge !== "undefined") {
                $notification.post(t, s, b, { "url": url });
            } else {
                // Quantumult X 或其他
                $notification.post(t, s, b, { "open-url": url });
            }
        } else {
            $notification.post(t, s, b);
        }

    };


    this.log = function () {
        console.log.apply(console, arguments);
    };

}

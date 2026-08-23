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
http-request ^https?://i\.weread\.qq\.com/.* script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag3, tag=WeReadClaim Auth, requires-body=false, enable={capture_cookie}

# 捕获 /login 请求体（Base64 编码），提取 deviceId
http-request POST ^https?://i\.weread\.qq\.com/login script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag3, tag=WeReadClaim Login, requires-body=true, enable={capture_cookie}

# 捕获 /login 响应体，提取 vid/skey/refreshToken（自动刷新的前置条件）
http-response POST ^https?://i\.weread\.qq\.com/login script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag3, tag=WeReadClaim LoginResp, requires-body=true, enable={capture_cookie}

# 捕获 weread.qq.com Cookie（wr_skey/wr_vid，翻牌游戏用）
http-request ^https?://weread\.qq\.com/.* script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag3, tag=WeReadClaim FlipCookie, requires-body=false, enable={capture_cookie}

# 定时领取：每晚 23:00 自动检查并领取
# 不设 argument=，让 Loon 自动把 [Argument] 值注入 $argument；http-request 中转存储兜底
cron "0 23 * * *" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag3, tag=WeReadClaim 签到, enable=true

# 翻牌游戏：每周二 20:00 自动翻牌
cron "0 20 * * 2" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/weread_claim/weread_claim.js?v=20260823-diag3, argument="task=flip", tag=WeReadClaim 翻牌, enable=true
*/

const AUTH_KEY = "weread_auth_v2";
const FLIP_STATE_KEY = "weread_flip_state_v1";
const SCRIPT_VERSION = "2026-08-23-diag3";
const API = "https://i.weread.qq.com";
const FLIP_API = "https://weread.qq.com/flip-card-game/api";
const PF = "weread_wx-2001-iap-2001-iphone";
const HMAC_SALT = "EBRYFkVMReKBGsU2";
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


// ============================================================
// Pure-JS SHA-256 / HMAC-SHA256（Loon 无原生 crypto，手写）
// ============================================================

const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Uint8(bytes) {
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

    const n = bytes.length;
    const bitLen = n * 8;
    const padLen = (n % 64 < 56) ? (56 - n % 64) : (120 - n % 64);

    const padded = new Uint8Array(n + padLen + 8);
    padded.set(bytes);
    padded[n] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, bitLen >>> 0, false);
    dv.setUint32(padded.length - 8, (bitLen / 4294967296) >>> 0, false);

    const W = new Uint32Array(64);
    for (let off = 0; off < padded.length; off += 64) {
        const block = padded.subarray(off, off + 64);
        const bdv = new DataView(block.buffer, block.byteOffset, block.byteLength);
        for (let i = 0; i < 16; i++) W[i] = bdv.getUint32(i * 4, false);
        for (let i = 16; i < 64; i++) {
            const s0 = (W[i - 15] >>> 7 | W[i - 15] << 25) ^ (W[i - 15] >>> 18 | W[i - 15] << 14) ^ (W[i - 15] >>> 3);
            const s1 = (W[i - 2] >>> 17 | W[i - 2] << 15) ^ (W[i - 2] >>> 19 | W[i - 2] << 13) ^ (W[i - 2] >>> 10);
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
            const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
            const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0;
            d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i], false);
    return out;
}

function strToBytes(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) { out.push(0xc0 | c >> 6, 0x80 | c & 0x3f); }
        else { out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 0x3f, 0x80 | c & 0x3f); }
    }
    return new Uint8Array(out);
}

function bytesToHex(bytes) {
    const hex = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
        s += hex[bytes[i] >> 4] + hex[bytes[i] & 0xf];
    }
    return s;
}

function hmacSha256(keyStr, dataStr) {
    const key = strToBytes(keyStr);
    const data = strToBytes(dataStr);

    let K = key;
    if (K.length > 64) {
        K = sha256Uint8(K);
    } else if (K.length < 64) {
        const pad = new Uint8Array(64);
        pad.set(K);
        K = pad;
    }

    const iPad = new Uint8Array(64), oPad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
        iPad[i] = K[i] ^ 0x36;
        oPad[i] = K[i] ^ 0x5c;
    }

    const inner = new Uint8Array(64 + data.length);
    inner.set(iPad);
    inner.set(data, 64);
    const innerHash = sha256Uint8(inner);

    const outer = new Uint8Array(64 + 32);
    outer.set(oPad);
    outer.set(innerHash, 64);
    return sha256Uint8(outer);
}

function hmacSha256Hex(keyStr, dataStr) {
    return bytesToHex(hmacSha256(keyStr, dataStr));
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


// Build HMAC key for /login: refreshToken_deviceId_SALT_random
function buildLoginKey(refreshToken, deviceId, random) {
    return refreshToken + "_" + deviceId + "_" + HMAC_SALT + "_" + random;
}

// Sort body keys alphabetically, join as key=value&... for signing
function signableString(body) {
    return Object.keys(body).sort().map(k => k + "=" + body[k]).join("&");
}

// Compute /login signature: HMAC-SHA256(key, sortedBody)
function computeLoginSignature(refreshToken, deviceId, body) {
    let random = (body.random || Math.floor(Math.random() * 999999999)).toString();
    body.random = parseInt(random, 10);
    let ts = Math.floor(Date.now() / 1000);
    body.timestamp = ts;

    let key = buildLoginKey(refreshToken, deviceId, random);
    let data = signableString(body);
    $.log("[WeRead] login key=" + key.slice(0, 30) + "... data=" + data.slice(0, 50) + "...");
    return hmacSha256Hex(key, data);
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


// 方案 B：通过网页版 /web/login/renewal 自动续期 wr_skey
// 仅用于 weread.qq.com H5 翻牌 Cookie，不回写 App API 的 skey。
async function tryWebRenewal(auth) {
    let wrVid = auth.wrVid || auth.vid || "";
    let wrSkey = auth.wrSkey || auth.skey || "";

    if (!wrVid || !wrSkey) {
        $.log("[WeRead] renewal 跳过：无 wr_vid/wr_skey");
        return null;
    }

    $.log("[WeRead] 尝试网页版 renewal 续期 skey... (wrVid=" + String(wrVid).slice(0, 8) + "...)");

    return new Promise((resolve) => {
        $httpClient.post({
            url: "https://weread.qq.com/web/login/renewal",
            headers: {
                "User-Agent": auth.flipUa || auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                "Content-Type": "application/json",
                "Cookie": "wr_skey=" + wrSkey + "; wr_vid=" + wrVid
            },
            body: JSON.stringify({ "rq": "%2Fweb%2Fbook%2Fread" }),
            timeout: 10000
        }, (err, res, data) => {
            if (err) {
                $.log("[WeRead] renewal 请求失败: " + String(err));
                resolve(null);
                return;
            }

            $.log("[WeRead] renewal HTTP " + res.status);

            if (res.status !== 200) {
                $.log("[WeRead] renewal 非 200，skey 可能已彻底失效");
                resolve(null);
                return;
            }

            // 从 Set-Cookie 响应头提取新的 wr_skey
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

            if (newSkey) {
                $.log("[WeRead] renewal 成功(Set-Cookie): 新 wr_skey=" + newSkey.slice(0, 8) + "...");
                // 只续期 H5 翻牌 Cookie，避免污染 App API 的 skey
                auth.wrSkey = newSkey;
                auth.webRenewTime = Date.now();
                $.setdata(JSON.stringify(auth), AUTH_KEY);
                resolve(auth);
            } else {
                // 也许新 skey 在 response body 里（网页版可能不走 Set-Cookie）
                let bodyData = null;
                try { bodyData = JSON.parse(data); } catch (e) { }
                if (bodyData && (bodyData.skey || bodyData.wr_skey)) {
                    let sk = bodyData.skey || bodyData.wr_skey;
                    $.log("[WeRead] renewal 成功(body): 新 skey=" + String(sk).slice(0, 8) + "...");
                    auth.wrSkey = sk;
                    auth.webRenewTime = Date.now();
                    $.setdata(JSON.stringify(auth), AUTH_KEY);
                    resolve(auth);
                } else {
                    $.log("[WeRead] renewal: 响应中未找到新 skey, body=" + String(data).slice(0, 100));
                    resolve(null);
                }
            }
        });
    });
}


// 方案 B：通过网页版 /web/login/renewal 刷新 App API 的 skey
// 假设 App 的 vid == 网页版 wr_vid，App 的 skey == 网页版 wr_skey（同源，仅传输方式不同）
// 如果验证通过，skey 过期时可自动续期，无需手动开 App
async function refreshAppSkeyViaWeb(auth) {
    let vid = auth.vid || "";
    let skey = auth.skey || "";

    if (!vid || !skey) {
        $.log("[WeRead] AppSkey 续期跳过：无 vid/skey");
        return null;
    }

    $.log("[WeRead] 尝试网页版 renewal 续期 App skey... (vid=" + String(vid).slice(0, 8) + "...)");

    return new Promise((resolve) => {
        $httpClient.post({
            url: "https://weread.qq.com/web/login/renewal",
            headers: {
                "User-Agent": auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                "Content-Type": "application/json",
                "Cookie": "wr_skey=" + skey + "; wr_vid=" + vid
            },
            body: JSON.stringify({ "rq": "%2Fweb%2Fbook%2Fread" }),
            timeout: 10000
        }, (err, res, data) => {
            if (err) {
                $.log("[WeRead] AppSkey renewal 请求失败: " + String(err));
                resolve(null);
                return;
            }

            $.log("[WeRead] AppSkey renewal HTTP " + res.status);

            if (res.status !== 200) {
                $.log("[WeRead] AppSkey renewal 非 200，skey 可能已彻底失效");
                resolve(null);
                return;
            }

            // 从 Set-Cookie 响应头提取新的 wr_skey
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
                // 也许新 skey 在 response body 里
                let bodyData = null;
                try { bodyData = JSON.parse(data); } catch (e) { }
                if (bodyData && (bodyData.skey || bodyData.wr_skey)) {
                    newSkey = bodyData.skey || bodyData.wr_skey;
                }
            }

            if (newSkey) {
                $.log("[WeRead] AppSkey renewal 成功: 新 skey=" + newSkey.slice(0, 8) + "...");
                // 关键：同时更新 App API 的 skey 和网页版的 wrSkey
                auth.skey = newSkey;
                auth.wrSkey = newSkey;
                auth.skeyRenewTime = Date.now();
                $.setdata(JSON.stringify(auth), AUTH_KEY);
                resolve(auth);
            } else {
                $.log("[WeRead] AppSkey renewal: 响应中未找到新 skey, body=" + String(data).slice(0, 100));
                resolve(null);
            }
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
async function callRenewalProbe(vid, skey, ua) {
    if (!vid || !skey) {
        return { ok: false, error: "无 vid/skey" };
    }

    return new Promise((resolve) => {
        $httpClient.post({
            url: "https://weread.qq.com/web/login/renewal",
            headers: {
                "User-Agent": ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
                "Content-Type": "application/json",
                "Cookie": "wr_skey=" + skey + "; wr_vid=" + vid
            },
            body: JSON.stringify({ "rq": "%2Fweb%2Fbook%2Fread" }),
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
                resolve({ ok: true, newSkey, status: 200 });
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

    // 步骤2: 网页版 renewal（纯查询，不回写）
    // 两路对比: 2a 用 App 的 vid/skey 当 wr_skey (方案B 的同源假设);
    //           2b 用 web 的 wr_vid/wr_skey (翻牌在用的真实 web 凭据)。
    // 若 2a 失败而 2b 成功 → App skey ≠ web wr_skey → 根因乙确认。
    $.log("[WeRead 诊断] ── 步骤2: 调用网页版 /web/login/renewal (两路对比) ──");
    function fmtRenewal(r) {
        if (!r) return "(未测)";
        if (r.ok) return "成功, 新 skey=" + String(r.newSkey).slice(0, 8) + "...";
        return "失败 — " + (r.error || ("HTTP " + r.status + (r.body ? " body=" + r.body : "")));
    }

    $.log("[WeRead 诊断] (2a) 用 App skey/vid 作为 wr_skey/wr_vid:");
    let r2a = await callRenewalProbe(auth.vid, auth.skey, auth.ua);
    $.log("[WeRead 诊断]     " + fmtRenewal(r2a));

    let r2b = null;
    if (hasWeb) {
        $.log("[WeRead 诊断] (2b) 用 web wr_vid/wr_skey (翻牌 Cookie):");
        r2b = await callRenewalProbe(auth.wrVid, auth.wrSkey, auth.flipUa || auth.ua);
        $.log("[WeRead 诊断]     " + fmtRenewal(r2b));
    } else {
        $.log("[WeRead 诊断] (2b) 跳过: 未抓取到 web wr_vid/wr_skey");
        $.log("[WeRead 诊断]     (打开微信读书 H5 / 翻牌页触发抓包后再测可做对比)");
    }
    $.log("");

    // 判定
    if (!r2a.ok) {
        // App skey 版 renewal 失败
        if (r2b && r2b.ok) {
            // 2a 失败、2b 成功 → App skey 不被 web 端点接受 → 同源假设破灭
            $.log("[WeRead 诊断] ★ 结论: 根因乙确认 ★");
            $.log("[WeRead 诊断] App skey 无法通过 web renewal (失败), 但真实 web wr_skey 可续期 (成功)。");
            $.log("[WeRead 诊断] → App skey ≠ web wr_skey, 同源假设不成立。");
            $.log("[WeRead 诊断] → 方案B (refreshAppSkeyViaWeb) 不可行, 应移除, 401 链直连方案D。");
            $.log("[WeRead 诊断] 注: 根因甲的「过期前主动续期」也救不了 — 步骤1 skey 未过期时 renewal 就已失败。");
            $.msg("WeRead 诊断", "根因乙确认", "App skey≠web wr_skey；方案B 死，建议移除");
        } else if (r2b && !r2b.ok) {
            // 两路都失败 → 端点/参数问题, 或 wr_skey 也已失效
            $.log("[WeRead 诊断] ★ 结论: 本次无法判定 (两路 renewal 均失败) ★");
            $.log("[WeRead 诊断] App skey 与 web wr_skey 的 renewal 都失败, 无法区分是「端点/参数变更」还是「凭据均失效」。");
            $.log("[WeRead 诊断] 下一步: 查近期翻牌 cron (0 20 * * 2) 日志 —");
            $.log("[WeRead 诊断]   若翻牌 renewal 也失败 → /web/login/renewal 端点或 rq 参数已变, 需重新抓包。");
            $.log("[WeRead 诊断]   若翻牌 renewal 正常   → wr_skey 有效但 App skey 不被接受 → 根因乙。");
            $.msg("WeRead 诊断", "无法判定", "两路 renewal 均失败；查翻牌 cron 日志区分");
        } else {
            // 2a 失败、无 2b
            $.log("[WeRead 诊断] ★ 结论: 本次无法判定 ★");
            $.log("[WeRead 诊断] App skey renewal 失败, 且无 web wr_skey 做对比。");
            $.log("[WeRead 诊断] 下一步: 打开微信读书 H5 (weread.qq.com) 触发抓包, 再跑诊断用 wr_skey 对比。");
            $.msg("WeRead 诊断", "无法判定", "App skey renewal 失败；抓 wr_skey 后再测");
        }
        $.log("════════════════════════════════════════");
        return;
    }

    // r2a.ok: App skey 版 renewal 成功 → 用新 skey 走 step 3 验证根因乙
    let newSkey = r2a.newSkey;
    let rotated = (newSkey && newSkey !== auth.skey);
    $.log("[WeRead 诊断] 步骤2 (2a) 结果: renewal 成功，新 skey=" + (newSkey ? String(newSkey).slice(0, 8) + "..." : "(空)"));
    if (!rotated) {
        $.log("[WeRead 诊断] 警告: renewal 返回的 skey 与原值相同 (未轮换)");
    }
    $.log("");

    // 步骤3: 用新 skey 探测 App API（验证同源假设 = 根因乙）
    // 未轮换时跳过：测试新 skey 等于测试旧 skey，无法判定根因乙。
    if (!rotated) {
        $.log("[WeRead 诊断] ── 步骤3: 跳过 (skey 未轮换) ──");
        $.log("[WeRead 诊断]");
        $.log("[WeRead 诊断] ★ 结论: 本次无法判定 ★");
        $.log("[WeRead 诊断] renewal 未轮换 skey，无法验证「新 skey 对 App 是否有效」(根因乙)。");
        $.log("[WeRead 诊断] 建议: 在 skey 临近过期 (约第 6-7 天) 时再次运行诊断，此时 renewal 大概率轮换。");
        $.msg("WeRead 诊断", "无法判定", "skey 未轮换，请在临近过期时重试");
        $.log("════════════════════════════════════════");
        return;
    }

    $.log("[WeRead 诊断] ── 步骤3: 用 renewal 新 skey 探测 App API ──");
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
        $.log("[WeRead 诊断]");
        $.log("[WeRead 诊断] ★ 结论: 本次无法判定 (步骤3 HTTP 异常) ★");
        $.log("[WeRead 诊断] 步骤1 已成功且 renewal 已轮换新 skey，但步骤3 无法连通 i.weread.qq.com。");
        $.log("[WeRead 诊断] 不回写新 skey (未确认其 App 有效性)。");
        $.msg("WeRead 诊断", "步骤3 HTTP 异常", step3Err);
        $.log("════════════════════════════════════════");
        return;
    }
    let newSkeyWorks = (probe2.status === 200);
    $.log("[WeRead 诊断] 步骤3 结果: HTTP " + probe2.status + (newSkeyWorks ? " → 新 skey 对 App 有效 ✓" : " → 新 skey 对 App 无效 ✗"));
    $.log("");

    // 综合结论
    $.log("[WeRead 诊断] ── 综合结论 ──");
    if (newSkeyWorks) {
        $.log("[WeRead 诊断] ★ 结论: 同源假设成立，根因乙排除 ★");
        $.log("[WeRead 诊断] renewal 的新 skey 对 App API 同样有效，App skey == 网页 wr_skey。");
        $.log("[WeRead 诊断] cron 失败根因是 根因甲: skey 过期后 renewal 拒绝续期。");
        $.log("[WeRead 诊断] 修复方向: 在 skey 过期前主动续期 (proactive renewal)。");
        $.msg("WeRead 诊断", "根因甲 (可修复)", "同源假设成立；改为过期前主动续期即可全自动");
        // 附带红利: 回写有效新 skey (诊断兼做一次主动续期)
        auth.skey = newSkey;
        auth.wrSkey = newSkey;
        auth.skeyRenewTime = Date.now();
        $.setdata(JSON.stringify(auth), AUTH_KEY);
        $.log("[WeRead 诊断] 已回写有效新 skey (诊断兼做一次主动续期) ✓");
    } else {
        $.log("[WeRead 诊断] ★ 结论: 根因乙确认 ★");
        $.log("[WeRead 诊断] renewal 新 skey 对 App API 无效 (HTTP " + probe2.status + ")。");
        $.log("[WeRead 诊断] 同源假设不成立: App skey ≠ 网页 wr_skey，二者不能互通。");
        $.log("[WeRead 诊断] 修复方向: 方案B 不可行，应移除 refreshAppSkeyViaWeb，仅保留方案D 兜底。");
        $.msg("WeRead 诊断", "根因乙确认", "新 skey 对 App 无效；方案B 不可行，建议移除");
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
        $.msg("WeRead", "没有认证", "请打开微信读书刷新一次");
        return;
    }

    // 快速检测 skey 是否有效：先发一个查询请求
    let probe = await post(API + "/weekly/exchange", buildExchangeQuery(), getHeaders(auth));

    if (probe.status === 401) {
        // 方案 B：先尝试网页版 renewal 续期 App skey
        $.log("[WeRead] 401 — skey 已过期，尝试网页版 renewal 自动续期...");
        let renewed = await refreshAppSkeyViaWeb(auth);
        if (renewed) {
            // renewal 成功，用新 skey 重试
            let probeRetry = await post(API + "/weekly/exchange", buildExchangeQuery(), getHeaders(renewed));
            if (probeRetry.status === 200) {
                $.log("[WeRead] renewal 续期成功，skey 已自动刷新 ✅ 全自动！");
                return await runClaimWithAuth(renewed, probeRetry.body);
            }
            $.log("[WeRead] renewal 后仍非 200 (HTTP " + probeRetry.status + ")，继续降级...");
        }

        // 方案 D：所有自动方案均失效，通知用户手动刷新
        $.msg("WeRead", "认证已过期", "vid/skey 已失效，请重新打开微信读书 App 刷新认证后再试");
        $.setdata("", AUTH_KEY);
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
            // 方案 D：vid/skey 均失效，通知用户
            $.msg("WeRead", "认证已过期", "vid/skey 已失效，请重新打开微信读书 App 刷新认证后再试");
            $.setdata("", AUTH_KEY);
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
        $.msg("WeRead", "翻牌", "未捕获到 weread.qq.com 登录信息，请先打开微信读书 App 触发认证捕获");
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
            $.log("[WeRead] 翻牌 — Cookie 过期，尝试 renewal 续期 wr_skey...");
            let renewed = await tryWebRenewal(auth);
            if (renewed) {
                auth = renewed;
                flipRes = await get(flipUrl, getFlipHeaders(auth));
            }
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
//
// ⚠️ 非功能代码：/login 的 signature 算法经逆向分析确认为「极高难度」
// （HMAC-SHA256 key 格式 %@_%@_EBRYFkVMReKBGsU2_%@ 但 3 个 %@ 的具体来源
//  以及 message 的构建方式无法从二进制中确定，20+ 种策略共 30 万+ 组合验证均不匹配）。
// 保留此函数待将来通过 Frida hook 或 Ghidra 反编译破解后启用；
// 当前 401 走方案 B（网页版 renewal 续期）+ 方案 D（通知用户）。
async function tryRefreshLogin(auth) {
    let body = {
        refreshToken: auth.refreshToken,
        deviceId: auth.deviceId,
        random: Math.floor(Math.random() * 999999999),
        timestamp: Math.floor(Date.now() / 1000)
    };

    let sig = computeLoginSignature(auth.refreshToken, auth.deviceId, body);
    body.signature = sig;

    $.log("[WeRead] /login body=" + JSON.stringify(body).slice(0, 120));

    let r = await post(
        API + "/login",
        encode(body),
        {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "User-Agent": auth.ua || "WeRead",
            "channelid": auth.channelid || "AppStore",
            "basever": auth.basever || "",
            "v": auth.basever || ""
        }
    );

    if (r.status !== 200) {
        $.log("[WeRead] /login failed with HTTP " + r.status + ": " + (r.body || "").slice(0, 100));
        return null;
    }

    let loginData = decode(r.body);
    if (!loginData || !loginData.vid || !loginData.skey) {
        $.log("[WeRead] /login response missing vid/skey: " + (r.body || "").slice(0, 150));
        return null;
    }

    let newAuth = {
        vid: loginData.vid,
        skey: loginData.skey,
        refreshToken: loginData.refreshToken || auth.refreshToken,
        deviceId: auth.deviceId,
        openId: loginData.openId || auth.openId,
        basever: auth.basever,
        channelid: auth.channelid,
        ua: auth.ua
    };

    $.log("[WeRead] login refresh OK, vid=" + newAuth.vid.slice(0, 8) + "...");
    return newAuth;
}



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


    this.msg = function (t, s, b) {

        if (typeof $notification !== "undefined")
            $notification.post(t, s, b);

    };


    this.log = function () {
        console.log.apply(console, arguments);
    };

}

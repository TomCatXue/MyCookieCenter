/*
#!name=微信读书·自动领取（每日签到）
#!desc=微信读书阅读奖励自动领取（每日 23:00）。本文件默认执行每日领取，参数 task=flip 时执行翻牌；通知标题为「WeRead · 每日签到」。
#!author=Codex
#!homepage=https://github.com/TomCatXue/MyCookieCenter
#!icon=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/icons/weread.png
#!tag=微信读书,自动领取,阅读奖励

MITM 与 cron 规则统一由 loon/CookieCenter.plugin 配置：
- 每日领取 cron -> 本文件（每日 23:00）
- 周二翻牌 cron -> weread_flip.js（每周二 20:00）
参数面板由 boxjs/CookieCenter.boxjs.json 订阅提供。
*/

const AUTH_KEY = "weread_auth_v2";
const FLIP_STATE_KEY = "weread_flip_state_v1";
const SCRIPT_VERSION = "2026-09-05-auto-refresh";
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

        // cron 任务：通过 $argument 区分任务类型（翻牌也可调用本文件）
        let arg = parseArgument(typeof $argument !== "undefined" ? $argument : {});
        if (arg.task === "flip") {
            $.name = "WeRead · 周二翻牌";
            await runFlipCard();
        } else if (arg.task === "free" || arg.task === "limitFree") {
            $.name = "WeRead · 限免入架";
            await runFreeBooks();
        } else {
            $.name = "WeRead · 每日签到";
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
    // skey 可选：方案 C（vid 长期有效，部分接口不校验 skey）
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


// ============================================================
// /login 签名计算（逆向还原自 WeRead 10.2.0 ARM64 sub_1004d7878）
// ============================================================

const WE_READ_TABLE_HEX = "34ca55401db693c63130293532a7b811c2b516fa8bb124a4109004e908f83b8a9c8c44f9bc5c69e2a1dad2d37589f71e2d5056d77253bf22fb200f012e45876e6648f2e0cdfe67a943f49451cea54aee13268eccaa33145d0e39bbcf912b814dea99ec1a2c85c5d936744b18e1f13d9d419fb4170dd64cbedcaf972877f062ff71c1c8278f6c68a89be6591c1b1209984e3f063700ba1f0a192fc9d5d057496ffd25e4610c42cb96645fdbad60238d9a6dc3c45e3eb9926abd5b077f7695ed4fab847a80e778c7e5eb73836bfc38467d4765b352633a05d1efa3a6de9e3c02aeb27ba0f6f32ac0ac86035a540bf582d47ee3dfb0d8dd21e87c88a2795870b715";
const WE_READ_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    WE_READ_TABLE[i] = parseInt(WE_READ_TABLE_HEX.substr(i * 2, 2), 16);
}

function subBytes(str) {
    const b = strToBytes(str);
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) {
        out[i] = WE_READ_TABLE[b[i]];
    }
    return out;
}

function simRotateBytes(arr, shift) {
    const L = arr.length;
    if (L === 0) return new Uint8Array(0);
    const dest = new Uint8Array(L);
    let curr = shift;
    for (let i = 0; i < L; i++) {
        dest[curr % L] = arr[i];
        curr++;
    }
    return dest;
}

function xorSumBytes(arr) {
    let res = 0;
    for (let i = 0; i < arr.length; i++) res ^= arr[i];
    return res;
}

function compareByteArrays(a, b) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
}

// 生产级：与 App 原生 +[WRAppUtils signatureForLoginRenewalWithRefreshToken:] 100% 对齐
function computeLoginSignature(refreshToken, deviceId, body) {
    let random = body.random;
    let ts = body.timestamp;
    let logoToken = "5ecdcfd7f";

    const s0 = subBytes(String(ts));
    const s1 = subBytes(String(random));
    const s2 = subBytes(logoToken);
    const s3 = subBytes(deviceId);
    const s4 = strToBytes("5a6f1");
    const s5 = subBytes(refreshToken);

    const list = [s0, s1, s2, s3, s4, s5];
    list.sort(compareByteArrays);

    let totalLen = 0;
    for (let i = 0; i < list.length; i++) totalLen += list[i].length;
    const concat = new Uint8Array(totalLen);
    let off = 0;
    for (let i = 0; i < list.length; i++) {
        concat.set(list[i], off);
        off += list[i].length;
    }

    const shift1 = xorSumBytes(concat) % 11;
    const rot1 = simRotateBytes(concat, shift1);

    const hash1Hex = bytesToHex(sha256Uint8(rot1));
    const hex1Ascii = strToBytes(hash1Hex);

    const shift2 = xorSumBytes(hex1Ascii) % 11;
    const rot2 = simRotateBytes(hex1Ascii, shift2);

    return bytesToHex(sha256Uint8(rot2));
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
// ⚠️ 死代码 — 2026-08-23 诊断确认不可行：App skey ≠ 网页 wr_skey（b1523e1），
// 且 /web/login/renewal 对任何 Cookie 均返回 -2013 params error，无法续期。
// 翻牌 wr_skey 失效的唯一恢复途径：用户重新打开翻牌页面触发 Cookie 捕获。
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
                // 2026-08-23 诊断确认：缺 Origin/Referer 时 renewal 返回 -2013 params error
                "Origin": "https://weread.qq.com",
                "Referer": "https://weread.qq.com/",
                "Cookie": "wr_skey=" + wrSkey + "; wr_vid=" + wrVid
            },
            // 2026-08-23 诊断确认：body 必须带 ql:false（v1 完整格式），否则 -2013 params error (node)
            body: JSON.stringify({ "rq": "%2Fweb%2Fbook%2Fread", "ql": false }),
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


async function runClaim() {

    let auth = getAuth();

    if (!auth) {
        $.msg("WeRead", "没有认证", "请打开微信读书刷新一次");
        return;
    }

    // 快速检测 skey 是否有效：先发一个查询请求
    let probe = await post(
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

    if (probe.status === 401) {
        // 先尝试通过 /login 自动换票刷新
        $.log("[WeRead] 401 — skey 已过期，尝试通过 /login 自动换票刷新...");
        if (auth.refreshToken && auth.deviceId) {
            let refreshedAuth = await tryRefreshLogin(auth);
            if (refreshedAuth && refreshedAuth.skey) {
                auth = refreshedAuth;
                let probeRefresh = await post(
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
                if (probeRefresh.status === 200) {
                    $.log("[WeRead] /login 刷新后请求成功！");
                    return await runClaimWithAuth(auth, probeRefresh.body);
                }
            }
        }
    }

    if (probe.status === 401) {
        // 方案 C：skey 已过期，但 vid 长期有效——尝试不带 skey 重新请求
        $.log("[WeRead] 401 — skey 已过期，尝试不带 skey 请求（vid 长期有效）...");
        let noSkeyAuth = JSON.parse(JSON.stringify(auth));
        delete noSkeyAuth.skey;
        let probe2 = await post(
            API + "/weekly/exchange",
            encode({
                awardLevelId: 0,
                unread: 1,
                isExchangeAward: 0,
                pf: PF,
                awardChoiceType: 0
            }),
            getHeaders(noSkeyAuth)
        );

        if (probe2.status === 200) {
            $.log("[WeRead] 不带 skey 请求成功，vid 仍然有效");
            // 传 noSkeyAuth（无 skey），后续领取请求直接不带 skey，避免每次 401
            return await runClaimWithAuth(noSkeyAuth, probe2.body);
        }

        // 方案 D：vid/skey 均失效，通知用户手动刷新
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

        if (result.status === 401) {
            $.log("[WeRead] query 401 — 尝试通过 /login 自动换票刷新...");
            if (auth.refreshToken && auth.deviceId) {
                let refreshedAuth = await tryRefreshLogin(auth);
                if (refreshedAuth && refreshedAuth.skey) {
                    auth = refreshedAuth;
                    result = await post(
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
                }
            }
        }

        if (result.status === 401) {
            // 方案 C：尝试不带 skey 查询
            $.log("[WeRead] query 401 — 尝试不带 skey 请求...");
            delete auth.skey;
            let r1 = await post(
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
            if (r1.status === 200) {
                queryBody = r1.body;
            } else {
                $.msg("WeRead", "认证已过期", "vid/skey 已失效，请重新打开微信读书 App 刷新认证后再试");
                $.setdata("", AUTH_KEY);
                return;
            }
        }
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
            $.log("[WeRead] claim 401 — 尝试通过 /login 自动换票刷新并重试...");
            if (auth.refreshToken && auth.deviceId) {
                let refreshedAuth = await tryRefreshLogin(auth);
                if (refreshedAuth && refreshedAuth.skey) {
                    auth = refreshedAuth;
                    r = await post(
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
                }
            }
        }

        if (r.status === 401) {
            // 方案 C：skey 已过期，尝试不带 skey 重新领取
            $.log("[WeRead] claim 401 — 尝试不带 skey 重新领取...");
            delete auth.skey; // 后续请求都不带 skey
            let r2 = await post(
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

            if (r2.status === 200) {
                count++;
                details.push((item._src || "奖励") + "·" + describeChoice(choice, r2));
                continue;
            }

            // 方案 D：vid/skey 均失效
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
    // 2026-08-27 抓包确认：
    // 1) cardIndex = cardList/initialList 中 status=0（未翻开）的数组下标（真实翻 cardIndex=6 对应 initialList[6] status=0）
    // 2) giftIndex = 本次会话已翻的牌数 = flipList.length（抓包第 1 次翻 flipList 空 → giftIndex=0；已翻 1 张 → giftIndex=1）
    //    ⚠️ 必须用服务器最新 flipList.length，固定 0 在已翻过牌时是非法参数 → WAF 断开 499
    let cards = data.cardList || [];
    let used = {};
    cards.forEach(c => {
        if (typeof c.cardIndex === "number" && c.cardIndex >= 0) {
            used[c.cardIndex] = true;
        }
    });

    // 收集 status=0（可翻）的卡片位置，优先 initialList 再 cardList
    let candidates = [];
    let seen = {};
    (data.initialList || []).forEach((c, i) => {
        if (c.status === 0 && !used[i] && !seen[i]) { candidates.push(i); seen[i] = true; }
    });
    cards.forEach((c, i) => {
        if (c.status === 0 && !used[i] && !seen[i]) { candidates.push(i); seen[i] = true; }
    });
    // 回退：按 FLIP_CARD_ORDER 顺序找未翻的位置
    if (candidates.length === 0) {
        for (let i = 0; i < FLIP_CARD_ORDER.length; i++) {
            let candidate = FLIP_CARD_ORDER[i];
            if (!used[candidate] && !seen[candidate]) {
                candidates.push(candidate);
            }
        }
    }

    if (candidates.length === 0) return null;
    let cardIndex = candidates[0];
    let giftIndex = Array.isArray(data.flipList) ? data.flipList.length : 0;
    return { cardIndex, giftIndex };
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
    // ⚠️ 必须用 WebView UA（Mozilla/...AppleWebKit...），绝不能用 App 原生 UA（auth.ua，无 Mozilla 前缀）。
    // 2026-08-27 抓包确认：真实翻牌请求 UA 是 iOS 26.6.1 的 WebView UA；
    // 用 App UA 请求 H5 翻牌接口会被 WAF 直接断开（HTTP 499）。
    let flipUa = auth.flipUa || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)";
    return {
        "User-Agent": flipUa,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Accept-Encoding": "gzip, deflate, br, zstd",
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

    // ⚠️ 翻牌必须用 weread.qq.com 捕获的真实 Cookie（wr_skey/wr_vid）。
    // 不能 fallback 到 App 的 vid/skey：诊断（2026-08-23）已确认 App skey ≠ 网页 wr_skey，
    // 用 App skey 冒充会触发 WAF 直接断开连接（HTTP 499）。
    if (!auth || !auth.wrVid || !auth.wrSkey) {
        if (auth && auth.refreshToken && auth.deviceId) {
            $.log("[WeRead] 翻牌 — 缺少 wr_skey，尝试通过 /login 自动刷新获取...");
            let refreshedAuth = await tryRefreshLogin(auth);
            if (refreshedAuth && refreshedAuth.wrSkey) {
                auth = refreshedAuth;
            }
        }
    }

    if (!auth || !auth.wrVid || !auth.wrSkey) {
        $.log("[WeRead] 翻牌 — 未捕获 weread.qq.com Cookie. wrVid="
            + (auth && auth.wrVid ? "有" : "无") + ", wrSkey=" + (auth && auth.wrSkey ? "有" : "无"));
        $.msg("WeRead", "翻牌", "未捕获到 weread.qq.com 登录 Cookie（wr_skey/wr_vid）且自动刷新失败\n请在微信读书 App 打开「翻牌游戏」页面一次，再重新运行");
        return;
    }

    // ⚠️ 关键：先 GET flipCardList 获取服务器最新状态（抓包确认真实 App 会先查列表）。
    // 不能依赖本地保存的旧 state —— 旧 state 的 flipList.length 会算出错误的 giftIndex，
    // 导致服务器/WAF 校验参数非法直接断开（HTTP 499）。
    let listRes = await get(FLIP_API + "/flipCardList?pf=ios&platform=ios_html", getFlipHeaders(auth));
    if (listRes.status !== 200) {
        if (auth && auth.refreshToken && auth.deviceId && (listRes.status === 401 || listRes.status === 403 || listRes.status === 499)) {
            $.log("[WeRead] 翻牌 — flipCardList 返回 HTTP " + listRes.status + "，尝试通过 /login 自动刷新 wr_skey 并重试...");
            let refreshedAuth = await tryRefreshLogin(auth);
            if (refreshedAuth && refreshedAuth.wrSkey) {
                auth = refreshedAuth;
                listRes = await get(FLIP_API + "/flipCardList?pf=ios&platform=ios_html", getFlipHeaders(auth));
            }
        }
        if (listRes.status !== 200) {
        $.log("[WeRead] 翻牌 — flipCardList 查询失败 HTTP " + listRes.status
            + "，body=" + String(listRes.body || "").slice(0, 100));
        $.msg("WeRead", "翻牌失败", "查询卡片列表失败 (HTTP " + listRes.status + ")\n若为 401/403/499，请打开微信读书 App 的「翻牌游戏」页面一次重新捕获 Cookie");
        return;
        }
    }

    let freshState;
    try {
        freshState = JSON.parse(listRes.body || "{}");
    } catch (e) {
        freshState = decode(listRes.body) || {};
    }

    let remainingCount = freshState.remainingCount || 0;
    $.log("[WeRead] 翻牌 — flipCardList 成功, remainingCount=" + remainingCount
        + ", flipList.length=" + (freshState.flipList ? freshState.flipList.length : 0));

    if (remainingCount <= 0) {
        $.msg("WeRead", "翻牌", "本周翻牌次数已用完");
        return;
    }

    // 用服务器最新状态作为起点（替换本地旧 state），giftIndex 由最新 flipList.length 决定
    state = freshState;
    saveFlipState(state);

    let results = [];
    let attempts = 0;
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

        if (flipRes.status === 401 || flipRes.status === 403 || flipRes.status === 499) {
            $.log("[WeRead] 翻牌 — HTTP " + flipRes.status + "，尝试通过 /login 自动刷新 wr_skey 并重试当前卡片...");
            if (auth && auth.refreshToken && auth.deviceId) {
                let refreshedAuth = await tryRefreshLogin(auth);
                if (refreshedAuth && refreshedAuth.wrSkey) {
                    auth = refreshedAuth;
                    flipRes = await get(flipUrl, getFlipHeaders(auth));
                }
            }
        }

        // 401/403 = Cookie 明确失效（需重新捕获）；499 = WAF/服务器断开连接。
        // 2026-08-27 抓包确认：wr_skey 有效时真实请求仍 200，499 通常因请求参数/头不合法被 WAF 拦。
        if (flipRes.status === 401 || flipRes.status === 403) {
            $.log("[WeRead] 翻牌 — HTTP " + flipRes.status + "，Cookie 失效，需重新捕获");
            results.push("第 " + attempts + " 次: 失败 (HTTP " + flipRes.status + ")，Cookie 失效");
            break;
        }
        if (flipRes.status === 499) {
            $.log("[WeRead] 翻牌 — HTTP 499（WAF 断开），该 cardIndex 不可翻，跳过");
            results.push("第 " + attempts + " 次: 失败 (HTTP 499)");
            // 把当前 cardIndex 记入 used，避免死循环重试同一张
            state = state || {};
            state.cardList = state.cardList || [];
            state.cardList.push({ cardIndex: target.cardIndex, status: 9 });
            state.initialList = state.initialList || [];
            continue;
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
        let failed = results.some(r => r.indexOf("失败") !== -1);
        if (failed) {
            // 401/403/499 = Cookie 失效。renewal 不可行，需用户重新打开翻牌页面捕获
            $.msg("WeRead", "翻牌失败", "wr_skey 已失效（约 7 天有效）\n请打开微信读书 App 的「翻牌游戏」页面一次，让 Loon 重新捕获 Cookie 后再试\n\n" + results.join("\n"));
        } else {
            $.msg("WeRead", "翻牌完成", results.join("\n"));
        }
    } else {
        $.msg("WeRead", "翻牌", "暂无可翻的卡片");
    }
}

async function runFlipCard(auth) {
    return await runFlipCardDirect(auth);
}


// Try to refresh vid/skey and wr_vid/wr_skey via /login using saved refreshToken + deviceId
//
// 已攻破：/login 的 signature 算法经 ARM64 二进制逆向已 100% 还原。
// 换票成功后，/login 返回的 accessToken 将作为 H5 翻牌 Cookie (wr_skey) 同步更新，
// 实现 App 签到与 H5 翻牌的双重脱机全自动刷新！
async function tryRefreshLogin(auth) {
    if (!auth || !auth.refreshToken || !auth.deviceId) {
        $.log("[WeRead] /login 刷新跳过：缺少 refreshToken 或 deviceId");
        return null;
    }

    let ts = Math.floor(Date.now() / 1000);
    let random = Math.floor(Math.random() * 999999999);
    let sig = computeLoginSignature(auth.refreshToken, auth.deviceId, { random, timestamp: ts });

    let body = {
        random: random,
        deviceId: auth.deviceId,
        refCgi: "",
        deviceName: auth.deviceName || "iPhone",
        signature: sig,
        refreshToken: auth.refreshToken,
        wxToken: 1,
        timestamp: ts,
        inBackground: 0,
        deviceToken: auth.deviceToken || ""
    };

    $.log("[WeRead] 发起 /login 自动换票刷新 (ts=" + ts + ", rand=" + random + ", sig=" + sig.slice(0, 10) + "...)...");

    let r = await post(
        API + "/login",
        encode(body),
        {
            "Content-Type": "application/json",
            "Accept": "*/*",
            "User-Agent": auth.ua || "WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)",
            "channelid": auth.channelid || "AppStore",
            "basever": auth.basever || "10.2.1",
            "v": auth.basever || "10.2.1"
        }
    );

    if (r.status !== 200) {
        $.log("[WeRead] /login 刷新失败 HTTP " + r.status + ": " + (r.body || "").slice(0, 100));
        return null;
    }

    let loginData = decode(r.body);
    if (!loginData || !loginData.vid || !loginData.skey) {
        $.log("[WeRead] /login 响应解析失败或缺少关键字段: " + (r.body || "").slice(0, 150));
        return null;
    }

    // 关键突破：/login 返回的 accessToken 即为 H5 翻牌所用的 wr_skey！
    // 一次登录同时刷新 App 原生凭据 (vid/skey) 与 H5 翻牌凭据 (wrVid/wrSkey)
    let newAuth = {
        vid: String(loginData.vid),
        skey: loginData.skey,
        accessToken: loginData.accessToken || auth.accessToken || "",
        refreshToken: loginData.refreshToken || auth.refreshToken,
        deviceId: auth.deviceId,
        deviceName: auth.deviceName || "iPhone",
        deviceToken: auth.deviceToken || "",
        openId: loginData.openId || auth.openId,
        basever: auth.basever || "10.2.1",
        channelid: auth.channelid || "AppStore",
        ua: auth.ua || "WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)",
        wrVid: String(loginData.vid),
        wrSkey: loginData.accessToken || loginData.skey,
        flipUa: auth.flipUa || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        authTime: Date.now()
    };

    $.setdata(JSON.stringify(newAuth), AUTH_KEY);
    $.log("[WeRead] /login 全自动刷新成功！vid=" + newAuth.vid.slice(0, 8) + "..., wrSkey=" + (newAuth.wrSkey ? "已同步" : "无"));
    return newAuth;
}



// ============================================================
// 每周限免好书入架业务逻辑
// ============================================================

function extractBooks(data) {
    let list = [];
    if (!data) return list;
    let rawList = data.books || data.data || data.items || data.freeBooks || (Array.isArray(data) ? data : []);
    rawList.forEach(b => {
        let bid = b.bookId || b.id || b.bookInfo?.bookId || b.book?.bookId;
        let title = b.title || b.bookInfo?.title || b.book?.title || "";
        if (bid) {
            list.push({ bookId: String(bid), title: String(title) });
        }
    });
    return list;
}

async function fetchLimitFreeBooks(auth) {
    let books = [];

    // 1. 优先获取福利界面「免费图书馆」书单（每期免费领 2 本电子书）
    try {
        let res1 = await get(API + "/free/library/list", getHeaders(auth));
        if (res1.status === 401) {
            let refreshed = await tryRefreshLogin(auth);
            if (refreshed) {
                auth = refreshed;
                res1 = await get(API + "/free/library/list", getHeaders(auth));
            }
        }
        if (res1.status === 200) {
            let data = decode(res1.body) || JSON.parse(res1.body || "{}");
            let list = extractBooks(data);
            books = books.concat(list);
            $.log("[WeRead] /free/library/list 成功提取到 " + list.length + " 本免费好书" + (data.intro ? " (" + data.intro + ")" : ""));
        } else {
            $.log("[WeRead] /free/library/list HTTP " + res1.status);
        }
    } catch (e) {
        $.log("[WeRead] /free/library/list 请求异常: " + String(e));
    }

    // 2. 获取限免/新人免费书单 /newUser/limitFree
    try {
        let res2 = await get(API + "/newUser/limitFree?cmd=0", getHeaders(auth));
        if (res2.status === 200) {
            let data = decode(res2.body) || JSON.parse(res2.body || "{}");
            let list = extractBooks(data);
            books = books.concat(list);
            $.log("[WeRead] /newUser/limitFree 提取到 " + list.length + " 本书籍");
        }
    } catch (e) {
        $.log("[WeRead] /newUser/limitFree 请求异常: " + String(e));
    }

    // 3. 备用推荐源 /exchange/bookrecommend
    if (books.length === 0) {
        try {
            let res3 = await get(API + "/exchange/bookrecommend", getHeaders(auth));
            if (res3.status === 200) {
                let data = decode(res3.body) || JSON.parse(res3.body || "{}");
                let list = extractBooks(data);
                books = books.concat(list);
                $.log("[WeRead] /exchange/bookrecommend 备用源提取到 " + list.length + " 本");
            }
        } catch (e) { }
    }

    // 去重
    let uniqueMap = new Map();
    books.forEach(b => {
        if (b.bookId && !uniqueMap.has(b.bookId)) {
            uniqueMap.set(b.bookId, b);
        }
    });

    return { books: Array.from(uniqueMap.values()), auth };
}

async function batchAddShelf(auth, bookList) {
    if (!bookList || bookList.length === 0) {
        return { success: false, count: 0, titles: [], errMsg: "书单为空" };
    }

    let bookIds = bookList.map(b => b.bookId);
    $.log("[WeRead] 准备批量加入书架，共 " + bookIds.length + " 本...");

    // 尝试调用限免赠领通道 /act/sendgift (xsmfs: 限时免费送)
    try {
        await post(
            API + "/act/sendgift",
            encode({ act: "xsmfs", actType: 1, bookIds: bookIds }),
            getHeaders(auth)
        );
    } catch (e) { }

    let addPayload = { bookIds: bookIds };
    let res = await post(
        API + "/shelf/add",
        encode(addPayload),
        getHeaders(auth)
    );

    if (res.status === 401) {
        let refreshed = await tryRefreshLogin(auth);
        if (refreshed) {
            auth = refreshed;
            res = await post(
                API + "/shelf/add",
                encode(addPayload),
                getHeaders(auth)
            );
        }
    }

    let resData = decode(res.body) || JSON.parse(res.body || "{}");
    $.log("[WeRead] /shelf/add 响应: " + JSON.stringify(resData).slice(0, 150));

    if (resData && (resData.succ || resData.errcode === -2449 || res.status === 200)) {
        let titles = bookList.map(b => b.title ? `《${b.title}》` : `ID:${b.bookId}`).filter(Boolean);
        return { success: true, count: bookIds.length, titles };
    }

    return { success: false, count: 0, titles: [], errMsg: resData?.errmsg || resData?.message || ("HTTP " + res.status) };
}

async function runFreeBooks() {
    let auth = getAuth();
    if (!auth || !auth.vid) {
        $.msg("WeRead · 限免入架", "未找到登录凭据", "请打开微信读书 App 刷新一次认证");
        return;
    }

    $.log("[WeRead] 限免好书入架任务启动... version=" + SCRIPT_VERSION);
    let { books, auth: updatedAuth } = await fetchLimitFreeBooks(auth);
    auth = updatedAuth;

    if (!books || books.length === 0) {
        $.msg("WeRead · 限免入架", "暂无可用限免书单", "本周官方限免书库暂未更新或当前列表为空");
        return;
    }

    let result = await batchAddShelf(auth, books);
    if (result.success) {
        let preview = result.titles.slice(0, 3).join("、");
        if (result.titles.length > 3) preview += ` 等共 ${result.count} 本`;
        $.msg("WeRead · 限免入架", `成功添加 ${result.count} 本好书`, preview);
    } else {
        $.msg("WeRead · 限免入架", "批量添加失败", result.errMsg || "请检查网络");
    }
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
            $notification.post(this.name, s, b);

    };


    this.log = function () {
        console.log.apply(console, arguments);
    };

}

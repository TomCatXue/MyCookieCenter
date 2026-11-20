/*
#!name=微信读书·每周限免好书入架
#!desc=每周自动拉取微信读书官方限免书库，按口碑门槛智能优选后通过助力小号自动领取入架；未配置小号时推送微信一键直达链接。
#!author=TomCatXue
#!homepage=https://github.com/TomCatXue/MyCookieCenter
#!icon=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/icons/weread.png
#!tag=微信读书,限免,助力

Loon 原生脚本（不依赖青龙）。MITM 与 cron 规则统一由 loon/WeReadTasks.plugin 配置：
- 每周五限免入架 cron -> 本文件（每周五 10:05）
- 每日领取 cron -> weread_claim.js（每日 23:05）
- 周二翻牌 cron -> weread_flip.js（每周二 20:05）
优选参数由 WeReadTasks.plugin 的 [Argument] 段提供，脚本内通过 $argument 读取。
*/

const AUTH_KEY = "weread_auth_v2";
const SCRIPT_VERSION = "2026-11-20-helper";
const API = "https://i.weread.qq.com";
const PF = "weread_wx-2001-iap-2001-iphone";

// 每期免费图书馆官方配额
const MAX_BOOKS_PER_VOL = 2;

let $ = new Env("WeRead · 限免入架");

// ============================================================
// 0. Loon Argument 解析与配置派生
// ============================================================

function readArgument() {
    const out = {};
    try {
        if (typeof $argument === "undefined" || $argument === null) return out;
        if (typeof $argument === "object") {
            for (const k in $argument) out[k] = $argument[k];
            return out;
        }
        String($argument).split("&").forEach(pair => {
            const i = pair.indexOf("=");
            if (i <= 0) return;
            try {
                out[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
            } catch (e) {
                out[pair.slice(0, i)] = pair.slice(i + 1);
            }
        });
    } catch (e) { return {}; }
    return out;
}

function num(v, d) {
    if (v === undefined || v === null) return d;
    let s = String(v).trim();
    if (!s) return d;
    let n = Number(s);
    return isNaN(n) ? d : n;
}

function bool(v, d) {
    if (v === undefined || v === null) return d;
    let s = String(v).trim().toLowerCase();
    if (!s) return d;
    return !(s === "false" || s === "0" || s === "off" || s === "no");
}

function splitList(v) {
    if (v === undefined || v === null) return [];
    let s = String(v).trim();
    if (!s) return [];
    return s.split(/[,|，\s]+/).map(x => x.trim()).filter(Boolean);
}

const ARG = readArgument();

const CFG = {
    minCount: num(ARG.minCount, 500),
    maxCount: num(ARG.maxCount, 0),
    minRating: num(ARG.minRating, 850),
    preferCats: splitList(ARG.preferCats),
    excludeCats: splitList(ARG.excludeCats),
    excludeWords: splitList(ARG.excludeWords),
    diversify: bool(ARG.diversify, true),
    fallbackLink: bool(ARG.fallbackLink, true),
    helperRaw: String(ARG.helper || "").trim()
};

// ============================================================
// Pure-JS SHA-256（Loon 无原生 crypto，手写）
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

// ============================================================
// 通用网络与凭据支持
// ============================================================

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getAuth() {
    const raw = $.getdata(AUTH_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function getHeaders(a) {
    let h = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": a.ua || "WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)",
        "channelid": a.channelid || "AppStore",
        "basever": a.basever || "10.2.1",
        "v": a.basever || "10.2.1",
        "vid": String(a.vid)
    };
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
    if (!str) return null;
    try {
        return JSON.parse(str);
    } catch (e) { }
    try {
        if (typeof $base64 !== "undefined") {
            return JSON.parse($base64.decode(str));
        }
    } catch (e) { }
    return null;
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
            else resolve({ status: res.status, body: data });
        });
    });
}

// 需要读取响应头（Set-Cookie 续期）时使用；post() 保持原样不动
function postEx(url, body, headers, timeout) {
    return new Promise((resolve, reject) => {
        $httpClient.post({
            url,
            headers,
            body,
            timeout: timeout || 15000
        }, (err, res, data) => {
            if (err) reject(err);
            else resolve({ status: res.status, body: data, headers: (res && res.headers) || {} });
        });
    });
}

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

// 全自动脱机换票刷新（storageKey 传 null 时不回写，避免助力小号覆盖主号凭据）
async function tryRefreshLogin(auth, storageKey = AUTH_KEY) {
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

    let newAuth = Object.assign(auth, {
        vid: String(loginData.vid),
        skey: loginData.skey,
        accessToken: loginData.accessToken || auth.accessToken || "",
        refreshToken: loginData.refreshToken || auth.refreshToken,
        openId: loginData.openId || auth.openId,
        basever: auth.basever || "10.2.1",
        channelid: auth.channelid || "AppStore",
        ua: auth.ua || "WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)",
        wrVid: String(loginData.vid),
        wrSkey: loginData.accessToken || loginData.skey,
        flipUa: auth.flipUa || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        authTime: Date.now()
    });

    // 自动回写存储（仅当指定 storageKey 时回写，防止助力小号覆盖主号配置）
    if (storageKey) {
        $.setdata(JSON.stringify(newAuth), storageKey);
    }
    $.log("[WeRead] /login 全自动刷新成功！vid=" + newAuth.vid.slice(0, 8) + "..., wrSkey=" + (newAuth.wrSkey ? "已同步" : "无"));
    return newAuth;
}

// ============================================================
// 助力小号凭据解析 / Web Cookie 续期
// ============================================================

function buildHelperCookie(h) {
    let vid = String(h.vid || "");
    let skey = h.wrSkey || h.skey || "";
    let rt = h.wrRt || "";
    return `wr_vid=${vid}; wr_skey=${skey};` + (rt ? ` wr_rt=${rt};` : "") + ` wr_loggedIn=1;`;
}

function maskVid(v) {
    let s = String(v || "");
    return s.length > 4 ? s.slice(0, 4) + "****" : s;
}

// 单条凭据解析 + 历史续期结果复用（对应青龙版 parseSingleHelper）
function parseOneHelper(raw) {
    let h = parseOneHelperShape(raw);
    if (h && h.vid) {
        try {
            let cachedStr = $.getdata(`weread_helper_${h.vid}`);
            if (cachedStr) {
                let cachedObj = typeof cachedStr === "string" ? JSON.parse(cachedStr) : cachedStr;
                let userSkey = h.wrSkey || h.skey || "";
                let cachedInitSkey = cachedObj.initialSkey || "";
                // 核心防死锁：若用户配置了全新凭证(skey 变更或缓存已标记失败)，以用户最新值为准并废弃旧缓存
                if (cachedObj.failed || (cachedInitSkey && userSkey && userSkey !== cachedInitSkey)) {
                    return h;
                }
                // 仅当用户配置未变更时，复用自动续期产生的最新有效 skey
                if (cachedObj.wrSkey && (!userSkey || userSkey === cachedInitSkey)) {
                    h.wrSkey = cachedObj.wrSkey;
                    h.skey = cachedObj.wrSkey;
                    if (cachedObj.wrRt) h.wrRt = decodeURIComponent(cachedObj.wrRt);
                    h.rawCookie = cachedObj.rawCookie || buildHelperCookie(h);
                }
            }
        } catch (e) { }
    }
    return h;
}

function parseOneHelperShape(raw) {
    if (!raw) return null;
    if (typeof raw === "object") {
        let vid = raw.vid || raw.wrVid || raw.wr_vid || "";
        let skey = raw.wrSkey || raw.skey || raw.wr_skey || raw.accessToken || "";
        let rt = raw.wrRt || raw.wr_rt || "";
        if (rt) rt = decodeURIComponent(rt);
        if (!vid && !skey && !raw.refreshToken) return null;
        let cookie = raw.rawCookie || buildHelperCookie({ vid: vid, wrSkey: skey, wrRt: rt });
        return {
            vid: String(vid),
            skey: String(skey),
            wrSkey: String(skey),
            wrRt: String(rt),
            refreshToken: raw.refreshToken || "",
            deviceId: raw.deviceId || "",
            rawCookie: cookie
        };
    }
    if (typeof raw !== "string") return null;
    let s = raw.replace(/\\([_@])/g, "$1").trim();
    if (!s) return null;

    // 1. JSON 格式
    if (s.startsWith("{")) {
        try {
            return parseOneHelperShape(JSON.parse(s));
        } catch (e) { }
    }

    // 2. 完整 Cookie 串（捕获 wr_vid / wr_skey 及长效续期种子 wr_rt）
    if (s.includes("wr_vid") || s.includes("wr_skey")) {
        let vidM = s.match(/wr_vid=([^;\s]+)/);
        let skeyM = s.match(/wr_skey=([^;\s]+)/);
        let rtM = s.match(/wr_rt=([^;\s]+)/);
        if (vidM || skeyM) {
            let vid = vidM ? vidM[1] : "";
            let skey = skeyM ? skeyM[1] : "";
            let rt = rtM ? decodeURIComponent(rtM[1]) : "";
            return {
                vid: vid,
                wrSkey: skey,
                skey: skey,
                wrRt: rt,
                rawCookie: s.includes("wr_loggedIn") ? s : (s + "; wr_loggedIn=1;")
            };
        }
    }

    // 3. vid#skey#rt 格式
    if (s.includes("#")) {
        let parts = s.split("#");
        let vid = parts[0].trim();
        let skey = parts[1] ? parts[1].trim() : "";
        let rt = parts[2] ? decodeURIComponent(parts[2].trim()) : "";
        return {
            vid: vid,
            wrSkey: skey,
            skey: skey,
            wrRt: rt,
            rawCookie: buildHelperCookie({ vid: vid, wrSkey: skey, wrRt: rt })
        };
    }

    // 4. vid@skey 格式
    if (s.includes("@") && !s.includes("wr_")) {
        let parts = s.split("@");
        let vid = parts[0].trim();
        let skey = parts[1] ? parts[1].trim() : "";
        return {
            vid: vid,
            wrSkey: skey,
            skey: skey,
            wrRt: "",
            rawCookie: buildHelperCookie({ vid: vid, wrSkey: skey })
        };
    }

    return null;
}

// Loon 版小号列表来源：plugin input，多条用 | 分隔，兼容换行粘贴
function getHelperList(mainVid) {
    if (!CFG.helperRaw) return [];
    let parts = CFG.helperRaw.split("|");
    let list = [];
    parts.forEach(p => {
        p.split(/[\r\n]+/).forEach(seg => {
            let h = parseOneHelper(seg.trim());
            if (h && h.vid && String(h.vid) !== String(mainVid || "")) list.push(h);
        });
    });
    // 去重（同一 vid 只保留第一个）
    let seen = new Set();
    let out = [];
    list.forEach(h => {
        let v = String(h.vid);
        if (seen.has(v)) {
            $.log(`[WeRead] ⚠️ 检测到重复的小号凭证 [${maskVid(v)}]，已自动合并去重`);
            return;
        }
        seen.add(v);
        out.push(h);
    });
    return out;
}

// 核心自愈：Web Cookie 自动续期（/web/login/renewal，无感换票）
async function tryWebRenewal(helperAuth) {
    let wrRt = helperAuth && (helperAuth.wrRt || helperAuth.wr_rt);
    let wrVid = helperAuth && (helperAuth.vid || helperAuth.wrVid);
    let wrSkey = helperAuth && (helperAuth.wrSkey || helperAuth.skey);
    if (!wrRt || !wrVid) {
        return null;
    }
    if (typeof wrRt === "string") wrRt = decodeURIComponent(wrRt);

    let maskH = maskVid(wrVid);
    let skeyPrefix = wrSkey ? (wrSkey.slice(0, 4) + "****") : "空";
    let rtPrefix = wrRt ? (wrRt.slice(0, 6) + "..." + wrRt.slice(-4)) : "空";
    $.log(`[WeRead] 正在通过 /web/login/renewal 自动续期小号 [${maskH}] Web Cookie (发送skey: ${skeyPrefix}, rt: ${rtPrefix})...`);

    // 变体重试列表（提升对腾讯不同网关版本的容错能力）
    const COOKIE_DATA_VARIANTS = [
        { "rq": "%2Fweb%2Fbook%2Fread", "ql": false },
        { "rq": "%2Fweb%2Fbook%2Fread" },
        { "rq": "%2Fweb%2Fbook%2Fread", "ql": true }
    ];

    let renewHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://weread.qq.com",
        "Referer": "https://weread.qq.com/web/book/read",
        "Cookie": helperAuth.rawCookie || buildHelperCookie({ vid: wrVid, wrSkey: wrSkey, wrRt: wrRt })
    };

    let lastError = "";
    for (let variant of COOKIE_DATA_VARIANTS) {
        try {
            let res = await postEx(
                "https://weread.qq.com/web/login/renewal",
                JSON.stringify(variant),
                renewHeaders,
                15000
            );

            let resData = decode(res.body);
            let setCookies = res.headers["set-cookie"] || res.headers["Set-Cookie"] || null;
            let newSkey = null;
            let newRt = null;

            if (setCookies) {
                let cookieStr = Array.isArray(setCookies) ? setCookies.join("; ") : String(setCookies);
                let skeyMatch = cookieStr.match(/wr_skey=([^;\s]+)/);
                if (skeyMatch) newSkey = skeyMatch[1];
                let rtMatch = cookieStr.match(/wr_rt=([^;\s]+)/);
                if (rtMatch) newRt = decodeURIComponent(rtMatch[1]);
            }
            // 部分网关把新票据放在响应体里
            if (!newSkey && resData && resData.skey) newSkey = String(resData.skey);

            if (res.status === 200 && ((resData && resData.succ === 1) || newSkey)) {
                if (newSkey) {
                    helperAuth.wrSkey = newSkey;
                    helperAuth.skey = newSkey;
                }
                if (newRt) helperAuth.wrRt = newRt;
                helperAuth.rawCookie = buildHelperCookie({ vid: wrVid, wrSkey: helperAuth.wrSkey, wrRt: helperAuth.wrRt || wrRt });
                $.log(`[WeRead] 🎉 小号 [${maskH}] Web Cookie 自动续期成功！最新 skey: ${String(helperAuth.wrSkey).slice(0, 4)}****`);
                try {
                    $.setdata(JSON.stringify({
                        wrSkey: helperAuth.wrSkey,
                        wrRt: helperAuth.wrRt || wrRt,
                        rawCookie: helperAuth.rawCookie,
                        initialSkey: wrSkey,
                        updateTime: Date.now()
                    }), `weread_helper_${wrVid}`);
                } catch (e) { }
                return helperAuth;
            }
            lastError = (resData && (resData.errMsg || resData.errmsg)) || ("HTTP " + res.status);
        } catch (e) {
            lastError = e.message || String(e);
        }
    }

    $.log(`[WeRead] ⚠️ 小号 [${maskH}] Web Cookie 自动续期响应: ${lastError}`);
    if (String(lastError).includes("鉴权失败") || String(lastError).includes("-2013")) {
        // Loon 无 fs：写入 failed 标记，下次解析时自动以用户配置的凭据为准
        try {
            $.setdata(JSON.stringify({ failed: true, updateTime: Date.now() }), `weread_helper_${wrVid}`);
        } catch (e) { }
        $.log(`[WeRead] 💡 已标记小号 [${maskH}] 的本地缓存失效，下次将以插件配置中的最新凭据为准`);
    }
    return null;
}

// ============================================================
// 免费图书馆期数 / 书单抓取
// ============================================================

async function checkFreeQualify(auth) {
    try {
        let res = await get(API + "/checkfreequalify?type=book&vid=" + auth.vid, getHeaders(auth));
        if (res.status === 401 || res.status === 499) {
            let refreshed = await tryRefreshLogin(auth);
            if (refreshed) {
                auth = refreshed;
                res = await get(API + "/checkfreequalify?type=book&vid=" + auth.vid, getHeaders(auth));
            }
        }
        let data = decode(res.body);
        if (data && typeof data.reachedMax !== "undefined") {
            return data;
        }
    } catch (e) {
        $.log("[WeRead] checkfreequalify 请求异常: " + String(e));
    }
    return { reachedMax: 0 };
}

// 当期期数标识（严格锁定北京时间 UTC+8，周四更新，格式 YYYYMMDD）
function getFreeVol() {
    let d = new Date(Date.now() + 8 * 3600 * 1000);
    let day = d.getUTCDay();
    let diff = (day >= 4 ? day - 4 : day + 3);
    d.setUTCDate(d.getUTCDate() - diff);
    let y = d.getUTCFullYear();
    let m = String(d.getUTCMonth() + 1).padStart(2, "0");
    let dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${dd}`;
}

// 指定期数起始时间戳（北京时间周四 00:00:00，秒级）
function getVolStartTime(volStr) {
    if (volStr && /^\d{8}$/.test(volStr)) {
        let y = parseInt(volStr.slice(0, 4), 10);
        let m = parseInt(volStr.slice(4, 6), 10) - 1;
        let d = parseInt(volStr.slice(6, 8), 10);
        return Math.floor(Date.UTC(y, m, d, 0, 0, 0) / 1000) - 8 * 3600;
    }
    return 0;
}

function majorCat(b) {
    return String((b && b.cat) || "").split("-")[0];
}

function buildClaimLink(auth, b, freeTimestamp, vol) {
    return `https://weread.qq.com/book-detail?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${vol}`;
}

// 从书单响应中提取书籍（补全 shareOneGetOne2 所需的 v / sn 字段）
function extractBooks(data) {
    let list = [];
    if (!data) return list;
    let rawList = data.books || data.data || data.items || data.freeBooks || (Array.isArray(data) ? data : []);
    if (!Array.isArray(rawList)) return list;

    rawList.forEach(b => {
        let bInfo = b.bookInfo || b.book || b;
        let bid = String(bInfo.bookId || bInfo.id || "");
        if (!bid) return;

        let title = String(bInfo.title || bInfo.name || "图书");
        let received = typeof b.received !== "undefined" ? Number(b.received) : (typeof bInfo.received !== "undefined" ? Number(bInfo.received) : 0);
        let deepLink = bInfo.deepLink || "";
        let vMatch = deepLink.match(/[?&]v=([^&]+)/);
        let v = vMatch ? vMatch[1] : "";
        let sn = b.sn || "";

        let rawPrice = Number(bInfo.originalPrice || bInfo.price || bInfo.centPrice || (bInfo.priceInfo && bInfo.priceInfo.price) || 0);
        let price = rawPrice > 100 ? (rawPrice / 100) : rawPrice;

        let rawRating = Number(bInfo.newRating || 0);
        if (!rawRating && bInfo.star) {
            let s = Number(bInfo.star);
            rawRating = s <= 5 ? (s * 200) : (s <= 100 ? (s * 10) : s);
        }
        if (!rawRating && bInfo.rating) {
            let r = Number(bInfo.rating);
            rawRating = r <= 1 ? (r * 1000) : (r <= 10 ? (r * 100) : (r <= 100 ? (r * 10) : r));
        }
        let newRating = Math.round(rawRating);
        let newRatingCount = Number(bInfo.newRatingCount || bInfo.ratingCount || bInfo.commentCount || 0);

        let badgesStr = "";
        if (Array.isArray(bInfo.badge)) badgesStr += " " + bInfo.badge.map(x => (typeof x === "object" ? x.text || x.name || "" : String(x))).join(" ");
        if (Array.isArray(bInfo.badges)) badgesStr += " " + bInfo.badges.map(x => (typeof x === "object" ? x.text || x.name || "" : String(x))).join(" ");
        if (Array.isArray(bInfo.cardTags)) badgesStr += " " + bInfo.cardTags.map(x => (typeof x === "object" ? x.name || x.text || "" : String(x))).join(" ");
        let rankingText = String(bInfo.rankingTitle || bInfo.rankingTips || "");
        let rawTips = String((bInfo.newRatingDetail && (bInfo.newRatingDetail.title || bInfo.newRatingDetail.word)) || bInfo.ratingTips || bInfo.starText || "");
        let allTagText = `${rawTips} ${badgesStr} ${rankingText}`;

        // 官方「神作」：徽章显式标注，或 (好评率>=92% 且 >=200人评)，或 (好评率>=90% 且 >=1000人评)
        let isGodTier = allTagText.includes("神作") || (newRating >= 920 && newRatingCount >= 200) || (newRating >= 900 && newRatingCount >= 1000);
        let ratingTitle = isGodTier ? "神作" : rawTips;

        list.push({
            bookId: bid,
            title: title,
            received: received,
            deepLink: deepLink,
            v: v,
            sn: String(sn),
            price: price,
            newRating: newRating,
            newRatingCount: newRatingCount,
            ratingTitle: ratingTitle,
            cat: (bInfo.categories && bInfo.categories[0] && bInfo.categories[0].title) || ""
        });
    });
    return list;
}

// 多通道聚合拉取官方限免书库（18 / 50 / 120 / 120+v2 四路，按 bookId 合并）
async function fetchFreeLibrary(auth, volIn) {
    let vol = volIn;
    let freeTimestamp = Math.floor(Date.now() / 1000);
    let map = new Map();

    let urls = [
        API + `/free/library/list?count=18&receiveStatus=1&type=book&vol=${vol}`,
        API + `/free/library/list?count=50&receiveStatus=1&type=book&vol=${vol}`,
        API + `/free/library/list?count=120&receiveStatus=1&type=book&v=2&vol=${vol}`,
        API + `/free/library/list?count=120&receiveStatus=1&type=book&vol=${vol}`
    ];

    for (let u of urls) {
        try {
            let res = await get(u, getHeaders(auth));
            if (res.status === 401 || res.status === 499) {
                let refreshed = await tryRefreshLogin(auth);
                if (refreshed) {
                    auth = refreshed;
                    res = await get(u, getHeaders(auth));
                }
            }
            if (res.status !== 200) {
                $.log("[WeRead] 书单通道 HTTP " + res.status + ": " + u.replace(API, ""));
                continue;
            }
            let data = decode(res.body);
            if (data && data.vol) vol = String(data.vol);
            if (data && data.timestamp) freeTimestamp = data.timestamp;

            let list = extractBooks(data);
            list.forEach(b => {
                let exist = map.get(b.bookId);
                if (!exist) {
                    map.set(b.bookId, b);
                    return;
                }
                if (b.received === 1) exist.received = 1;
                if (!exist.v && b.v) exist.v = b.v;
                if (!exist.sn && b.sn) exist.sn = b.sn;
                if (b.price > exist.price) exist.price = b.price;
                if (b.newRating > exist.newRating) exist.newRating = b.newRating;
                if (b.newRatingCount > exist.newRatingCount) exist.newRatingCount = b.newRatingCount;
                if (b.ratingTitle && !exist.ratingTitle) exist.ratingTitle = b.ratingTitle;
                if (!exist.cat && b.cat) exist.cat = b.cat;
            });
        } catch (e) {
            $.log("[WeRead] 书单通道异常: " + String(e));
        }
    }

    let books = Array.from(map.values());
    $.log(`[WeRead] 书单聚合完成：${books.length} 本（期数 ${vol}）`);
    return { books: books, auth: auth, vol: vol, timestamp: freeTimestamp };
}

// 补齐评分元数据（/free/library/list 不含评分，需逐本查 /book/info；本地缓存 7 天）
// 预算：只补这么多本（按候选顺序），避免 150+ 本逐本查 /book/info 把 Loon 拖垮
const RATING_BUDGET = 40;

async function enrichRatings(list, authRef) {
    let filled = 0;
    let pendingWrites = [];
    // 未补评分的书先按"能否通过不依赖评分的过滤"粗排，把最有希望的火力集中在它们身上
    let scored = list.filter(b => !(b.newRating > 0 && b.newRatingCount > 0));
    let withRating = list.length - scored.length;
    let candidates = scored.slice(0, RATING_BUDGET);
    if (scored.length > RATING_BUDGET) {
        $.log(`[WeRead] ✂️ 候选 ${scored.length} 本缺评分，按预算只补前 ${RATING_BUDGET} 本（其余不查，直接视为不合格）`);
    }
    for (let b of candidates) {
        if (b.newRating > 0 && b.newRatingCount > 0) continue;

        let ck = `weread_rating_${b.bookId}`;
        let cached = $.getdata(ck);
        if (cached) {
            try {
                let c = JSON.parse(cached);
                if (c && c.ts && (Date.now() - c.ts) < 7 * 24 * 3600 * 1000 && c.rating > 0) {
                    b.newRating = c.rating;
                    b.newRatingCount = c.count;
                    b.ratingTitle = c.title || "";
                    b.cat = c.cat || b.cat || "";
                    filled++;
                    continue;
                }
            } catch (e) { }
        }

        try {
            let r = await get(API + `/book/info?bookId=${b.bookId}`, getHeaders(authRef));
            if (r.status === 401 || r.status === 499) {
                let rf = await tryRefreshLogin(authRef);
                if (rf) {
                    authRef = rf;
                    r = await get(API + `/book/info?bookId=${b.bookId}`, getHeaders(authRef));
                }
            }
            if (r.status === 200) {
                let o = decode(r.body);
                if (o && o.bookId) {
                    b.newRating = Number(o.newRating || 0);
                    b.newRatingCount = Number(o.newRatingCount || 0);
                    b.ratingTitle = (o.newRatingDetail && o.newRatingDetail.title) || "";
                    if (o.price) b.price = Number(o.price);
                    let cats = (o.categories || []).map(c => c.title || "").filter(Boolean);
                    b.cat = cats[0] || b.cat || "";
                    // 批量攒着写（$persistentStore 每次写都有开销，集中写一次省很多）
                    pendingWrites.push({
                        ck: ck,
                        val: JSON.stringify({
                            ts: Date.now(),
                            rating: b.newRating,
                            count: b.newRatingCount,
                            title: b.ratingTitle,
                            cat: b.cat || ""
                        })
                    });
                    if (pendingWrites.length >= 10) {
                        pendingWrites.forEach(p => { try { $.setdata(p.val, p.ck); } catch (e) { } });
                        pendingWrites = [];
                    }
                    filled++;
                }
            }
        } catch (e) {
            $.log(`[WeRead] 评分补齐失败《${b.title}》: ${String(e)}`);
        }
        await sleep(110);
    }
    // 收尾：把剩下没写的一并落盘
    pendingWrites.forEach(p => { try { $.setdata(p.val, p.ck); } catch (e) { } });
    pendingWrites = [];
    $.log(`[WeRead] 📊 评分补齐完成：${filled}/${list.length} 本（已有评分 ${withRating} 本，预算 ${RATING_BUDGET} 本）`);
    return authRef;
}

// ============================================================
// 打分与优选
// ============================================================

// 返回 -1 表示不合格；正数为得分（人数对数为主排序，好评率为次排序）
// opts.skipPrefer / skipWords / skipCats 用于层层放宽过滤（见 selectCandidates）
function scoreBook(b, opts) {
    opts = opts || {};
    let count = Number(b.newRatingCount || 0);
    let rating = Number(b.newRating || 0);
    if (count < CFG.minCount || rating < CFG.minRating) return -1;
    if (CFG.maxCount > 0 && count > CFG.maxCount) return -1;

    let major = majorCat(b);
    if (!opts.skipPrefer && CFG.preferCats.length > 0 && CFG.preferCats.indexOf(major) === -1) return -1;
    if (!opts.skipCats && CFG.excludeCats.length > 0 && CFG.excludeCats.indexOf(major) !== -1) return -1;

    let title = String(b.title || "");
    if (!opts.skipWords && CFG.excludeWords.some(w => title.includes(w))) return -1;

    return Math.log10(count) * 1000 + (rating - 850) * 2;
}

function ratingTagOf(b) {
    if (!b.newRating) return "[暂无评分]";
    let pct = (b.newRating / 10).toFixed(1);
    let countStr = b.newRatingCount >= 10000
        ? (b.newRatingCount / 10000).toFixed(1) + "w人评"
        : `${b.newRatingCount}人评`;
    let tag = b.ratingTitle || (b.newRating >= 900 ? "好评如潮" : (b.newRating >= 850 ? "特别好评" : (b.newRating >= 750 ? "口碑推荐" : "普通评级")));
    return `[${tag} · ${pct}%好评 (${countStr})]`;
}

// 只做「不依赖评分」的裁剪，用来减少 /book/info 请求量。
// 注意：booklist 里的分类可能缺失（cat 为空），这种情况一律保留，不能凭空调掉。
// 若裁剪后一本不剩，自动回退全量（宁多查几十次，也不能一本都领不到）。
function prefilter(list) {
    let pool = list;
    let reasons = [];

    if (CFG.excludeWords.length > 0) {
        let kept = pool.filter(b => !CFG.excludeWords.some(w => String(b.title || "").includes(w)));
        if (kept.length > 0) {
            reasons.push(`关键词排除 -${pool.length - kept.length}`);
            pool = kept;
        }
    }

    if (CFG.excludeCats.length > 0) {
        // 只对「有分类信息」的书做排除；分类未知的保留
        let kept = pool.filter(b => {
            let m = majorCat(b);
            if (!m) return true;
            return CFG.excludeCats.indexOf(m) === -1;
        });
        if (kept.length > 0) {
            reasons.push(`分类排除 -${pool.length - kept.length}`);
            pool = kept;
        }
    }

    if (CFG.preferCats.length > 0) {
        let kept = pool.filter(b => {
            let m = majorCat(b);
            if (!m) return true;   // 分类未知的先保留，等补完评分再判
            return CFG.preferCats.indexOf(m) !== -1;
        });
        if (kept.length > 0) {
            reasons.push(`优先分类 -${pool.length - kept.length}`);
            pool = kept;
        }
    }

    if (reasons.length > 0) {
        $.log(`[WeRead] ✂️ 预筛: ${list.length} -> ${pool.length} 本（${reasons.join("，")}）`);
    }
    return pool.length > 0 ? pool : list;
}

function rankByScore(list, opts) {
    return list
        .map(c => ({ c: c, s: scoreBook(c, opts) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.c);
}

// 打分排序；过滤条件导致一本不剩时逐层放宽，保证用户设错也不会一本都领不到
function selectCandidates(rawCandidates, needCount) {
    if (!rawCandidates.length) return [];

    let picked = rankByScore(rawCandidates, {});
    if (picked.length === 0 && CFG.preferCats.length > 0) {
        $.log(`[WeRead] ⚠️ 优先分类 [${CFG.preferCats.join("/")}] 过滤后无书达标（分类名可能写错，或本期无此类），已自动回退为不限分类`);
        picked = rankByScore(rawCandidates, { skipPrefer: true });
    }
    if (picked.length === 0 && CFG.excludeWords.length > 0) {
        $.log(`[WeRead] ⚠️ 排除关键词 [${CFG.excludeWords.join("|")}] 后无书达标，已自动回退为不过滤关键词`);
        picked = rankByScore(rawCandidates, { skipPrefer: true, skipWords: true });
    }
    if (picked.length === 0 && CFG.excludeCats.length > 0) {
        $.log(`[WeRead] ⚠️ 排除分类 [${CFG.excludeCats.join("/")}] 后无书达标，已自动回退为不排除分类`);
        picked = rankByScore(rawCandidates, { skipPrefer: true, skipWords: true, skipCats: true });
    }

    if (CFG.preferCats.length > 0 && picked.length > 0) {
        let hit = picked.filter(b => CFG.preferCats.indexOf(majorCat(b)) !== -1).length;
        $.log(`[WeRead] 🔍 优先分类命中 ${hit}/${picked.length} 本`);
    }
    return picked;
}

// 分类多样化：第 2 本强制换一级分类，避免两本同类
function pickTargets(candidates, need) {
    if (!candidates.length) return [];
    let picked = [candidates[0]];
    if (need > 1) {
        if (CFG.diversify) {
            let c1 = majorCat(candidates[0]);
            let alt = candidates.slice(1).find(c => majorCat(c) !== c1);
            picked.push(alt || candidates[1]);
        } else {
            picked.push(candidates[1]);
        }
    }
    return picked.filter(Boolean);
}

// ============================================================
// 限免好书入架主流程
// ============================================================

function saveWeekCache(cacheKey, vol, addedBooks, usedHelpers, details) {
    try {
        $.setdata(JSON.stringify({
            vol: vol,
            allClaimed: addedBooks.length >= MAX_BOOKS_PER_VOL,
            addedBooks: addedBooks,
            usedHelpers: usedHelpers,
            details: details
        }), cacheKey);
    } catch (e) { }
}

function notifyFree(subtitle, text) {
    $.msg("微信读书 · 限免入架", subtitle, text);
}

async function runFreeBooks() {
    let auth = getAuth();
    if (!auth || !auth.vid) {
        notifyFree("未找到登录凭据", "请打开微信读书 App 刷新一次认证");
        return;
    }

    $.log("[WeRead] 限免好书入架任务启动... version=" + SCRIPT_VERSION);
    $.log(`[WeRead] 优选配置: 人数>=${CFG.minCount}${CFG.maxCount > 0 ? " 且 <= " + CFG.maxCount : " (不限上限)"} · 好评>=${(CFG.minRating / 10).toFixed(1)}% · 多样化=${CFG.diversify ? "开" : "关"} · 兜底链接=${CFG.fallbackLink ? "开" : "关"}`);

    let currentVol = getFreeVol();
    let cacheKey = `weread_free_${auth.vid}_${currentVol}`;

    // 0. 周度缓存锁定检测（避免整周重复执行时书名漂移或发起冗余网络请求）
    let cachedAddedBooks = [];
    let cachedUsedHelpers = [];
    try {
        let rawCache = $.getdata(cacheKey);
        if (rawCache) {
            let cachedInfo = JSON.parse(rawCache);
            if (cachedInfo && cachedInfo.vol === currentVol && Array.isArray(cachedInfo.addedBooks)) {
                cachedAddedBooks = cachedInfo.addedBooks;
                if (Array.isArray(cachedInfo.usedHelpers)) cachedUsedHelpers = cachedInfo.usedHelpers;
                if (cachedInfo.allClaimed && cachedInfo.addedBooks.length >= MAX_BOOKS_PER_VOL) {
                    $.log(`[WeRead] ℹ️ 本周(期数 ${currentVol})已成功领取固定图书(周度锁定): ${cachedInfo.addedBooks.join(", ")}`);
                    notifyFree("本周配额已满（周度锁定）", cachedInfo.addedBooks.join("、") + "\n本周无需重复领取，下期周四更新后再试");
                    return;
                }
                if (cachedInfo.addedBooks.length > 0) {
                    $.log(`[WeRead] ℹ️ 检测到本周已领部分图书缓存(${cachedInfo.addedBooks.length}本): ${cachedInfo.addedBooks.join(", ")}，继续补齐剩余名额`);
                }
            }
        }
    } catch (e) { }

    // 1. 领书资格与本期配额
    let reachedMax = false;
    try {
        let qualify = await checkFreeQualify(auth);
        if (qualify && qualify.reachedMax === 1) reachedMax = true;
        // 主号可能已在 checkFreeQualify 内部完成换票，重新读回最新凭据
        auth = getAuth() || auth;
    } catch (e) {
        $.log("[WeRead] 资格校验异常: " + String(e));
    }

    // 2. 主号书架现有图书
    let shelfBookIds = new Set();
    try {
        let shelfRes = await get(API + "/shelf/sync?synckey=0&onlyBookid=1", getHeaders(auth));
        if (shelfRes.status === 401 || shelfRes.status === 499) {
            let refreshed = await tryRefreshLogin(auth);
            if (refreshed) {
                auth = refreshed;
                shelfRes = await get(API + "/shelf/sync?synckey=0&onlyBookid=1", getHeaders(auth));
            }
        }
        let sData = decode(shelfRes.body);
        let sItems = (sData && (sData.books || sData.bookIds)) || [];
        sItems.forEach(item => {
            let bid = typeof item === "object" ? (item.bookId || item.id) : item;
            if (bid) shelfBookIds.add(String(bid));
        });
        $.log(`[WeRead] 主号书架现有 ${shelfBookIds.size} 本`);
    } catch (e) {
        $.log("[WeRead] 书架同步异常: " + String(e));
    }

    // 3. 多通道聚合书单
    let lib = await fetchFreeLibrary(auth, currentVol);
    auth = lib.auth;
    let books = lib.books;
    let freeTimestamp = lib.timestamp;

    if (!books.length) {
        notifyFree("本期限免书库暂无新书", "未获取到本周免费图书馆书籍，请稍后重试");
        return;
    }

    // 4. 分批查验主号购买资产（防止单次查询 URL 超长截断）
    let allBookIds = books.map(b => b.bookId);
    let allTimePaidBookIds = new Set();
    let thisWeekPaidBookIds = new Set();
    let volStartTime = getVolStartTime(currentVol);

    for (let i = 0; i < allBookIds.length; i += 30) {
        let chunk = allBookIds.slice(i, i + 30);
        try {
            let payUrl = API + `/book/paytime?bookIds=${encodeURIComponent(chunk.join(","))}`;
            let payRes = await get(payUrl, getHeaders(auth));
            if (payRes.status === 401 || payRes.status === 499) {
                let refreshed = await tryRefreshLogin(auth);
                if (refreshed) {
                    auth = refreshed;
                    payRes = await get(payUrl, getHeaders(auth));
                }
            }
            let payData = decode(payRes.body);
            let items = (payData && payData.data) || [];
            items.forEach(item => {
                if (item.bookId && item.time > 0) {
                    allTimePaidBookIds.add(String(item.bookId));
                    if (volStartTime > 0 && item.time >= volStartTime) {
                        thisWeekPaidBookIds.add(String(item.bookId));
                    }
                }
            });
        } catch (e) {
            $.log("[WeRead] 购买资产查询异常: " + String(e));
        }
    }

    // 5. 核验本周真实已拥有（received === 1 或本期 paytime 生效）
    let claimedBooks = books.filter(b => b.received === 1 || thisWeekPaidBookIds.has(String(b.bookId)));
    let claimedTitles = claimedBooks.map(b => `《${b.title}》`);

    for (let t of cachedAddedBooks) {
        let formatted = String(t).startsWith("《") ? t : `《${t}》`;
        if (claimedTitles.indexOf(formatted) === -1) claimedTitles.push(formatted);
    }

    // 已拥有的限免书回写书架
    if (claimedBooks.length > 0) {
        try {
            await post(API + "/shelf/syncbook", JSON.stringify({ bookIds: claimedBooks.map(b => String(b.bookId)), albumIds: [] }), getHeaders(auth));
        } catch (e) { }
    }

    if (claimedTitles.length >= MAX_BOOKS_PER_VOL || (reachedMax && claimedTitles.length > 0)) {
        let booksOut = claimedTitles.slice(0, MAX_BOOKS_PER_VOL);
        saveWeekCache(cacheKey, currentVol, booksOut, cachedUsedHelpers, `本周已领图书: ${booksOut.join(", ")}`);
        $.log(`[WeRead] ✅ 本周已领图书: ${booksOut.join(", ")}`);
        notifyFree("本周配额已满", booksOut.join("、") + "\n官方配额每期 2 本，下期周四更新后再试");
        return;
    }

    // 6. 候选池：规避已领 / 已购 / 在架，且必须带有效分享鉴权参数
    let claimedTitlesClean = new Set(claimedTitles.map(t => String(t).replace(/[《》]/g, "").trim()));
    let needCount = Math.max(0, MAX_BOOKS_PER_VOL - claimedTitles.length);
    let rawCandidates = books.filter(b =>
        b.received !== 1 &&
        !allTimePaidBookIds.has(String(b.bookId)) &&
        !shelfBookIds.has(String(b.bookId)) &&
        !claimedTitlesClean.has(String(b.title).trim()) &&
        b.v && b.sn
    );

    if (!rawCandidates.length) {
        let msg = claimedTitles.length > 0 ? `本周已领图书: ${claimedTitles.join(", ")}` : "本期限免书库暂无可领新书";
        saveWeekCache(cacheKey, currentVol, claimedTitles, cachedUsedHelpers, msg);
        $.log(`[WeRead] ✅ ${msg}`);
        notifyFree(claimedTitles.length > 0 ? "本周配额已满" : "暂无可领新书", msg);
        return;
    }
    $.log(`[WeRead] 可参与优选的候选新书 ${rawCandidates.length} 本`);

    // 6.5 预算裁剪：先用不依赖评分的条件（分类/关键词）砍掉必被淘汰的书，
    //     再对剩下的补评分。154 本 -> 通常只剩 20~40 本，/book/info 请求量降一个量级。
    let prefiltered = prefilter(rawCandidates);
    auth = await enrichRatings(prefiltered, auth);

    // 7. 打分排序 → 分类多样化挑选（评分补齐后统一走完整过滤）
    let candidates = selectCandidates(prefiltered, needCount);
    if (!candidates.length) {
        let msg = `全部候选均未达到门槛（人数>=${CFG.minCount}${CFG.maxCount > 0 ? " 且 <=" + CFG.maxCount : ""}、好评>=${(CFG.minRating / 10).toFixed(1)}%），本周放弃领取，不浪费名额`;
        $.log("[WeRead] ⚠️ " + msg);
        notifyFree("本期无可入架好书", msg);
        return;
    }

    $.log("[WeRead] 📚 智能优选候选（人数对数为主排序，好评率为次排序，前 3 本）：");
    candidates.slice(0, 3).forEach((c, idx) => {
        $.log(`  ${idx + 1}. 《${c.title}》 ${ratingTagOf(c)} 售价: ${c.price.toFixed(1)}书币 (得分: ${scoreBook(c)})`);
    });

    let targetBooks = pickTargets(candidates, needCount);
    if (targetBooks.length > 1) {
        $.log(`[WeRead] 🎯 本次目标: ${targetBooks.map(b => `《${b.title}》`).join(", ")}${CFG.diversify ? "（已开启分类多样化）" : ""}`);
    }

    // 8. 助力领取：多小号轮替（官方规则每个小号每周限助力 1 本）
    let result = {
        addedBooks: claimedTitles.slice(),
        unclaimedBooks: [],
        usedHelpers: cachedUsedHelpers
    };

    let helperList = getHelperList(auth.vid);
    let availableHelpers = [];

    if (helperList.length > 0) {
        $.log(`[WeRead] 检测到 ${helperList.length} 个助力小号 [${helperList.map(h => maskVid(h.vid)).join(", ")}]，启动轮替助力流程...`);

        let usedHelperMap = new Map();
        cachedUsedHelpers.forEach(u => {
            if (u && u.vid) usedHelperMap.set(String(u.vid), u.bookTitle || "已领图书");
        });

        // 兼容旧缓存：缺 usedHelpers 但已有已领图书时，按顺序推断前 N 个小号已消耗
        if (usedHelperMap.size === 0 && cachedAddedBooks.length > 0) {
            for (let i = 0; i < Math.min(cachedAddedBooks.length, helperList.length); i++) {
                let hVid = String(helperList[i].vid);
                if (hVid) {
                    let bookName = cachedAddedBooks[i] || `第${i + 1}本已领图书`;
                    usedHelperMap.set(hVid, bookName);
                    cachedUsedHelpers.push({ vid: hVid, bookTitle: bookName, time: Date.now() });
                }
            }
        }

        helperList.forEach(h => {
            let hVid = String(h.vid);
            if (usedHelperMap.has(hVid)) {
                let bName = String(usedHelperMap.get(hVid));
                let formatted = bName.startsWith("《") ? bName : `《${bName}》`;
                $.log(`[WeRead] ℹ️ 小号 [${maskVid(hVid)}] 本周已成功助力${formatted}，已消耗周配额，自动跳过`);
            } else {
                availableHelpers.push(h);
            }
        });

        if (availableHelpers.length === 0) {
            $.log("[WeRead] ℹ️ 所有配置的小号本周助力配额已全部消耗（每个小号每周限助力 1 本）");
        }
    } else if (!CFG.helperRaw) {
        $.log("[WeRead] ℹ️ 未配置助力小号（helper），将只生成微信一键直达领取链接");
    }

    if (availableHelpers.length > 0) {
        let helperIdx = 0;
        let candidateIdx = 0;

        while (helperIdx < availableHelpers.length && result.addedBooks.length < MAX_BOOKS_PER_VOL && candidateIdx < candidates.length) {
            let curHelper = availableHelpers[helperIdx];
            let helperVid = String(curHelper.vid);
            let helperSkey = curHelper.wrSkey || curHelper.accessToken || curHelper.skey || "";
            let maskH = maskVid(helperVid);
            let b = candidates[candidateIdx];

            $.log(`[WeRead] 正在使用小号 [${maskH}] 尝试助力领取《${b.title}》...`);

            if (!helperSkey && curHelper.refreshToken && curHelper.deviceId) {
                let refreshedHelper = await tryRefreshLogin(curHelper, null);
                if (refreshedHelper) {
                    helperSkey = refreshedHelper.wrSkey || refreshedHelper.accessToken || refreshedHelper.skey || "";
                    curHelper.rawCookie = buildHelperCookie(curHelper);
                }
            }

            let actUrl = `https://weread.qq.com/book-detail/api/activities?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${currentVol}&platform=ios_html`;
            let actHeaders = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.78(0x18004e31) NetType/WIFI Language/zh_CN",
                "Referer": `https://weread.qq.com/book-detail?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${currentVol}`,
                "Cookie": curHelper.rawCookie || buildHelperCookie(curHelper)
            };

            let actRes = await get(actUrl, actHeaders);

            if (actRes.status === 401) {
                if (curHelper.wrRt || curHelper.wr_rt) {
                    let renewed = await tryWebRenewal(curHelper);
                    if (renewed) {
                        helperSkey = renewed.wrSkey || "";
                        actHeaders.Cookie = curHelper.rawCookie || buildHelperCookie(curHelper);
                        actRes = await get(actUrl, actHeaders);
                    }
                }
                if (actRes.status === 401 && curHelper.refreshToken && curHelper.deviceId) {
                    $.log(`[WeRead] 助力小号 [${maskH}] Session 过期，尝试脱机自愈换票 (/login)...`);
                    let refreshedHelper = await tryRefreshLogin(curHelper, null);
                    if (refreshedHelper) {
                        helperSkey = refreshedHelper.wrSkey || refreshedHelper.accessToken || refreshedHelper.skey || "";
                        actHeaders.Cookie = buildHelperCookie(curHelper);
                        actRes = await get(actUrl, actHeaders);
                    }
                } else if (actRes.status === 401 && !(curHelper.wrRt || curHelper.wr_rt)) {
                    $.log(`[WeRead] ⚠️ 助力小号 [${maskH}] 当前 skey 已过期，且缺少 wr_rt / refreshToken 续期种子`);
                }
            }

            let actData = decode(actRes.body);
            let errMsg = (actData && (actData.errMsg || actData.errmsg)) || "";
            let errCode = actData && typeof actData.errCode !== "undefined"
                ? actData.errCode
                : (actData && typeof actData.errcode !== "undefined" ? actData.errcode : null);

            let isSuccess = false;
            if (actRes.status === 200) {
                if (!actData) isSuccess = true;
                else if (actData.succ === 1) isSuccess = true;
                else if (!errMsg && (errCode === 0 || errCode === null)) isSuccess = true;
            }

            if (isSuccess) {
                let bookTitleFormatted = `《${b.title}》`;
                if (result.addedBooks.indexOf(bookTitleFormatted) === -1) result.addedBooks.push(bookTitleFormatted);
                $.log(`[WeRead] 🎉 小号 [${maskH}] 助力领取成功: ${bookTitleFormatted} (售价: ${b.price.toFixed(1)}书币)`);

                cachedUsedHelpers.push({ vid: helperVid, bookTitle: bookTitleFormatted, time: Date.now() });
                helperIdx++;     // 该小号配额已消耗，换下一个
                candidateIdx++;  // 本书已入架，换下一本

                shelfBookIds.add(String(b.bookId));
                allTimePaidBookIds.add(String(b.bookId));
                try {
                    await post(API + "/shelf/syncbook", JSON.stringify({ bookIds: [String(b.bookId)], albumIds: [] }), getHeaders(auth));
                } catch (e) { }

                // 即时落盘，异常中断也不丢成果
                saveWeekCache(cacheKey, currentVol, result.addedBooks, cachedUsedHelpers, `本周已领图书: ${result.addedBooks.join(", ")}`);
            } else {
                let fullErrMsg = errMsg || (errCode !== null ? `errCode: ${errCode}` : `HTTP ${actRes.status}`);
                $.log(`[WeRead] ❌ 小号 [${maskH}] 助力领取《${b.title}》未成功: ${fullErrMsg}`);

                // 官方配额保护：已领满 2 本时不再继续消耗请求
                if ((String(fullErrMsg).includes("-2057") || errCode === -2057) && result.addedBooks.length >= MAX_BOOKS_PER_VOL) {
                    $.log("[WeRead] ℹ️ 触发官方配额保护：主账号本期免费好书已达上限(2本)，停止后续助力");
                    result.unclaimedBooks = [];
                    break;
                }

                // 单本书名额被抢空时，允许该小号回退尝试下一本候选
                if (!curHelper.failCount) curHelper.failCount = 0;
                curHelper.failCount++;

                if (curHelper.failCount < 2 && (candidateIdx + 1) < candidates.length) {
                    candidateIdx++;
                    $.log(`[WeRead] 🔄 小号 [${maskH}] 助力受阻，自动回退尝试候选池下一本《${candidates[candidateIdx].title}》...`);
                } else {
                    $.log(`[WeRead] ⚠️ 小号 [${maskH}] 连续助力受阻(${fullErrMsg})：可能本周已助力过他人，或该账号未在微信内活跃`);
                    helperIdx++;
                    candidateIdx++;
                }
            }
            await sleep(1000);
        }
    }

    // 9. 未入架名额：生成微信一键直达领取链接
    let remainingNeeded = Math.max(0, MAX_BOOKS_PER_VOL - result.addedBooks.length);
    if (remainingNeeded > 0 && CFG.fallbackLink) {
        let unadded = candidates.filter(c => result.addedBooks.indexOf(`《${c.title}》`) === -1);
        unadded.slice(0, remainingNeeded).forEach(b => {
            result.unclaimedBooks.push({ title: b.title, url: buildClaimLink(auth, b, freeTimestamp, currentVol) });
        });
        if (result.unclaimedBooks.length > 0) {
            $.log(`[WeRead] 📎 已生成 ${result.unclaimedBooks.length} 条微信一键直达领取链接`);
        }
    } else if (remainingNeeded > 0 && !CFG.fallbackLink) {
        $.log("[WeRead] ℹ️ 兜底链接已关闭（fallbackLink=false），未入架名额不生成链接");
    }

    // 10. 收尾：落盘 + 通知
    if (result.addedBooks.length > 0) {
        let details = `本周已领图书: ${result.addedBooks.join(", ")}`;
        saveWeekCache(cacheKey, currentVol, result.addedBooks, result.usedHelpers, details);
        try {
            await get(API + "/shelf/sync?album=1&onlyBookid=1", getHeaders(auth));
        } catch (e) { }
        $.log(`[WeRead] ✅ ${details}`);
    } else {
        $.log("[WeRead] ⚠️ 本周未能自动入架任何图书");
    }

    let helperMasks = [];
    result.usedHelpers.forEach(u => {
        if (u && u.vid) {
            let m = maskVid(u.vid);
            if (helperMasks.indexOf(m) === -1) helperMasks.push(m);
        }
    });

    let lines = [];
    if (result.addedBooks.length > 0) {
        lines.push(`本周已领: ${result.addedBooks.join("、")}`);
    }
    if (helperMasks.length > 0) {
        lines.push(`助力小号: ${helperMasks.join("、")}`);
    }
    if (result.unclaimedBooks.length > 0) {
        if (lines.length > 0) lines.push("");
        lines.push("另有未入架图书，请在微信中点击链接领取:");
        result.unclaimedBooks.forEach((b, idx) => {
            lines.push(`${idx + 1}. 《${b.title}》: ${b.url}`);
        });
    }
    if (lines.length === 0) {
        lines.push("本次未能自动入架，请在微信读书「免费图书馆」手动领取");
    }

    let subtitle;
    if (result.addedBooks.length >= MAX_BOOKS_PER_VOL) subtitle = "本周已领满 2 本";
    else if (result.addedBooks.length > 0) subtitle = `已领 ${result.addedBooks.length} 本`;
    else if (result.unclaimedBooks.length > 0) subtitle = "请点击链接手动领取";
    else subtitle = "本周未入架";

    notifyFree(subtitle, lines.join("\n"));
}

// ============================================================
// 运行环境与入口
// ============================================================

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

async function main() {
    try {
        if (typeof $request !== "undefined") {
            $done({});
            return;
        }
        await runFreeBooks();
    } catch (e) {
        $.msg("WeRead · 限免入架", "执行异常", String(e));
    }
    $done({});
}

if (typeof module === "undefined" || !module.exports) {
    main();
}

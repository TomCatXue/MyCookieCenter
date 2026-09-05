/*
#!name=微信读书·每周限免好书入架
#!desc=每周自动拉取微信读书官方限免书库与推荐好书，一键批量加入个人书架，防止错过限免好书。
#!author=Codex
#!homepage=https://github.com/TomCatXue/MyCookieCenter
#!icon=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/icons/weread.png
#!tag=微信读书,限免,加书架

MITM 与 cron 规则统一由 loon/CookieCenter.plugin 配置：
- 每周五限免入架 cron -> 本文件（每周五 10:00）
- 每日领取 cron -> weread_claim.js（每日 23:00）
- 周二翻牌 cron -> weread_flip.js（每周二 20:00）
参数面板由 boxjs/CookieCenter.boxjs.json 订阅提供。
*/

const AUTH_KEY = "weread_auth_v2";
const SCRIPT_VERSION = "2026-09-05-auto-refresh";
const API = "https://i.weread.qq.com";
const PF = "weread_wx-2001-iap-2001-iphone";

let $ = new Env("WeRead · 限免入架");

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
    try {
        if (typeof $base64 !== "undefined") {
            return JSON.parse($base64.decode(str));
        }
        return JSON.parse(str);
    } catch (e) {
        return null;
    }
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

// 全自动脱机换票刷新
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

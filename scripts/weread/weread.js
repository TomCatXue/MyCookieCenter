/**
 * 微信读书 · 全功能任务
 * 
 * 每日阅读时长领卡 + 周二翻牌抽奖 + 周五限免图书入架 (支持全自动脱机自愈换票)
 * cron: 0 23 * * *
 * new Env('微信读书 · 全功能任务')
 */

/*
================================================================================
@Name: 微信读书 · 全功能自动化任务（青龙面板专版）
@Author: TomCatXue
@Version: 3.2.1
@Updated: 2026-09-18
================================================================================
使用说明：
- 青龙面板【只需配置 1 个环境变量】: WEREAD_AUTH (填入凭据 JSON 字符串即可)
- 各功能开关直接在下方的 CONFIG 对象中修改 true 或 false，无需在面板配复杂环境变量！
- 具有 100% 脱机自愈换票能力：凭借 refreshToken + deviceId，过期自动刷新，无感续用！
================================================================================
*/

// ================================================================================
// ⚙️ 核心开关与偏好配置（在下方直接修改 true 或 false 即可）
// ================================================================================
const CONFIG = {
    // 1. 【每日阅读时长领卡】：每日 23:00 自动检查达标阅读时长与连续签到天数并领奖
    ENABLE_CLAIM: true,

    // 2. 【周二翻牌游戏抽奖】：每周二自动执行翻牌抽奖（非周二自动跳过，无需手动管理）
    ENABLE_FLIP: true,

    // 3. 【周五限免图书入架】：每周五自动拉取官方免费图书馆好书批量入架（非周五自动跳过）
    ENABLE_FREE: true,

    // 4. 【奖励偏好设置】：true = 优先书币（推荐）；false = 优先体验卡
    PREFER_COIN: true,

    // 5. 【测试/强制执行模式】：平时请保持 false。设为 true 时无视星期几，立即强制把翻牌、限免全部执行一遍
    FORCE_RUN: false,

    // 6. 【备用凭证填入口】：推荐在青龙环境变量配置 WEREAD_AUTH。若不想配环境变量，也可直接将 JSON 粘贴在此引号内：
    MANUAL_AUTH: ""
};

// ================================================================================
// 常量与系统配置
// ================================================================================
const SCRIPT_NAME = "微信读书 · 全功能任务";
const SCRIPT_VERSION = "3.2.1";
const AUTH_KEY = "weread_auth_v2";
const CACHE_FILE = "./weread_session.json";
const API = "https://i.weread.qq.com";
const FLIP_API = "https://weread.qq.com/flip-card-game/api";
const PF = "weread_wx-2001-iap-2001-iphone";

// ============================================================
// 1. 双栖环境兼容层 (Node.js / 青龙 / Loon / Surge / QX)
// ============================================================
function Env(name) {
    this.name = name;
    this.isNode = typeof process !== "undefined" && Object.prototype.toString.call(process) === "[object process]";
    this.isLoon = typeof $loon !== "undefined";
    this.isSurge = typeof $httpClient !== "undefined" && !this.isLoon;
    this.isQuanX = typeof $task !== "undefined";

    this.getdata = function (k) {
        if (this.isNode) {
            const fs = require("fs");
            if (fs.existsSync(CACHE_FILE)) {
                try {
                    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
                    if (cached && (cached[k] || cached.vid)) {
                        return cached[k] ? JSON.stringify(cached[k]) : JSON.stringify(cached);
                    }
                } catch (e) { }
            }
            return process.env[k] || process.env[k.toUpperCase()] || null;
        }
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
        return null;
    };

    this.setdata = function (v, k) {
        if (this.isNode) {
            const fs = require("fs");
            try {
                let cached = {};
                if (fs.existsSync(CACHE_FILE)) {
                    try { cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")); } catch (e) { }
                }
                try {
                    cached[k] = JSON.parse(v);
                } catch (e) {
                    cached[k] = v;
                }
                fs.writeFileSync(CACHE_FILE, JSON.stringify(cached, null, 2), "utf-8");
                return true;
            } catch (e) {
                return false;
            }
        }
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
        return false;
    };

    this.log = function (...args) {
        const timeStr = new Date().toLocaleTimeString();
        console.log(`[${timeStr}]`, ...args);
    };

    this.msg = async function (title, subtitle, body) {
        this.log(`\n📣【${title}】${subtitle ? subtitle + ' - ' : ''}${body}`);
        if (this.isNode) {
            try {
                const notify = require("./sendNotify");
                if (notify && notify.sendNotify) {
                    await notify.sendNotify(title, `${subtitle}\n${body}`);
                }
            } catch (e) { }
        } else if (typeof $notification !== "undefined") {
            $notification.post(title, subtitle, body);
        }
    };

    this.done = function (val = {}) {
        if (typeof $done !== "undefined") $done(val);
    };
}

const $ = new Env(SCRIPT_NAME);

// 纯原生 HTTP 请求器，Node.js 零第三方包依赖
function request(options) {
    return new Promise((resolve, reject) => {
        if (typeof $httpClient !== "undefined") {
            const method = (options.method || "GET").toLowerCase();
            $httpClient[method](options, (err, res, data) => {
                if (err) reject(err);
                else resolve({ status: res.status || res.statusCode, headers: res.headers || {}, body: data });
            });
            return;
        }

        // Node.js fallback
        const https = require("https");
        const http = require("http");
        const urlObj = new URL(options.url);
        const client = urlObj.protocol === "http:" ? http : https;

        const headers = Object.assign({}, options.headers || {});
        let bodyData = options.body;
        if (bodyData && typeof bodyData === "object" && !Buffer.isBuffer(bodyData)) {
            bodyData = JSON.stringify(bodyData);
            if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
        }
        if (bodyData) {
            headers["Content-Length"] = Buffer.byteLength(bodyData);
        }

        const reqOpts = {
            method: options.method || "GET",
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === "http:" ? 80 : 443),
            path: urlObj.pathname + urlObj.search,
            headers: headers,
            timeout: options.timeout || 15000
        };

        const req = client.request(reqOpts, (res) => {
            const chunks = [];
            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => {
                const bodyStr = Buffer.concat(chunks).toString("utf-8");
                resolve({ status: res.statusCode, headers: res.headers, body: bodyStr });
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timeout"));
        });

        if (bodyData) req.write(bodyData);
        req.end();
    });
}

const get = (url, headers = {}) => request({ method: "GET", url, headers });
const post = (url, body, headers = {}) => request({ method: "POST", url, body, headers });

// ============================================================
// 2. 纯 JS S-box 逆向算法与 /login 换票自愈引擎
// (逆向还原自 WeRead 10.2.0 ARM64 sub_1004d7878，100% 精度还原)
// ============================================================
const WE_READ_TABLE_HEX = "34ca55401db693c63130293532a7b811c2b516fa8bb124a4109004e908f83b8a9c8c44f9bc5c69e2a1dad2d37589f71e2d5056d77253bf22fb200f012e45876e6648f2e0cdfe67a943f49451cea54aee13268eccaa33145d0e39bbcf912b814dea99ec1a2c85c5d936744b18e1f13d9d419fb4170dd64cbedcaf972877f062ff71c1c8278f6c68a89be6591c1b1209984e3f063700ba1f0a192fc9d5d057496ffd25e4610c42cb96645fdbad60238d9a6dc3c45e3eb9926abd5b077f7695ed4fab847a80e778c7e5eb73836bfc38467d4765b352633a05d1efa3a6de9e3c02aeb27ba0f6f32ac0ac86035a540bf582d47ee3dfb0d8dd21e87c88a2795870b715";
const WE_READ_TABLE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
    WE_READ_TABLE[i] = parseInt(WE_READ_TABLE_HEX.substr(i * 2, 2), 16);
}

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
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
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
    for (let i = 0; i < bytes.length; i++) s += hex[bytes[i] >> 4] + hex[bytes[i] & 0xf];
    return s;
}

function subBytes(str) {
    const b = strToBytes(str);
    const out = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) out[i] = WE_READ_TABLE[b[i]];
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

function decode(str) {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { }
    try {
        if (typeof Buffer !== "undefined") {
            return JSON.parse(Buffer.from(str, "base64").toString("utf-8"));
        }
    } catch (e) { }
    return null;
}

// 核心自愈：通过 /login 换票刷新 skey 与 wr_skey
async function tryRefreshLogin(auth) {
    if (!auth || !auth.refreshToken || !auth.deviceId) {
        $.log("[WeRead] ⚠️ /login 换票跳过：缺少 refreshToken 或 deviceId，请先在手机 App 中退出并重登一次以捕获长效种子");
        return null;
    }

    let ts = Math.floor(Date.now() / 1000);
    let random = Math.floor(Math.random() * 900000000) + 100000000;
    let sig = computeLoginSignature(auth.refreshToken, auth.deviceId, { random, timestamp: ts });

    let reqBody = JSON.stringify({
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
    });

    $.log(`[WeRead] 🔄 正在发起脱机换票 (/login) (ts=${ts}, sig=${sig.slice(0, 8)}...)...`);

    try {
        let r = await post(
            API + "/login",
            reqBody,
            {
                "User-Agent": auth.ua || "WeRead/8.2.6 (iPhone; iOS 26.6.2; Scale/3.00)",
                "Content-Type": "application/json",
                "basever": auth.basever || "8.2.6.20",
                "channelid": auth.channelid || "AppStore",
                "v": auth.basever || "8.2.6.20",
                "vid": String(auth.vid || "")
            }
        );

        if (r.status !== 200) {
            $.log(`[WeRead] ❌ /login 换票接口返回 HTTP ${r.status}: ${(r.body || "").slice(0, 100)}`);
            return null;
        }

        let loginData = decode(r.body);
        if (!loginData || !loginData.vid || !loginData.skey) {
            $.log(`[WeRead] ❌ /login 响应数据异常: ${(r.body || "").slice(0, 120)}`);
            return null;
        }

        let newAuth = Object.assign(auth, {
            vid: String(loginData.vid),
            skey: loginData.skey,
            accessToken: loginData.accessToken || auth.accessToken || "",
            refreshToken: loginData.refreshToken || auth.refreshToken,
            authTime: Date.now(),
            openId: loginData.openId || auth.openId,
            wrVid: String(loginData.vid),
            wrSkey: loginData.accessToken || loginData.skey,
            flipTime: Date.now()
        });

        // 自动回写存储 (青龙写本地缓存文件，Loon 写 persistentStore)
        $.setdata(JSON.stringify(newAuth), AUTH_KEY);
        $.log(`[WeRead] 🎉 成功实现脱机换票！新 skey=${newAuth.skey.slice(0, 8)}..., wrSkey 已同步`);
        return newAuth;
    } catch (e) {
        $.log(`[WeRead] ❌ 换票网络异常: ${e.message || e}`);
        return null;
    }
}

// ============================================================
// 3. 业务子任务一：每日阅读时长与签到领卡 (Claim)
// ============================================================
async function runClaimTask(auth) {
    $.log("\n▶️ --- 开始执行任务：[每日阅读奖励领取] ---");
    let result = { task: "每日阅读领卡", success: false, details: "" };

    const getHeaders = (a) => ({
        "User-Agent": a.ua || "WeRead/8.2.6 (iPhone; iOS 26.6.2; Scale/3.00)",
        "Content-Type": "application/json",
        "Accept": "*/*",
        "basever": a.basever || "8.2.6.20",
        "channelid": a.channelid || "AppStore",
        "v": a.basever || "8.2.6.20",
        "vid": String(a.vid || ""),
        "skey": a.skey || ""
    });

    let probeBody = JSON.stringify({ awardLevelId: 0, unread: 1, isExchangeAward: 0, pf: PF, awardChoiceType: 0 });
    let probe = await post(API + "/weekly/exchange", probeBody, getHeaders(auth));

    // 401 自动触发脱机换票
    if (probe.status === 401 || probe.status === 499) {
        $.log("[WeRead] 遇到 401/499，立即启动脱机自愈换票...");
        let refreshed = await tryRefreshLogin(auth);
        if (refreshed) {
            auth = refreshed;
            probe = await post(API + "/weekly/exchange", probeBody, getHeaders(auth));
        }
    }

    if (probe.status !== 200) {
        result.details = `探测鉴权失败 HTTP ${probe.status}`;
        $.log(`[WeRead] ❌ ${result.details}`);
        return result;
    }

    let queryData = decode(probe.body);
    let readingMin = Math.floor((queryData?.readingTime || 0) / 60);
    let readingDay = queryData?.readingDay || 0;

    // 领取阅读达标奖励 (时长 + 天数)
    let preferCoin = (typeof process !== "undefined" && process.env.WEREAD_PREFER_COIN !== undefined)
        ? process.env.WEREAD_PREFER_COIN === "2"
        : CONFIG.PREFER_COIN;
    let choiceType = preferCoin ? 2 : 1; // 2=书币, 1=体验卡

    let allAwards = [
        ...(queryData?.readtimeAwards || []).map(a => Object.assign(a, { _type: "时长" })),
        ...(queryData?.readdayAwards || []).map(a => Object.assign(a, { _type: "天数" }))
    ];

    let claimList = [];
    for (let item of allAwards) {
        let levelDesc = item.awardLevelDesc || ("档位" + item.awardLevelId);
        if (item.awardStatus === 1) { // 1 = 可领取
            $.log(`[WeRead] 检测到待领奖励: ${item._type}[${levelDesc}]，正在自动兑换...`);
            let exBody = JSON.stringify({
                unread: 1,
                awardChoiceType: choiceType,
                awardLevelId: item.awardLevelId,
                isExchangeAward: 1,
                pf: PF
            });
            let exRes = await post(API + "/weekly/exchange", exBody, getHeaders(auth));
            if (exRes.status === 200) {
                claimList.push(`${item._type}[${levelDesc}]`);
                $.log(`[WeRead] 🎉 成功领取: ${item._type}[${levelDesc}]`);
            }
        }
    }

    result.success = true;
    result.details = `本周已读: ${readingMin}分钟(${readingDay}天)` + (claimList.length > 0 ? `, 成功领取: ${claimList.join(', ')}` : `, 今日已达标项目均已在账`);
    $.log(`[WeRead] ✅ ${result.details}`);
    return result;
}

// ============================================================
// 4. 业务子任务二：每周二翻牌游戏自动抽奖 (Flip)
// ============================================================
async function runFlipTask(auth) {
    $.log("\n▶️ --- 开始执行任务：[周二翻牌抽奖] ---");
    let result = { task: "周二翻牌抽奖", success: false, details: "" };

    const FLIP_CARD_ORDER = [2, 5, 4, 7, 8, 6, 0, 1, 3];
    const getFlipHeaders = (a) => {
        let wrVid = a.wrVid || a.vid || "";
        let wrSkey = a.wrSkey || a.accessToken || a.skey || "";
        let flipUa = a.flipUa || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)";
        return {
            "User-Agent": flipUa,
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://weread.qq.com/flip-card-game",
            "Cookie": `wr_skey=${wrSkey}; wr_vid=${wrVid}`
        };
    };

    let listRes = await get(FLIP_API + "/flipCardList?pf=ios&platform=ios_html", getFlipHeaders(auth));
    if (listRes.status === 401 || listRes.status === 499 || listRes.status === 403) {
        $.log("[WeRead] 翻牌 Cookie 过期，启动脱机换票自愈...");
        let refreshed = await tryRefreshLogin(auth);
        if (refreshed && refreshed.wrSkey) {
            auth = refreshed;
            listRes = await get(FLIP_API + "/flipCardList?pf=ios&platform=ios_html", getFlipHeaders(auth));
        }
    }

    if (listRes.status !== 200) {
        result.details = `查询翻牌列表失败 HTTP ${listRes.status}`;
        $.log(`[WeRead] ❌ ${result.details}`);
        return result;
    }

    let listData = null;
    try { listData = JSON.parse(listRes.body); } catch (e) { }
    let flipList = listData?.flipList || [];
    let remaining = Math.max(0, 6 - flipList.length);

    if (remaining <= 0) {
        result.success = true;
        result.details = `本周已完成全部 6 次翻牌`;
        $.log(`[WeRead] ✅ ${result.details}`);
        return result;
    }

    let flippedPrizes = [];
    for (let targetIndex of FLIP_CARD_ORDER) {
        if (flipList.includes(targetIndex)) continue;

        let giftIndex = flipList.length;
        let drawRes = await post(
            FLIP_API + "/flipCard",
            JSON.stringify({ cardIndex: targetIndex, giftIndex: giftIndex, pf: "ios" }),
            Object.assign(getFlipHeaders(auth), { "Content-Type": "application/json" })
        );

        if (drawRes.status === 200) {
            let resData = null;
            try { resData = JSON.parse(drawRes.body); } catch (e) { }
            let prize = resData?.prizeName || resData?.reward || "奖励入账";
            flippedPrizes.push(`位置${targetIndex}[${prize}]`);
            flipList.push(targetIndex);
            $.log(`[WeRead] 🎯 翻牌成功: 位置 ${targetIndex} -> ${prize}`);
        } else {
            break;
        }
        await new Promise(r => setTimeout(r, 1500));
    }

    result.success = true;
    result.details = flippedPrizes.length > 0 ? `完成 ${flippedPrizes.length} 次翻牌: ${flippedPrizes.join(', ')}` : `今日无可用翻牌次数`;
    $.log(`[WeRead] ✅ ${result.details}`);
    return result;
}

// ============================================================
// 5. 业务子任务三：每周五免费图书馆好书自动入架 (Free)
// ============================================================
async function runFreeTask(auth) {
    $.log("\n▶️ --- 开始执行任务：[周五限免好书入架] ---");
    let result = { task: "周五限免入架", success: false, details: "" };

    const getHeaders = (a) => ({
        "User-Agent": a.ua || "WeRead/8.2.6 (iPhone; iOS 26.6.2; Scale/3.00)",
        "Content-Type": "application/json",
        "channelid": a.channelid || "AppStore",
        "basever": a.basever || "8.2.6.20",
        "v": a.basever || "8.2.6.20",
        "vid": String(a.vid || ""),
        "skey": a.skey || ""
    });

    let listRes = await get(API + "/free/library/list?count=120&receiveStatus=1&type=book&v=2", getHeaders(auth));
    if (listRes.status === 401 || listRes.status === 499) {
        $.log("[WeRead] 限免图书接口 401/499，启动脱机换票自愈...");
        let refreshed = await tryRefreshLogin(auth);
        if (refreshed) {
            auth = refreshed;
            listRes = await get(API + "/free/library/list?count=120&receiveStatus=1&type=book&v=2", getHeaders(auth));
        }
    }

    if (listRes.status !== 200) {
        result.details = `拉取限免书库失败 HTTP ${listRes.status}`;
        $.log(`[WeRead] ❌ ${result.details}`);
        return result;
    }

    let freeData = decode(listRes.body);
    let books = freeData?.books || [];
    if (!books.length) {
        result.success = true;
        result.details = "本期限免书库暂无新书或已全入架";
        return result;
    }

    let addedBooks = [];
    for (let b of books.slice(0, 2)) {
        let bInfo = b.bookInfo || b;
        let bId = bInfo.bookId || bInfo.id;
        let bTitle = bInfo.title || bInfo.name || "图书";
        if (bId) {
            let addRes = await post(API + "/shelf/add", JSON.stringify({ bookId: String(bId) }), getHeaders(auth));
            if (addRes.status === 200) {
                addedBooks.push(`《${bTitle}》`);
            }
        }
    }

    result.success = true;
    result.details = addedBooks.length > 0 ? `成功加入书架: ${addedBooks.join(', ')}` : "本期限免好书已在书架中";
    $.log(`[WeRead] ✅ ${result.details}`);
    return result;
}

// ============================================================
// 6. 主控调度引擎 (调度管理、开关判断、多账号循环)
// ============================================================
async function main() {
    $.log("==================================================");
    $.log(`     ${SCRIPT_NAME} (v${SCRIPT_VERSION})     `);
    $.log("==================================================");

    // 1. 获取账号配置列表（优先环境变量，次选顶部 MANUAL_AUTH）
    let rawAuth = (typeof process !== "undefined" && (process.env.WEREAD_AUTH || process.env.WEREAD_COOKIE))
        || $.getdata("WEREAD_AUTH")
        || $.getdata("WEREAD_COOKIE")
        || $.getdata(AUTH_KEY)
        || CONFIG.MANUAL_AUTH;

    // 自动容错：清理 Markdown 或网页端复制时引入的反斜杠转义 (如 \_ 或 \@)
    if (typeof rawAuth === "string") {
        rawAuth = rawAuth.replace(/\\([_@])/g, "$1");
    }

    if (!rawAuth) {
        $.log("❌ 未检测到登录凭据！");
        $.log("💡 配置指引（青龙面板只需配置 1 个环境变量）：");
        $.log("1. 在青龙面板「环境变量」中新建 WEREAD_AUTH，填入从 BoxJS 或手机抓包导出的 JSON 凭证；");
        $.log("2. 只要凭据中包含 refreshToken 与 deviceId，脚本在此后永久全自动脱机换票！");
        return;
    }

    let accounts = [];
    if (typeof rawAuth === "string" && rawAuth.trim().startsWith("[")) {
        try { accounts = JSON.parse(rawAuth); } catch (e) { }
    } else if (typeof rawAuth === "string" && rawAuth.trim().startsWith("{")) {
        try { accounts = [JSON.parse(rawAuth)]; } catch (e) { }
    } else if (typeof rawAuth === "string") {
        let lines = rawAuth.split(/[\n&]+/).map(s => s.trim()).filter(Boolean);
        for (let l of lines) {
            if (l.startsWith("{")) {
                try { accounts.push(JSON.parse(l)); } catch (e) { }
            } else if (l.includes("#") || l.includes("@")) {
                let parts = l.split(/[#@]+/);
                accounts.push({ vid: parts[0], skey: parts[1], refreshToken: parts[2] || "", deviceId: parts[3] || "" });
            }
        }
    } else if (typeof rawAuth === "object") {
        accounts = Array.isArray(rawAuth) ? rawAuth : [rawAuth];
    }

    if (!accounts.length) {
        $.log("❌ 凭证格式解析失败，请检查格式！");
        return;
    }

    // 2. 检查子任务开关与星期几智能调度
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 2=周二, 5=周五
    const isTuesday = dayOfWeek === 2;
    const isFriday = dayOfWeek === 5;
    const forceRun = (typeof process !== "undefined" && process.env.FORCE_RUN !== undefined)
        ? String(process.env.FORCE_RUN).toLowerCase() === "true"
        : (CONFIG.FORCE_RUN || process?.argv?.includes("--force"));

    // 开关由顶部 CONFIG 直接控制，兼顾环境变量覆盖
    let envTasks = typeof process !== "undefined" ? process.env.WEREAD_TASKS : null;
    const canClaim = envTasks ? envTasks.includes("claim") : CONFIG.ENABLE_CLAIM;
    const canFlip = (envTasks ? envTasks.includes("flip") : CONFIG.ENABLE_FLIP) && (isTuesday || forceRun);
    const canFree = (envTasks ? envTasks.includes("free") : CONFIG.ENABLE_FREE) && (isFriday || forceRun);

    $.log(`📅 当前时间: ${now.toLocaleString()} (星期${['日','一','二','三','四','五','六'][dayOfWeek]})`);
    $.log(`⚙️ 任务队列: [每日领卡: ${canClaim ? '执行' : '跳过'}] [周二翻牌: ${canFlip ? '执行' : (isTuesday ? '已禁用' : '非周二跳过')}] [周五限免: ${canFree ? '执行' : (isFriday ? '已禁用' : '非周五跳过')}]`);

    const summaryReport = [];

    // 3. 循环遍历所有账号执行任务
    for (let i = 0; i < accounts.length; i++) {
        let auth = accounts[i];
        let vidMask = (auth.vid ? String(auth.vid).slice(0, 4) + '****' : `账号${i + 1}`);
        $.log(`\n=================== 正在处理账号 [${vidMask}] ===================`);

        let accReports = [];

        // 任务 1: 每日阅读签到领卡
        if (canClaim) {
            let resClaim = await runClaimTask(auth);
            accReports.push(resClaim);
        }

        // 任务 2: 周二翻牌游戏
        if (canFlip) {
            let resFlip = await runFlipTask(auth);
            accReports.push(resFlip);
        }

        // 任务 3: 周五限免图书入架
        if (canFree) {
            let resFree = await runFreeTask(auth);
            accReports.push(resFree);
        }

        let accSummary = accReports.map(r => `• ${r.task}: ${r.details}`).join("\n");
        summaryReport.push(`【${vidMask}】\n${accSummary}`);
    }

    // 4. 汇总通知
    const notifyBody = summaryReport.join("\n\n");
    await $.msg(SCRIPT_NAME, `执行完成 (${accounts.length}个账号)`, notifyBody);
    $.log("\n🏁 所有账号全部任务处理完毕！");
}

main().then(() => $.done()).catch(e => { $.log("❌ 顶层未捕获异常: " + (e.stack || e)); $.done(); });

/**
 * 微信读书 · 全功能任务
 * 
 * 每周日汇总领取本周全部奖励：阅读时长领卡 + 翻牌抽奖 + 限免好书入架 (支持全自动脱机换票)
 * cron: 0 23 * * 0
 * tag: 微信读书
 * @tag 微信读书
 * new Env('微信读书 · 全功能任务')
 */

/*
================================================================================
@Name: 微信读书 · 全功能自动化任务（青龙面板专版）
@Author: TomCatXue
@Version: 1.4.1
@Updated: 2026-10-04
================================================================================
使用说明：
- 核心环境变量：
  1. WEREAD_AUTH (必填)：主账号凭据 JSON 字符串 (包含 refreshToken 与 deviceId 实现 100% 自动脱机换票)
  2. WEREAD_HELPER_AUTH (选填·限免好书全自动)：助力小号凭证。
     - 官方规则：每个小号每周限助力 1 本；主号每周最多领 2 本。
     - 升级特性：支持多小号轮替助力！支持填入 2 个或更多小号（用换行或 & 分隔，亦支持 JSON 数组）。
       配置 2 个小号即可实现每周 2 本限免大作 100% 全自动秒级入架！
     - 支持格式 1：微信直接打开 weread.qq.com 抓取的整串 Cookie (包含 wr_vid 与 wr_skey)
     - 支持格式 2：单行极简格式「小号VID#小号SKEY」 (如 935919483#aKemof5X)
     - 支持格式 3：标准 JSON 凭据 (亦支持脱机换票)
     - 智能通知联动：领到了直接输出书名；没领到自动把官方带签名直达链接发到通知，微信点开秒领！
  3. WEREAD_FREE_MODE (选填·限免优选偏好)：
     - "balanced" (推荐默认): 智能综合。口碑第一，优先高好评如潮大作，同等口碑下选高售价，0评分垫底
     - "price": 最贵白嫖。专挑 99~100 书币的大部头套装，同等价格下有评分者优先
     - "hot": 热门畅销。专挑在读/评价人数过千的高分畅销书，无视价格高低
  4. WEREAD_EXCLUDE_KEYWORDS (选填·排除关键词)：
     - 多个关键词用 | 或逗号隔开，书名包含则自动跳过（例如 "套装|白话版|卷全|全译|真题" 可过滤大部头古籍）
- 各功能开关直接在下方的 CONFIG 对象中修改 true 或 false，无需在面板配复杂环境变量！
================================================================================
*/

// ================================================================================
// ⚙️ 核心开关与偏好配置（在下方直接修改 true 或 false 即可）
// ================================================================================
const CONFIG = {
    // 1. 【阅读时长领卡】：自动检查并兑换本周达标阅读时长与连续阅读天数奖励
    ENABLE_CLAIM: true,

    // 2. 【翻牌游戏抽奖】：自动执行本周翻牌抽奖（已解除星期限制，周日集中领取）
    ENABLE_FLIP: true,

    // 3. 【限免图书入架】：自动拉取本期限免好书入架或助力兑换（已解除星期限制）
    ENABLE_FREE: true,

    // 4. 【奖励偏好设置】：true = 优先书币（推荐）；false = 优先体验卡
    PREFER_COIN: true,

    // 5. 【测试/强制执行模式】：平时请保持 false。设为 true 时无视星期几，立即强制把翻牌、限免全部执行一遍
    FORCE_RUN: false,

    // 6. 【备用凭证填入口】：推荐在青龙环境变量配置 WEREAD_AUTH。若不想配环境变量，也可直接将 JSON 粘贴在此引号内：
    MANUAL_AUTH: "",

    // 7. 【周五限免助力小号凭证】：全自动路径A。推荐在青龙配置 WEREAD_HELPER_AUTH（支持换行/&填入多个小号）：
    HELPER_AUTH: "",

    // 8. 【限免好书智能优选偏好】：支持面板环境变量 WEREAD_FREE_MODE 配置
    //    - "balanced" (推荐默认): 智能综合。口碑第一，优先高好评如潮大作，同等口碑下选高售价，0评分垫底
    //    - "price": 最贵白嫖。专挑 99~100 书币的大部头套装，同等价格下有评分者优先
    //    - "hot": 热门畅销。专挑在读/评价人数过千的高分畅销书，无视价格高低
    FREE_PREFER_MODE: "balanced",

    // 9. 【限免好书排除关键词】(选填)：支持面板环境变量 WEREAD_EXCLUDE_KEYWORDS 配置
    //    多个关键词用 | 或逗号隔开，书名包含则自动跳过（例如 "套装|白话版|卷全|全译|真题" 可过滤大部头古籍）
    FREE_EXCLUDE_KEYWORDS: ""
};

// ================================================================================
// 常量与系统配置
// ================================================================================
const SCRIPT_NAME = "微信读书 · 全功能任务";
const SCRIPT_VERSION = "1.4.1";
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
        this.log(`\n📣【${title}】${subtitle ? subtitle + '\n' : ''}${body}`);
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

function parsePrizeQuantity(prizeStr) {
    let cardDays = 0;
    let coins = 0;
    let books = [];
    if (!prizeStr) return { cardDays, coins, books };

    if (prizeStr.includes("体验卡") || prizeStr.includes("无限卡")) {
        let m = prizeStr.match(/(\d+)\s*天/);
        cardDays += m ? parseInt(m[1], 10) : 1;
    } else if (prizeStr.includes("书币")) {
        let m = prizeStr.match(/(\d+)\s*(?:个|书币)/);
        coins += m ? parseInt(m[1], 10) : 1;
    } else if (prizeStr.includes("《") || prizeStr.includes("书")) {
        books.push(prizeStr);
    }
    return { cardDays, coins, books };
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

// 核心自愈：通过 /login 换票刷新 skey 与 wr_skey (支持指定 storageKey，防止小号换票覆盖主号 AUTH_KEY)
async function tryRefreshLogin(auth, storageKey = AUTH_KEY) {
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

        // 自动回写存储 (仅当指定 storageKey 时回写，防止辅助小号覆盖主号配置)
        if (storageKey) {
            $.setdata(JSON.stringify(newAuth), storageKey);
        }
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
    let result = {
        task: "每日阅读领卡",
        success: false,
        details: "",
        claimedCardDays: 0,
        claimedCoins: 0,
        weekTotalCardDays: 0,
        weekTotalCoins: 0,
        readingMin: 0,
        readingDay: 0,
        claimList: []
    };

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
    result.readingMin = Math.floor((queryData?.readingTime || 0) / 60);
    result.readingDay = queryData?.readingDay || 0;

    let preferCoin = (typeof process !== "undefined" && process.env.WEREAD_PREFER_COIN !== undefined)
        ? process.env.WEREAD_PREFER_COIN === "2"
        : CONFIG.PREFER_COIN;
    let choiceType = preferCoin ? 2 : 1; // 2=书币, 1=体验卡

    let allAwards = [
        ...(queryData?.readtimeAwards || []).map(a => Object.assign(a, { _type: "时长" })),
        ...(queryData?.readdayAwards || []).map(a => Object.assign(a, { _type: "天数" }))
    ];

    for (let item of allAwards) {
        let levelDesc = item.awardLevelDesc || ("档位" + item.awardLevelId);
        if (item.awardStatus === 1) { // 1 = 可领取
            let choice = (item.awardChoices || []).find(c => c.choiceType === choiceType) || item.awardChoices?.[0];
            let gainNum = choice ? choice.awardNum : 1;
            let gainType = choice ? choice.choiceType : choiceType;
            let targetName = gainType === 1 ? `${gainNum}天体验卡` : `${gainNum}书币`;

            $.log(`[WeRead] 检测到待领奖励: ${item._type}[${levelDesc}]，正在自动兑换 ${targetName}...`);
            let exBody = JSON.stringify({
                unread: 1,
                awardChoiceType: choiceType,
                awardLevelId: item.awardLevelId,
                isExchangeAward: 1,
                pf: PF
            });
            let exRes = await post(API + "/weekly/exchange", exBody, getHeaders(auth));
            let exData = decode(exRes.body);
            let isSucc = exRes.status === 200 && (!exData || (!exData.errcode && !exData.errCode && exData.succ !== 0));
            if (isSucc) {
                if (gainType === 1) result.claimedCardDays += gainNum;
                else if (gainType === 2) result.claimedCoins += gainNum;
                result.claimList.push(`${item._type}[${levelDesc}](+${targetName})`);
                $.log(`[WeRead] 🎉 成功领取: ${item._type}[${levelDesc}] (+${targetName})`);
            } else {
                let errMsg = exData?.errmsg || exData?.errMsg || ("HTTP " + exRes.status);
                $.log(`[WeRead] ❌ 领取 ${item._type}[${levelDesc}] 失败: ${errMsg}`);
            }
        }
    }

    result.weekTotalCardDays = result.claimedCardDays;
    result.weekTotalCoins = result.claimedCoins;
    for (let item of allAwards) {
        if (item.awardStatus === 2) {
            let choice = (item.awardChoices || []).find(c => c.choiceType === item.awardChooseType) || item.awardChoices?.[0];
            let num = choice ? choice.awardNum : 1;
            let type = item.awardChooseType || 1;
            if (type === 1) result.weekTotalCardDays += num;
            else if (type === 2) result.weekTotalCoins += num;
        }
    }

    // 查询当前账户实际总余额 (体验卡剩余天数 & 书币)，请求形态与真实抓包一致
    result.accountRemainDays = null;
    result.accountCoins = null;
    try {
        let cardSummaryRes = await get(API + `/pay/memberCardSummary?pf=${PF}&sn=1&source=profile`, getHeaders(auth));
        if (cardSummaryRes.status === 200) {
            let cardData = decode(cardSummaryRes.body);
            if (cardData && typeof cardData.remainTime === "number") {
                result.accountRemainDays = Math.ceil(cardData.remainTime / 86400);
            }
        }
        let balanceRes = await post(API + "/pay/balance", JSON.stringify({ release: 1, requireExpiry: 1, noSnapshot: 0, pf: PF, zoneid: 1 }), getHeaders(auth));
        if (balanceRes.status === 200) {
            let balData = decode(balanceRes.body);
            if (balData) {
                let coins = balData.giftBalance !== undefined ? balData.giftBalance : balData.balance;
                if (typeof coins === "number") result.accountCoins = coins;
            }
        }
    } catch (e) { }

    result.success = true;
    result.details = `本周已读: ${result.readingMin}分钟(${result.readingDay}天), 本周达标已领: 体验卡 ${result.weekTotalCardDays}天 · 书币 ${result.weekTotalCoins}个`
        + (result.accountRemainDays !== null && result.accountCoins !== null ? ` (账户总余: ${result.accountRemainDays}天卡 · ${result.accountCoins}书币)` : "");
    $.log(`[WeRead] ✅ ${result.details}`);
    return result;
}

// ============================================================
// 4. 业务子任务二：每周二翻牌游戏自动抽奖 (Flip)
// ============================================================
async function runFlipTask(auth) {
    $.log("\n▶️ --- 开始执行任务：[翻牌抽奖游戏] ---");
    let result = {
        task: "翻牌抽奖游戏",
        success: false,
        details: "",
        flippedCardDays: 0,
        flippedCoins: 0,
        flippedBooks: [],
        flippedPrizes: [],
        newlyFlipped: 0,
        newlyFlippedPrizes: []
    };

    const FLIP_CARD_ORDER = [2, 5, 4, 7, 8, 6, 0, 1, 3];
    const getFlipHeaders = (a) => {
        let wrVid = a.wrVid || a.vid || "";
        let wrSkey = a.wrSkey || a.accessToken || a.skey || "";
        let flipUa = a.flipUa || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;WeRead/10.2.1 (iPhone; iOS 26.6.1; Scale/3.00)";
        return {
            "User-Agent": flipUa,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Referer": "https://weread.qq.com/flip-card-game?isAnimateNavBarBackground=1&isShowNavBarShadow=0&isStatusbarLight=1",
            "Cookie": `wr_skey=${wrSkey}; wr_vid=${wrVid}`
        };
    };

    function describeCardPrize(card) {
        if (!card) return "未知奖励";
        if (card.bookInfo && card.bookInfo.title) return `《${card.bookInfo.title}》`;
        if (card.cardType === "money" || card.type === "money") {
            // 抓包确认: money 字段单位为「分」(money=100 → 账户书币 +1)
            let coins = typeof card.money === "number" ? card.money / 100 : Number(card.count || card.amount || card.coins || 1);
            coins = Math.round(coins) || 1;
            return coins > 1 ? `${coins}书币` : "书币";
        }
        if (card.cardType === "infinite" || card.type === "infinite") {
            // 抓包确认: infinite 字段单位为「天」(infinite=1 → 体验卡剩余时长 +86400 秒)
            let count = Number(card.infinite || card.count || card.amount || card.days || 1) || 1;
            return count > 1 ? `体验卡${count}天` : "体验卡";
        }
        if (card.cardType === "book") {
            return card.bookInfo && card.bookInfo.title ? `《${card.bookInfo.title}》` : "书籍";
        }
        return "未知奖励";
    }

    function describeFlipResult(data, justFlippedIndex) {
        if (!data) return "未知奖励";
        if (data.prizeName) return data.prizeName;
        if (data.reward) return data.reward;
        if (data.giftName) return data.giftName;

        let cards = Array.isArray(data.cardList) && data.cardList.length > 0 ? data.cardList : (Array.isArray(data.initialList) ? data.initialList : []);
        if (typeof justFlippedIndex === "number") {
            for (let i = 0; i < cards.length; i++) {
                if (cards[i] && cards[i].cardIndex === justFlippedIndex) {
                    return describeCardPrize(cards[i]);
                }
            }
            if (cards[justFlippedIndex]) {
                return describeCardPrize(cards[justFlippedIndex]);
            }
        }
        for (let i = 0; i < cards.length; i++) {
            let s = cards[i]?.status;
            if (s === 1 || s === 2 || s === 3 || s === 4) {
                return describeCardPrize(cards[i]);
            }
        }
        return "未知奖励";
    }

    function pickNextFlip(data) {
        let cards = data.cardList || [];
        let used = {};
        cards.forEach(c => {
            if (typeof c.cardIndex === "number" && c.cardIndex >= 0) {
                used[c.cardIndex] = true;
            }
        });

        let candidates = [];
        let seen = {};
        (data.initialList || []).forEach((c, i) => {
            if (c.status === 0 && !used[i] && !seen[i]) { candidates.push(i); seen[i] = true; }
        });
        cards.forEach((c, i) => {
            if (c.status === 0 && !used[i] && !seen[i]) { candidates.push(i); seen[i] = true; }
        });
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

    function getCardIndex(card, fallbackIndex) {
        return typeof card?.cardIndex === "number" ? card.cardIndex : fallbackIndex;
    }

    function findCardByIndex(cards, cardIndex) {
        if (!Array.isArray(cards)) return null;
        for (let i = 0; i < cards.length; i++) {
            if (getCardIndex(cards[i], i) === cardIndex) return cards[i];
        }
        return null;
    }

    // 抓包确认 (2026-07-28 / 2026-08-27) 的真实响应结构：
    // - flipList: 本周已翻出的卡片对象数组（含 cardIndex / cardType / money / infinite / bookInfo）
    // - cardList: 本期 9 张牌面池；cardIndex >= 0 才是本周翻出的牌，cardIndex = -1 表示非本周翻出
    //   （status=0 本轮未翻开、status=2 为本期更早周已开出），因此禁止把整份 cardList 计入本周战果
    function getFlippedCards(data) {
        let flipList = Array.isArray(data?.flipList) ? data.flipList : [];

        let flippedObjects = flipList.filter(c => c && typeof c === "object" && !Array.isArray(c));
        if (flippedObjects.length > 0) return flippedObjects;

        let cards = Array.isArray(data?.cardList) ? data.cardList : [];
        let flipIndexes = flipList.filter(i => typeof i === "number");
        if (flipIndexes.length > 0) {
            let source = cards.length > 0 ? cards : (Array.isArray(data?.initialList) ? data.initialList : []);
            return flipIndexes.map(i => findCardByIndex(source, i) || source[i]).filter(Boolean);
        }
        return cards.filter(c => typeof c?.cardIndex === "number" && c.cardIndex >= 0);
    }

    // 1. 查询当前卡片列表与可用翻牌额度
    let listRes = await get(FLIP_API + "/flipCardList?pf=ios&platform=ios_html", getFlipHeaders(auth));
    if (listRes.status === 401 || listRes.status === 499 || listRes.status === 403) {
        $.log(`[WeRead] 翻牌 flipCardList 返回 HTTP ${listRes.status} (登录超时)，正在通过 /login 接口脱机自动换票...`);
        let refreshed = await tryRefreshLogin(auth);
        if (refreshed && refreshed.wrSkey) {
            Object.assign(auth, refreshed);
            listRes = await get(FLIP_API + "/flipCardList?pf=ios&platform=ios_html", getFlipHeaders(auth));
            $.log(`[WeRead] 自动换票刷新成功！重试 flipCardList HTTP ${listRes.status}`);
        }
    }

    if (listRes.status !== 200) {
        result.details = `查询翻牌列表失败 HTTP ${listRes.status}`;
        $.log(`[WeRead] ❌ ${result.details}`);
        return result;
    }

    let listData = null;
    try { listData = JSON.parse(listRes.body || "{}"); } catch (e) { }
    let remainingCount = typeof listData?.remainingCount === "number" ? listData.remainingCount : 0;
    let flipList = Array.isArray(listData?.flipList) ? listData.flipList : [];

    // 只统计 flipList / cardIndex>=0 明确标记为本周已翻出的卡片，避免把整个奖池 cardList 算进历史奖励。
    let existingCards = getFlippedCards(listData);
    let weekFlippedCount = existingCards.length > 0 ? existingCards.length : flipList.length;

    for (let c of existingCards) {
        if (!c) continue;
        let p = describeCardPrize(c);
        if (p && p !== "未知奖励") {
            result.flippedPrizes.push(p);
            let q = parsePrizeQuantity(p);
            result.flippedCardDays += q.cardDays;
            result.flippedCoins += q.coins;
            if (q.books.length) result.flippedBooks.push(...q.books);
        }
    }

    $.log(`[WeRead] 翻牌 — flipCardList 成功: 可用次数 remainingCount=${remainingCount}, 本周已翻=${weekFlippedCount}张` + (result.flippedPrizes.length ? ` (已斩获: ${result.flippedPrizes.join(', ')})` : ''));

    // 如果当前已无剩余翻牌额度
    if (remainingCount <= 0) {
        result.success = true;
        if (result.flippedPrizes.length > 0) {
            result.details = `本周已翻 ${weekFlippedCount} 次，斩获: 体验卡 +${result.flippedCardDays}天 · 书币 +${result.flippedCoins}个` + (result.flippedBooks.length ? ` · ${result.flippedBooks.join(',')}` : '') + ` (剩余 0 次)`;
        } else if (flipList.length >= 6) {
            result.details = `本周已完成全部 6 次翻牌 (剩余 0 次)`;
        } else {
            result.details = `今日无可用翻牌次数 (本周尚未获取翻牌额度)`;
        }
        $.log(`[WeRead] ℹ️ ${result.details}`);
        return result;
    }

    // 2. 依次执行可用翻牌（真实接口: GET /flipCardFlip?cardIndex=...&giftIndex=...&pf=ios&platform=ios_html）
    let state = listData;
    let attempts = 0;
    const maxFlips = Math.min(6, remainingCount);

    while (attempts < maxFlips) {
        let target = pickNextFlip(state);
        if (!target) {
            $.log("[WeRead] 翻牌 — 没有未翻开的卡片");
            break;
        }

        attempts++;
        $.log(`[WeRead] 翻牌 — 正在执行第 ${attempts}/${maxFlips} 次: cardIndex=${target.cardIndex}, giftIndex=${target.giftIndex}`);

        let flipUrl = `${FLIP_API}/flipCardFlip?cardIndex=${target.cardIndex}&giftIndex=${target.giftIndex}&pf=ios&platform=ios_html`;
        let drawRes = await get(flipUrl, getFlipHeaders(auth));

        // 遇到 401/403/499 自动换票重试
        if (drawRes.status === 401 || drawRes.status === 403 || drawRes.status === 499) {
            $.log(`[WeRead] 翻牌 HTTP ${drawRes.status}，尝试通过 /login 刷新 wr_skey 并重试当前卡片...`);
            let refreshed = await tryRefreshLogin(auth);
            if (refreshed && refreshed.wrSkey) {
                Object.assign(auth, refreshed);
                drawRes = await get(flipUrl, getFlipHeaders(auth));
            }
        }

        if (drawRes.status === 200) {
            let flipData = null;
            try { flipData = JSON.parse(drawRes.body || "{}"); } catch (e) { }
            state = flipData || state;

            let prize = describeFlipResult(flipData, target.cardIndex);
            let q = parsePrizeQuantity(prize);
            result.flippedCardDays += q.cardDays;
            result.flippedCoins += q.coins;
            if (q.books.length) result.flippedBooks.push(...q.books);

            result.flippedPrizes.push(prize);
            result.newlyFlipped++;
            result.newlyFlippedPrizes.push(prize);
            $.log(`[WeRead] 🎯 翻牌成功: 第 ${attempts} 次获得 -> ${prize}`);

            if (typeof flipData?.remainingCount === "number" && flipData.remainingCount <= 0) {
                $.log("[WeRead] ℹ️ 翻牌 — 无剩余翻牌次数");
                break;
            }
        } else {
            $.log(`[WeRead] ❌ 翻牌 — 第 ${attempts} 次失败 HTTP ${drawRes.status}: ${(drawRes.body || "").slice(0, 100)}`);
            break;
        }

        if (attempts < maxFlips) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    result.success = true;
    if (result.newlyFlipped > 0) {
        result.details = `本次翻中 ${result.newlyFlipped} 次 [${result.newlyFlippedPrizes.join(', ')}] · 本周累计: 体验卡 +${result.flippedCardDays}天 · 书币 +${result.flippedCoins}个` + (result.flippedBooks.length ? ` · ${result.flippedBooks.join(',')}` : "");
    } else if (result.flippedPrizes.length > 0) {
        result.details = `本周已翻 ${weekFlippedCount + result.newlyFlipped} 次，斩获: 体验卡 +${result.flippedCardDays}天 · 书币 +${result.flippedCoins}个` + (result.flippedBooks.length ? ` · ${result.flippedBooks.join(',')}` : '') + ` (剩余 ${Math.max(0, remainingCount)} 次)`;
    } else if (remainingCount <= 0) {
        result.details = weekFlippedCount >= 6 ? `本周已完成全部 6 次翻牌 (剩余 0 次)` : `今日无可用翻牌次数 (本周尚未获取翻牌额度)`;
    } else {
        result.details = `翻牌尝试未成功 (HTTP 异常)`;
    }
    $.log(`[WeRead] ✅ [周二翻牌] 结果: ${result.details}`);
    return result;
}

// 计算当期免费图书馆的期数标识 (严格锁定北京时间 Asia/Shanghai UTC+8，周四更新，格式 YYYYMMDD)
function getFreeVol() {
    let utcNow = Date.now();
    let d = new Date(utcNow + 8 * 3600 * 1000);
    let day = d.getUTCDay();
    let diff = (day >= 4 ? day - 4 : day + 3);
    d.setUTCDate(d.getUTCDate() - diff);
    let y = d.getUTCFullYear();
    let m = String(d.getUTCMonth() + 1).padStart(2, "0");
    let dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}${m}${dd}`;
}

// 计算指定期数的起始时间戳 (北京时间周四 00:00:00，秒级)
function getVolStartTime(volStr) {
    if (volStr && /^\d{8}$/.test(volStr)) {
        let y = parseInt(volStr.slice(0, 4), 10);
        let m = parseInt(volStr.slice(4, 6), 10) - 1;
        let d = parseInt(volStr.slice(6, 8), 10);
        return Math.floor(Date.UTC(y, m, d, 0, 0, 0) / 1000) - 8 * 3600;
    }
    return 0;
}

// 解析单条助力小号凭证 (支持 Cookie 串[含 wr_rt] / JSON / vid#skey / vid@skey 任意格式)
function parseSingleHelper(raw) {
    if (!raw) return null;
    if (typeof raw === "object") {
        let vid = raw.vid || raw.wrVid || raw.wr_vid || "";
        let skey = raw.wrSkey || raw.skey || raw.wr_skey || raw.accessToken || "";
        let rt = raw.wrRt || raw.wr_rt || "";
        if (!vid && !skey && !raw.refreshToken) return null;
        return {
            vid: String(vid),
            skey: String(skey),
            wrSkey: String(skey),
            wrRt: String(rt),
            refreshToken: raw.refreshToken || "",
            deviceId: raw.deviceId || "",
            rawCookie: raw.rawCookie || ""
        };
    }
    if (typeof raw !== "string") return null;
    let s = raw.replace(/\\([_@])/g, "$1").trim();
    if (!s) return null;

    // 1. JSON 格式
    if (s.startsWith("{")) {
        try {
            let obj = JSON.parse(s);
            return parseSingleHelper(obj);
        } catch (e) {}
    }

    // 2. 完整 Cookie 串 (捕获 wr_vid, wr_skey 及长效续期种子 wr_rt)
    if (s.includes("wr_vid") || s.includes("wr_skey")) {
        let vidM = s.match(/wr_vid=([^;\s]+)/);
        let skeyM = s.match(/wr_skey=([^;\s]+)/);
        let rtM = s.match(/wr_rt=([^;\s]+)/);
        if (vidM || skeyM) {
            return {
                vid: vidM ? vidM[1] : "",
                wrSkey: skeyM ? skeyM[1] : "",
                skey: skeyM ? skeyM[1] : "",
                wrRt: rtM ? rtM[1] : "",
                rawCookie: s
            };
        }
    }

    // 3. vid#skey#rt 格式
    if (s.includes("#")) {
        let parts = s.split("#");
        return {
            vid: parts[0].trim(),
            wrSkey: parts[1].trim(),
            skey: parts[1].trim(),
            wrRt: parts[2] ? parts[2].trim() : "",
            rawCookie: ""
        };
    }

    // 4. vid@skey 格式
    if (s.includes("@") && !s.includes("wr_")) {
        let parts = s.split("@");
        return {
            vid: parts[0].trim(),
            wrSkey: parts[1].trim(),
            skey: parts[1].trim(),
            wrRt: "",
            rawCookie: ""
        };
    }

    return null;
}

// 获取限免助力小号凭证列表 (支持多小号换行 / & 分隔 / JSON 数组，实现每周多书全自动轮替助力)
function getHelperAuthList() {
    let raw = (typeof process !== "undefined" && (process.env.WEREAD_HELPER_AUTH || process.env.WEREAD_HELPER_COOKIE))
        || $.getdata("WEREAD_HELPER_AUTH")
        || CONFIG.HELPER_AUTH;
    if (!raw) return [];

    let list = [];
    if (Array.isArray(raw)) {
        list = raw.map(parseSingleHelper).filter(Boolean);
    } else if (typeof raw === "object") {
        let h = parseSingleHelper(raw);
        if (h) list.push(h);
    } else if (typeof raw === "string") {
        let str = raw.replace(/\\([_@])/g, "$1").trim();
        // 1. JSON 数组格式: [{"vid":...}, {"vid":...}]
        if (str.startsWith("[")) {
            try {
                let arr = JSON.parse(str);
                if (Array.isArray(arr)) {
                    list = arr.map(parseSingleHelper).filter(Boolean);
                }
            } catch (e) {}
        }
        // 2. 多行或分隔符格式
        if (!list.length) {
            let lines = str.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
            if (lines.length > 1) {
                for (let line of lines) {
                    let h = parseSingleHelper(line);
                    if (h) list.push(h);
                }
            } else if (lines.length === 1) {
                if (lines[0].startsWith("{") && lines[0].endsWith("}")) {
                    let h = parseSingleHelper(lines[0]);
                    if (h) list.push(h);
                } else if (lines[0].includes("&") && !lines[0].includes("wr_rt") && !lines[0].includes("wr_skey")) {
                    let sub = lines[0].split("&").map(s => s.trim()).filter(Boolean);
                    for (let s of sub) {
                        let h = parseSingleHelper(s);
                        if (h) list.push(h);
                    }
                } else {
                    let h = parseSingleHelper(lines[0]);
                    if (h) list.push(h);
                }
            }
        }
    }
    return list;
}

// 兼容单小号获取
function getHelperAuth() {
    let list = getHelperAuthList();
    return list.length > 0 ? list[0] : null;
}

// 核心自愈：Web Cookie 自动续期 (参考 findmover/wxread，通过 /web/login/renewal 实现无感换票)
async function tryWebRenewal(helperAuth) {
    let wrRt = helperAuth?.wrRt || helperAuth?.wr_rt;
    let wrVid = helperAuth?.vid || helperAuth?.wrVid;
    let wrSkey = helperAuth?.wrSkey || helperAuth?.skey;
    if (!wrRt || !wrVid) {
        return null;
    }

    $.log("[WeRead] 正在通过 /web/login/renewal 自动续期小号 Web Cookie (wr_rt)...");
    try {
        let renewHeaders = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://weread.qq.com",
            "Referer": "https://weread.qq.com/web/book/read",
            "Cookie": helperAuth.rawCookie || `wr_vid=${wrVid}; wr_skey=${wrSkey}; wr_rt=${wrRt};`
        };

        let res = await post(
            "https://weread.qq.com/web/login/renewal",
            JSON.stringify({ "rq": "%2Fweb%2Fbook%2Fread", "ql": false }),
            renewHeaders
        );

        let resData = decode(res.body);
        let setCookies = res.headers ? (res.headers["set-cookie"] || res.headers["Set-Cookie"]) : null;
        let newSkey = null;
        let newRt = null;

        if (setCookies) {
            let cookieStr = Array.isArray(setCookies) ? setCookies.join("; ") : String(setCookies);
            let skeyMatch = cookieStr.match(/wr_skey=([^;\s]+)/);
            if (skeyMatch) newSkey = skeyMatch[1];
            let rtMatch = cookieStr.match(/wr_rt=([^;\s]+)/);
            if (rtMatch) newRt = rtMatch[1];
        }

        if (res.status === 200 && (resData?.succ === 1 || newSkey)) {
            if (newSkey) helperAuth.wrSkey = newSkey;
            if (newRt) helperAuth.wrRt = newRt;
            if (helperAuth.rawCookie && newSkey) {
                helperAuth.rawCookie = helperAuth.rawCookie.replace(/wr_skey=[^;\s]+/, `wr_skey=${newSkey}`);
                if (newRt) helperAuth.rawCookie = helperAuth.rawCookie.replace(/wr_rt=[^;\s]+/, `wr_rt=${newRt}`);
            }
            $.log(`[WeRead] 🎉 小号 Web Cookie 自动续期成功！最新 skey: ${helperAuth.wrSkey?.slice(0, 4)}****`);
            return helperAuth;
        } else {
            $.log(`[WeRead] ⚠️ Web Cookie 自动续期响应: ${resData?.errMsg || ("HTTP " + res.status)}`);
            return null;
        }
    } catch (e) {
        $.log(`[WeRead] ⚠️ Web Cookie 自动续期网络异常: ${e.message || e}`);
        return null;
    }
}

// ============================================================
// 5. 业务子任务三：每周五免费图书馆好书自动入架 (Free)
// ============================================================
async function runFreeTask(auth, helperAuth) {
    $.log("\n▶️ --- 开始执行任务：[限免好书入架] ---");
    let result = { task: "限免好书入架", success: false, details: "", addedBooks: [], unclaimedBooks: [], allClaimed: false };

    const getHeaders = (a) => ({
        "User-Agent": a.ua || "WeRead/8.2.6 (iPhone; iOS 26.6.2; Scale/3.00)",
        "Content-Type": "application/json",
        "channelid": a.channelid || "AppStore",
        "basever": a.basever || "8.2.6.20",
        "v": a.basever || "8.2.6.20",
        "vid": String(a.vid || ""),
        "skey": a.skey || ""
    });

    let currentVol = getFreeVol();
    let cacheKey = `weread_free_${auth.vid}_${currentVol}`;

    // 0. 本地周度缓存锁定检测 (避免整周重复执行时书名漂移或发起冗余网络请求)
    try {
        let rawCache = $.getdata(cacheKey);
        if (rawCache) {
            let cachedInfo = JSON.parse(rawCache);
            if (cachedInfo && cachedInfo.vol === currentVol && cachedInfo.allClaimed && cachedInfo.addedBooks && cachedInfo.addedBooks.length >= 2) {
                $.log(`[WeRead] ℹ️ 本周(期数 ${currentVol})已成功领取固定图书(周度锁定): ${cachedInfo.addedBooks.join(", ")}`);
                return cachedInfo;
            }
        }
    } catch (e) { }

    // 1. 检查领书资格与本期配额（每期最多 2 本）
    let reachedMax = false;
    try {
        let qRes = await get(API + "/checkfreequalify?type=book&vid=" + auth.vid, getHeaders(auth));
        if (qRes.status === 401 || qRes.status === 499) {
            let refreshed = await tryRefreshLogin(auth);
            if (refreshed) {
                auth = refreshed;
                qRes = await get(API + "/checkfreequalify?type=book&vid=" + auth.vid, getHeaders(auth));
            }
        }
        let qData = decode(qRes.body);
        if (qData && qData.reachedMax === 1) {
            reachedMax = true;
        }
    } catch (e) {
        $.log("[WeRead] checkfreequalify 请求异常: " + String(e));
    }

    // 2. 检查主号书架现有图书 (/shelf/sync)，确保绝对规避已在架/已拥有书籍
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
        let sItems = sData?.books || sData?.bookIds || [];
        sItems.forEach(item => {
            let bid = typeof item === "object" ? (item.bookId || item.id) : item;
            if (bid) shelfBookIds.add(String(bid));
        });
    } catch (e) { }

    // 3. 多通道聚合拉取官方限免书库列表
    // 同时聚合：原生 App 18 本书单 + 扩展 50 本书单 + 特别推荐 120 本书单
    let libraryUrls = [
        API + `/free/library/list?count=18&receiveStatus=1&type=book&vol=${currentVol}`,
        API + `/free/library/list?count=50&receiveStatus=1&type=book&vol=${currentVol}`,
        API + `/free/library/list?count=120&receiveStatus=1&type=book&v=2&vol=${currentVol}`,
        API + `/free/library/list?count=120&receiveStatus=1&type=book&vol=${currentVol}`
    ];

    let booksMap = new Map();
    let freeTimestamp = Math.floor(Date.now() / 1000);

    for (let u of libraryUrls) {
        try {
            let res = await get(u, getHeaders(auth));
            if (res.status === 401 || res.status === 499) {
                let refreshed = await tryRefreshLogin(auth);
                if (refreshed) {
                    auth = refreshed;
                    res = await get(u, getHeaders(auth));
                }
            }
            if (res.status === 200) {
                let data = decode(res.body);
                if (data?.vol) currentVol = data.vol;
                if (data?.timestamp) freeTimestamp = data.timestamp;
                let rawList = data?.books || data?.data || data?.items || [];
                rawList.forEach(b => {
                    let bInfo = b.bookInfo || b.book || b;
                    let bid = String(bInfo.bookId || bInfo.id || "");
                    let title = String(bInfo.title || bInfo.name || "图书");
                    let received = typeof b.received !== "undefined" ? Number(b.received) : (typeof bInfo.received !== "undefined" ? Number(bInfo.received) : 0);
                    let deepLink = bInfo.deepLink || "";
                    let vMatch = deepLink.match(/[?&]v=([^&]+)/);
                    let v = vMatch ? vMatch[1] : "";
                    let sn = b.sn || "";

                    // 深度提取价格与评价元数据 (针对微信读书官方 WRCGIParser 规范)
                    let rawPrice = Number(bInfo.originalPrice || bInfo.price || bInfo.centPrice || bInfo.priceInfo?.price || 0);
                    let priceInCoins = rawPrice > 100 ? (rawPrice / 100) : rawPrice; // 分转书币
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

                    // 深度扫描官方各种徽章、排行榜与评级字段中的「神作」等标识
                    let badgesStr = "";
                    if (Array.isArray(bInfo.badge)) badgesStr += " " + bInfo.badge.map(x => (typeof x === "object" ? x.text || x.name || "" : String(x))).join(" ");
                    if (Array.isArray(bInfo.badges)) badgesStr += " " + bInfo.badges.map(x => (typeof x === "object" ? x.text || x.name || "" : String(x))).join(" ");
                    if (Array.isArray(bInfo.cardTags)) badgesStr += " " + bInfo.cardTags.map(x => (typeof x === "object" ? x.name || x.text || "" : String(x))).join(" ");
                    let rankingText = String(bInfo.rankingTitle || bInfo.rankingTips || "");
                    let rawTips = String(bInfo.newRatingDetail?.title || bInfo.newRatingDetail?.word || bInfo.ratingTips || bInfo.starText || "");
                    let allTagText = `${rawTips} ${badgesStr} ${rankingText}`;

                    // 微信读书「神作」标准：官方徽章显式标注、或 (好评率>=92% 且 评语>=200人)、或 (好评率>=90% 且 评语>=1000人)
                    let isGodTier = allTagText.includes("神作") || (newRating >= 920 && newRatingCount >= 200) || (newRating >= 900 && newRatingCount >= 1000);
                    let ratingTitle = isGodTier ? "神作" : (rawTips || "");

                    if (bid) {
                        if (!booksMap.has(bid)) {
                            booksMap.set(bid, {
                                bookId: bid,
                                title,
                                received,
                                deepLink,
                                v,
                                sn,
                                price: priceInCoins,
                                newRating,
                                newRatingCount,
                                ratingTitle
                            });
                        } else {
                            let exist = booksMap.get(bid);
                            if (received === 1) exist.received = 1;
                            if (!exist.v && v) exist.v = v;
                            if (!exist.sn && sn) exist.sn = sn;
                            if (priceInCoins > exist.price) exist.price = priceInCoins;
                            if (newRating > exist.newRating) exist.newRating = newRating;
                            if (newRatingCount > exist.newRatingCount) exist.newRatingCount = newRatingCount;
                            if (ratingTitle && !exist.ratingTitle) exist.ratingTitle = ratingTitle;
                        }
                    }
                });
            }
        } catch (e) { }
    }

    let books = Array.from(booksMap.values());
    if (!books.length) {
        result.success = true;
        result.allClaimed = true;
        result.details = "本期限免书库暂无新书";
        $.log(`[WeRead] ℹ️ ${result.details}`);
        return result;
    }

    // 4. 分批查验主号购买资产历史 (/book/paytime)，防止单次 Query 超长截断
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
            let items = payData?.data || [];
            items.forEach(item => {
                if (item.bookId && item.time > 0) {
                    allTimePaidBookIds.add(String(item.bookId));
                    if (volStartTime > 0 && item.time >= volStartTime) {
                        thisWeekPaidBookIds.add(String(item.bookId));
                    }
                }
            });
        } catch (e) { }
    }

    // 5. 核验主账号本周在免费图书馆真正已拥有的书籍 (received === 1 或本期周期内 paytime 生效)
    let claimedBooks = books.filter(b => b.received === 1 || thisWeekPaidBookIds.has(String(b.bookId)));
    let claimedTitles = claimedBooks.map(b => `《${b.title}》`);

    // 自动将已拥有的限免图书同步回写至个人书架
    if (claimedBooks.length > 0) {
        try {
            await post(API + "/shelf/syncbook", JSON.stringify({ bookIds: claimedBooks.map(b => String(b.bookId)), albumIds: [] }), getHeaders(auth));
        } catch (e) { }
    }

    // 若主账号已领满本周 2 本名额（或资格接口明确确认已达上限），直接锁定并汇报
    if (claimedTitles.length >= 2 || (reachedMax && claimedTitles.length > 0)) {
        result.success = true;
        result.allClaimed = true;
        result.addedBooks = claimedTitles.slice(0, 2);
        result.details = `本周已领图书: ${result.addedBooks.join(", ")}`;
        $.log(`[WeRead] ✅ ${result.details}`);
        // 写入周度缓存锁定
        $.setdata(JSON.stringify({ vol: currentVol, allClaimed: true, addedBooks: result.addedBooks, details: result.details }), cacheKey);
        return result;
    }

    // 6. 核心智能打分机制：严格规避已购/在架，优先「好评如潮」，次优「高书币售价」
    result.addedBooks = [...claimedTitles];
    let needCount = 2 - claimedTitles.length;

    // 候选池严密过滤：
    // - 规避官方已领图书 (b.received !== 1)
    // - 严格规避主账号历史已付费购买图书 (!allTimePaidBookIds.has)
    // - 严格规避主账号书架现有图书 (!shelfBookIds.has)
    // - 必须携带有效分享鉴权参数 (b.v && b.sn)
    let rawCandidates = books.filter(b =>
        b.received !== 1 &&
        !allTimePaidBookIds.has(String(b.bookId)) &&
        !shelfBookIds.has(String(b.bookId)) &&
        b.v && b.sn
    );

    if (!rawCandidates.length) {
        result.success = true;
        result.allClaimed = true;
        result.details = claimedTitles.length > 0 ? `本周已领图书: ${claimedTitles.join(", ")}` : "本期限免书库暂无可领新书";
        $.log(`[WeRead] ✅ ${result.details}`);
        return result;
    }

    // 智能优选偏好与关键词过滤配置
    let freeMode = (process.env.WEREAD_FREE_MODE || process.env.FREE_PREFER_MODE || CONFIG.FREE_PREFER_MODE || "balanced").toLowerCase().trim();
    let excludeRaw = (process.env.WEREAD_EXCLUDE_KEYWORDS || process.env.FREE_EXCLUDE_KEYWORDS || CONFIG.FREE_EXCLUDE_KEYWORDS || "").trim();
    let excludeKws = excludeRaw ? excludeRaw.split(/[,|，\s]+/).filter(Boolean) : [];

    let candidates = rawCandidates;
    if (excludeKws.length > 0) {
        let filtered = rawCandidates.filter(b => !excludeKws.some(kw => b.title.includes(kw)));
        if (filtered.length >= needCount) {
            candidates = filtered;
            $.log(`[WeRead] 🔍 已启用关键词过滤 [${excludeKws.join("|")}]，过滤后候选池剩余 ${candidates.length} 本`);
        } else if (filtered.length > 0) {
            candidates = filtered;
            $.log(`[WeRead] 🔍 关键词过滤后剩余 ${candidates.length} 本，优先在该集合中选择`);
        } else {
            $.log(`[WeRead] ⚠️ 关键词过滤后无可用新书，自动回退全量候选池`);
        }
    }

    // 智能权重计算函数 (权重体系：模式感知 + 殿堂神作/好评如潮分级 + 杜绝 0 评分虚高)
    function calculateBookPriorityScore(b, mode = "balanced") {
        let hasRating = (b.newRating > 0 && b.newRatingCount > 0);
        let isGodTier = b.ratingTitle.includes("神作") || (b.newRating >= 920 && b.newRatingCount >= 200) || (b.newRating >= 900 && b.newRatingCount >= 1000);
        let isOverwhelming = b.ratingTitle.includes("好评如潮") || (b.newRating >= 900 && b.newRatingCount >= 20);
        let isVeryGood = b.ratingTitle.includes("特别好评") || (b.newRating >= 850 && b.newRatingCount >= 10);
        let isGood = b.newRating >= 750;

        let price = b.price || 0;
        let count = b.newRatingCount || 0;

        if (mode === "price") {
            // 【最贵白嫖模式】：售价绝对优先，同等价格下神作/高分者优先
            let priceScore = price * 100000;
            let ratingScore = hasRating ? (b.newRating * 100) : 0;
            let tierBonus = isGodTier ? 50000 : 0;
            let countBonus = Math.min(count, 1000) * 10;
            return priceScore + ratingScore + tierBonus + countBonus;
        }

        if (mode === "hot") {
            // 【热门畅销模式】：读者基数与神作/高口碑优先，专挑大热出圈的好书
            let countScore = Math.min(count, 50000) * 100;
            let ratingScore = hasRating ? (b.newRating * 2000) : 0;
            let tierBonus = isGodTier ? 5000000 : (isOverwhelming ? 2000000 : (isVeryGood ? 1000000 : 0));
            let priceBonus = price * 100;
            return countScore + ratingScore + tierBonus + priceBonus;
        }

        // 【智能综合模式（balanced，默认）】：神作与高口碑第一，绝不允许无评分/生僻书反超精品好书
        // 梯队划分：
        // - 殿堂神作 (官方神作标识 / ≥92%且数百人 / ≥90%且千人)：500万分基底 (至高无上)
        // - 好评如潮 (≥90%)：300万分基底
        // - 特别好评 (≥85%)：200万分基底
        // - 口碑推荐 (≥75%)：100万分基底
        // - 普通评级 (>0%)：newRating * 1000 (最高 75万分)
        // - 暂无评分 (0分)：0分基底 (绝对垫底，无法反超真实口碑图书)
        let tierScore = 0;
        if (isGodTier) {
            tierScore = 5000000;
        } else if (isOverwhelming) {
            tierScore = 3000000;
        } else if (isVeryGood) {
            tierScore = 2000000;
        } else if (isGood) {
            tierScore = 1000000;
        } else if (hasRating) {
            tierScore = b.newRating * 1000;
        } else {
            tierScore = 0; // 0评分垫底，杜绝反超优质书
        }

        // 价格得分：每 1 书币赋 2000 分（100 书币 = 20万分，同梯队内价格高者优先，但无法跨越百万级品质梯队）
        let priceMultiplier = hasRating ? 2000 : 1000;
        let priceScore = price * priceMultiplier;

        // 评价人数加成 (置信度微调，满 10000 人最高加 10万分)
        let countBonus = Math.min(count, 10000) * 10;

        return tierScore + priceScore + countBonus;
    }

    candidates.sort((a, b) => calculateBookPriorityScore(b, freeMode) - calculateBookPriorityScore(a, freeMode));

    let modeDesc = freeMode === "price" ? "最贵白嫖优先" : (freeMode === "hot" ? "热门畅销优先" : "智能综合口碑优先");
    $.log(`[WeRead] 📚 智能优选候选池（模式: ${modeDesc}，已排除已购/在架，前 3 本）：`);
    candidates.slice(0, 3).forEach((c, idx) => {
        let ratingTag = "";
        let isGodTier = c.ratingTitle.includes("神作") || (c.newRating >= 920 && c.newRatingCount >= 200) || (c.newRating >= 900 && c.newRatingCount >= 1000);
        if (c.newRating > 0 && c.newRatingCount > 0) {
            let pct = (c.newRating / 10).toFixed(1);
            let countStr = c.newRatingCount >= 10000 ? (c.newRatingCount / 10000).toFixed(1) + "w人评" : `${c.newRatingCount}人评`;
            let tag = isGodTier ? "神作" : (c.ratingTitle || (c.newRating >= 900 ? "好评如潮" : (c.newRating >= 850 ? "特别好评" : (c.newRating >= 750 ? "口碑推荐" : "普通评级"))));
            ratingTag = `[${tag} · ${pct}%好评 (${countStr})]`;
        } else if (c.newRating > 0) {
            let pct = (c.newRating / 10).toFixed(1);
            let tag = isGodTier ? "神作" : (c.ratingTitle || (c.newRating >= 850 ? "特别好评" : "普通评级"));
            ratingTag = `[${tag} · ${pct}%好评]`;
        } else {
            ratingTag = `[暂无评分]`;
        }
        $.log(`  ${idx + 1}. 《${c.title}》 ${ratingTag} 官方售价: ${c.price.toFixed(1)}书币 (得分: ${calculateBookPriorityScore(c, freeMode)})`);
    });

    let targetBooks = candidates.slice(0, needCount);

    // 7. 路径A：小号助力点击全自动兑换 (支持多小号轮替助力，解决每小号每周限1本的官方限制)
    let helperList = Array.isArray(helperAuth) ? helperAuth : (helperAuth ? [helperAuth] : []);
    helperList = helperList.filter(h => h && (h.vid || h.wrVid));

    if (helperList.length > 0) {
        let maskList = helperList.map(h => {
            let v = String(h.vid || h.wrVid || "");
            return v.length > 4 ? v.slice(0, 4) + "****" : v;
        }).join(", ");
        $.log(`[WeRead] 检测到 ${helperList.length} 个助力小号凭证 [${maskList}]，启动多小号轮替助力领书流程...`);

        let newlyClaimed = [];
        let helperIdx = 0; // 当前可用助力小号指针

        for (let b of targetBooks) {
            let bookClaimed = false;

            while (helperIdx < helperList.length && !bookClaimed) {
                let curHelper = helperList[helperIdx];
                let helperVid = String(curHelper.vid || curHelper.wrVid || "");
                let helperSkey = curHelper.wrSkey || curHelper.accessToken || curHelper.skey || "";
                let maskH = helperVid.length > 4 ? helperVid.slice(0, 4) + "****" : helperVid;

                $.log(`[WeRead] 正在使用小号 [${maskH}] (第 ${helperIdx + 1}/${helperList.length} 个) 助力领取《${b.title}》...`);

                if (!helperSkey && curHelper.refreshToken && curHelper.deviceId) {
                    let refreshedHelper = await tryRefreshLogin(curHelper, null);
                    if (refreshedHelper) {
                        helperSkey = refreshedHelper.wrSkey || refreshedHelper.accessToken || refreshedHelper.skey || "";
                    }
                }

                let actUrl = `https://weread.qq.com/book-detail/api/activities?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${currentVol}&platform=ios_html`;
                let actHeaders = {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.78(0x18004e31) NetType/WIFI Language/zh_CN",
                    "Referer": `https://weread.qq.com/book-detail?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${currentVol}`,
                    "Cookie": (curHelper && curHelper.rawCookie) ? curHelper.rawCookie : `wr_vid=${helperVid}; wr_skey=${helperSkey}; wr_loggedIn=1;`
                };

                let actRes = await get(actUrl, actHeaders);
                if (actRes.status === 401) {
                    if (curHelper.wrRt || curHelper.wr_rt) {
                        let renewed = await tryWebRenewal(curHelper);
                        if (renewed) {
                            helperSkey = renewed.wrSkey || "";
                            if (curHelper.rawCookie) {
                                curHelper.rawCookie = curHelper.rawCookie.replace(/wr_skey=[^;\s]+/, `wr_skey=${helperSkey}`);
                                if (renewed.wrRt) {
                                    curHelper.rawCookie = curHelper.rawCookie.replace(/wr_rt=[^;\s]+/, `wr_rt=${renewed.wrRt}`);
                                }
                            }
                            actHeaders["Cookie"] = (curHelper && curHelper.rawCookie) ? curHelper.rawCookie : `wr_vid=${helperVid}; wr_skey=${helperSkey}; wr_loggedIn=1;`;
                            actRes = await get(actUrl, actHeaders);
                        }
                    }
                    if (actRes.status === 401 && curHelper.refreshToken && curHelper.deviceId) {
                        $.log(`[WeRead] 助力小号 [${maskH}] Session 过期，尝试脱机自愈换票 (/login)...`);
                        let refreshedHelper = await tryRefreshLogin(curHelper, null);
                        if (refreshedHelper) {
                            helperSkey = refreshedHelper.wrSkey || refreshedHelper.accessToken || refreshedHelper.skey || "";
                            if (curHelper.rawCookie) {
                                curHelper.rawCookie = curHelper.rawCookie.replace(/wr_skey=[^;\s]+/, `wr_skey=${helperSkey}`);
                            }
                            actHeaders["Cookie"] = (curHelper && curHelper.rawCookie) ? curHelper.rawCookie : `wr_vid=${helperVid}; wr_skey=${helperSkey}; wr_loggedIn=1;`;
                            actRes = await get(actUrl, actHeaders);
                        }
                    } else if (actRes.status === 401 && !(curHelper.wrRt || curHelper.wr_rt)) {
                        $.log(`[WeRead] ⚠️ 助力小号 [${maskH}] 当前 wr_skey 已过期，缺少 wr_rt 或 refreshToken 续期种子`);
                    }
                }

                let actData = decode(actRes.body);
                if (actRes.status === 200 && actData && actData.succ === 1 && !actData.errMsg) {
                    newlyClaimed.push(`《${b.title}》`);
                    $.log(`[WeRead] 🎉 小号 [${maskH}] 助力领取成功: 《${b.title}》 (售价: ${b.price.toFixed(1)}书币)`);
                    bookClaimed = true;
                    helperIdx++; // 该小号配额已消耗，切换到下一个小号！
                } else {
                    let errMsg = actData?.errMsg || actData?.errmsg || ("HTTP " + actRes.status);
                    $.log(`[WeRead] ❌ 小号 [${maskH}] 助力领取《${b.title}》失败: ${errMsg}`);

                    // 核心安全熔断：若官方返回 -2057，表明主账号本周领书次数已达上限 (2本)
                    if (String(errMsg) === "-2057" || (actData && actData.errCode === -2057)) {
                        $.log("[WeRead] ℹ️ 触发官方配额保护：主账号本周免费好书已达领取上限(2本)，停止后续助力请求并锁定结果");
                        result.allClaimed = true;
                        result.unclaimedBooks = [];
                        if (result.addedBooks.length > 0) {
                            result.details = `本周已领图书: ${result.addedBooks.join(", ")}`;
                            $.setdata(JSON.stringify({ vol: currentVol, allClaimed: true, addedBooks: result.addedBooks, details: result.details }), cacheKey);
                        }
                        return result;
                    }

                    // 遇到配额限制（已帮其他用户解锁），说明该小号配额耗尽，轮换到下一个小号重试本书
                    if (String(errMsg).includes("已帮其他用户") || String(errMsg).includes("解锁过")) {
                        $.log(`[WeRead] ⚠️ 小号 [${maskH}] 本周助力配额已达上限(1本/周)`);
                        helperIdx++;
                        if (helperIdx < helperList.length) {
                            let nextMask = String(helperList[helperIdx].vid || helperList[helperIdx].wrVid || "").slice(0, 4) + "****";
                            $.log(`[WeRead] 🔄 正在自动轮换至备用小号 [${nextMask}] 重新助力《${b.title}》...`);
                        }
                    } else {
                        helperIdx++;
                    }
                }
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!bookClaimed) {
                if (helperIdx >= helperList.length && targetBooks.indexOf(b) > 0) {
                    $.log(`[WeRead] ℹ️ 助力小号已全部耗尽（微信读书规则：每个小号每周限助力 1 本）。`);
                    $.log(`[WeRead] 💡 如需每周 2 本全部全自动入架，请在青龙环境变量 WEREAD_HELPER_AUTH 中换行或用 & 添加第 2 个小号。`);
                }
                let link = `https://weread.qq.com/book-detail?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${currentVol}`;
                result.unclaimedBooks.push({ title: b.title, url: link });
            }
        }

        if (newlyClaimed.length > 0) {
            result.addedBooks.push(...newlyClaimed);
            result.success = true;
            result.details = `成功领取: ${result.addedBooks.join(", ")}`;
            $.log(`[WeRead] ✅ ${result.details}`);
            // 写入周度缓存锁定
            $.setdata(JSON.stringify({ vol: currentVol, allClaimed: true, addedBooks: result.addedBooks, details: result.details }), cacheKey);
            // 触发主号书架增量同步
            try {
                await get(API + "/shelf/sync?album=1&onlyBookid=1", getHeaders(auth));
            } catch (e) { }
        } else {
            result.success = (result.addedBooks.length > 0);
            result.details = result.addedBooks.length > 0 ? `本周已领图书: ${result.addedBooks.join(", ")}` : "小号助力未能自动完成入架";
        }
    } else {
        // 未配置小号时的优雅直达：收集官方真实签名的微信一键直达卡片链接
        targetBooks.forEach(b => {
            let link = `https://weread.qq.com/book-detail?type=1&senderVid=${auth.vid}&v=${b.v}&wtype=shareOneGetOne2&scene=freeBooks&timestamp=${freeTimestamp}&sn=${b.sn}&vol=${currentVol}`;
            result.unclaimedBooks.push({ title: b.title, url: link });
        });
        result.success = true;
        result.details = claimedTitles.length > 0 ? `本周已领图书: ${claimedTitles.join(", ")}` : "未配置小号凭证，已生成微信一键直达领取链接";
        $.log(`[WeRead] ℹ️ ${result.details}`);
    }

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
    const bjNow = new Date(Date.now() + 8 * 3600 * 1000);
    const dayOfWeek = bjNow.getUTCDay(); // 0=周日, 2=周二, 5=周五
    const isTuesday = dayOfWeek === 2;
    const isFriday = dayOfWeek === 5;
    const forceRun = (typeof process !== "undefined" && process.env.FORCE_RUN !== undefined)
        ? String(process.env.FORCE_RUN).toLowerCase() === "true"
        : (CONFIG.FORCE_RUN || process?.argv?.includes("--force"));

    // 开关由顶部 CONFIG 直接控制，兼顾环境变量覆盖
    let envTasks = typeof process !== "undefined" ? process.env.WEREAD_TASKS : null;
    const canClaim = envTasks ? envTasks.includes("claim") : CONFIG.ENABLE_CLAIM;
    const canFlip = envTasks ? envTasks.includes("flip") : CONFIG.ENABLE_FLIP;
    const canFree = envTasks ? envTasks.includes("free") : CONFIG.ENABLE_FREE;

    const bjTimeStr = bjNow.toISOString().replace("T", " ").slice(0, 19);
    $.log(`📅 当前时间: ${bjTimeStr} (北京时间·星期${["日", "一", "二", "三", "四", "五", "六"][dayOfWeek]})`);
    $.log(`⚙️ 任务队列: [阅读领卡: ${canClaim ? '执行' : '跳过'}] [翻牌抽奖: ${canFlip ? '执行' : '跳过'}] [限免入架: ${canFree ? '执行' : '跳过'}]`);

    const summaryReport = [];

    // 3. 循环遍历所有账号执行任务
    for (let i = 0; i < accounts.length; i++) {
        let auth = accounts[i];
        let vidMask = (auth.vid ? String(auth.vid).slice(0, 4) + '****' : `账号${i + 1}`);
        $.log(`\n=================== 正在处理账号 [${vidMask}] ===================`);

        let resClaim = null;
        let resFlip = null;
        let resFree = null;

        // 任务 1: 每日阅读签到领卡
        if (canClaim) {
            resClaim = await runClaimTask(auth);
        }

        // 任务 2: 周二翻牌游戏
        if (canFlip) {
            resFlip = await runFlipTask(auth);
        }

        // 任务 3: 周五限免图书入架 (支持多小号轮替助力)
        if (canFree) {
            let helpers = getHelperAuthList();
            if (!helpers.length && accounts.length > 1) {
                helpers = accounts.filter((_, idx) => idx !== i);
            }
            resFree = await runFreeTask(auth, helpers);
        }

        // 格式化各子任务输出行
        // 账户总余（体验卡剩余天数 / 书币余额）跟随每日阅读领卡一并汇报
        let accountText = (resClaim?.accountRemainDays !== null && resClaim?.accountRemainDays !== undefined
            && resClaim?.accountCoins !== null && resClaim?.accountCoins !== undefined)
            ? ` (账户总余: ${resClaim.accountRemainDays}天卡 · ${resClaim.accountCoins}书币)`
            : "";
        let claimText = resClaim?.success
            ? `本周已读: ${resClaim.readingMin}分钟(${resClaim.readingDay}天), 体验卡 ${resClaim.weekTotalCardDays}天 · 书币 ${resClaim.weekTotalCoins}个${accountText}`
            : (resClaim?.details || "暂无数据");

        let flipText = resFlip?.details || "今日无可用翻牌次数";

        let freeText = "";
        if (canFree && resFree) {
            if (resFree.addedBooks && resFree.addedBooks.length >= 2) {
                freeText = `本周已领图书: ${resFree.addedBooks.join(', ')}`;
            } else if (resFree.addedBooks && resFree.addedBooks.length > 0) {
                let text = `本周已领图书: ${resFree.addedBooks.join(', ')}`;
                if (resFree.unclaimedBooks && resFree.unclaimedBooks.length > 0) {
                    text += `\n另有未入架图书，请在微信中点击链接领取:\n` + resFree.unclaimedBooks.map((b, idx) => `  ${idx + 1}. 《${b.title}》: ${b.url}`).join('\n');
                }
                freeText = text;
            } else if (resFree.unclaimedBooks && resFree.unclaimedBooks.length > 0) {
                freeText = "未自动入架，请在微信中点击链接一键直达领取:\n" + resFree.unclaimedBooks.map((b, idx) => `  ${idx + 1}. 《${b.title}》: ${b.url}`).join('\n');
            } else {
                freeText = resFree.details || "本期限免图书已在书架中";
            }
        } else {
            freeText = "未开启限免任务";
        }

        let bullets = [];
        if (canClaim && resClaim) {
            bullets.push(`• 阅读达标领卡: ${claimText}`);
        }

        // 仅在周二翻牌当天 (或 forceRun 强制执行) 时才在通知中显示翻牌任务
        if (canFlip && resFlip) {
            bullets.push(`• 翻牌抽奖游戏: ${flipText}`);
        }

        // 仅在周五限免当天 (或 forceRun 强制执行) 时才在通知中显示限免入架任务
        if (canFree && resFree) {
            bullets.push(`• 限免好书入架: ${freeText}`);
        }

        if (accounts.length > 1) {
            summaryReport.push(`【账号 ${i + 1}: ${vidMask}】\n` + bullets.join("\n"));
        } else {
            summaryReport.push(bullets.join("\n"));
        }
    }

    // 4. 汇总通知
    const subtitle = accounts.length === 1
        ? `执行完成 (1个账号) - 【${accounts[0].vid ? String(accounts[0].vid).slice(0, 4) + '****' : '主账号'}】`
        : `执行完成 (${accounts.length}个账号)`;
    const notifyBody = summaryReport.join("\n\n");
    await $.msg(SCRIPT_NAME, subtitle, notifyBody);
    $.log("\n🏁 所有账号全部任务处理完毕！");
}

main().then(() => $.done()).catch(e => { $.log("❌ 顶层未捕获异常: " + (e.stack || e)); $.done(); });

/*
#!name=微信读书自动领取增强版 V2
#!desc=动态认证版，自动保存vid/skey/basever
#!author=TomCatXue

[Script]
http-request ^https:\/\/i\.weread\.qq\.com\/ script-path=weread_claim_enhanced_v2.js
cron "0 9 * * *" script-path=weread_claim_enhanced_v2.js

[MITM]
hostname = i.weread.qq.com
*/

const AUTH_KEY = "weread_auth_v2";
const API = "https://i.weread.qq.com";
const FLIP_API = "https://weread.qq.com/flip-card-game/api";
const PF = "weread_wx-2001-iap-2001-iphone";
const HMAC_SALT = "EBRYFkVMReKBGsU2";

let $ = new Env("WeRead");

(async () => {
    try {
        if (typeof $request !== "undefined") {
            saveAuth();
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
})();


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
        let cookie = h["Cookie"] || "";
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
                refreshToken: existing.refreshToken || "",
                deviceId: existing.deviceId || "",
                basever: existing.basever || "",
                channelid: existing.channelid || "",
                ua: existing.ua || ""
            };

            $.setdata(JSON.stringify(auth), AUTH_KEY);
            $.log("[WeRead] weread.qq.com Cookie saved: wrVid=" + wrVid.slice(0, 8) + "...");
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

    // If this is a /login response, try to extract refreshToken from the decoded body
    // NOTE: $response is only available in Loon http-response handlers
    if (url.indexOf("/login") !== -1 && typeof $response !== "undefined" && $response.body) {
        let loginData = decode($response.body);
        if (loginData && loginData.refreshToken) {
            auth.refreshToken = loginData.refreshToken;
            if (loginData.openId) auth.openId = loginData.openId;
        }
    }

    // If this is /login request, also capture deviceId from URL params or request body
    if (url.indexOf("/login") !== -1) {
        // Try URL params first
        let match = url.match(/[?&]deviceId=([^&]+)/);
        if (match) auth.deviceId = decodeURIComponent(match[1]);

        // Also try request body (Base64-encoded JSON) for /login POST
        if (!auth.deviceId && typeof $request !== "undefined" && $request.body) {
            let decodedBody = decode($request.body);
            if (decodedBody && decodedBody.deviceId) auth.deviceId = decodedBody.deviceId;
        }
    }

    $.setdata(JSON.stringify(auth), AUTH_KEY);
    $.log("[WeRead] auth saved, deviceId=" + (auth.deviceId ? "present" : "missing")
        + ", refreshToken=" + (auth.refreshToken ? "present" : "missing"));
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
    return {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": a.ua || "WeRead",
        "channelid": a.channelid || "AppStore",
        "basever": a.basever || "",
        "v": a.basever || "",
        "vid": a.vid,
        "skey": a.skey
    };
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
        if (auth.refreshToken && auth.deviceId) {
            $.log("[WeRead] 401 — attempting auto-refresh...");
            let refreshed = await tryRefreshLogin(auth);
            if (refreshed) {
                $.setdata(JSON.stringify(refreshed), AUTH_KEY);
                $.log("[WeRead] refresh succeeded, retrying claim...");
                return await runClaimWithAuth(refreshed);
            }
            $.msg("WeRead", "刷新失败", "自动刷新未成功，请重新打开微信读书 App 手动刷新认证");
            return;
        }

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
            $.msg("WeRead", "认证已过期", "vid/skey 已失效，请重新打开微信读书 App 刷新认证后再试");
            $.setdata("", AUTH_KEY);
            return;
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

    // 在循环外解析一次 prefer_coin，避免每个奖励项重复解析
    let arg = parseArgument(typeof $argument !== "undefined" ? $argument : {});
    let rawPrefer = arg.prefer_coin;
    let preferCoin = true; // 默认优先书币
    if (rawPrefer === false || rawPrefer === "false" || rawPrefer === "switch,false") {
        preferCoin = false;
    }
    let firstType = preferCoin ? 2 : 1;
    let secondType = preferCoin ? 1 : 2;
    $.log("[WeRead] prefer_coin=" + preferCoin + ", firstType=" + firstType);

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
            if (auth.refreshToken && auth.deviceId) {
                $.log("[WeRead] claim 401 — attempting auto-refresh...");
                let refreshed = await tryRefreshLogin(auth);
                if (refreshed) {
                    $.setdata(JSON.stringify(refreshed), AUTH_KEY);
                    $.log("[WeRead] refresh succeeded, retrying claim from scratch...");
                    return await runClaimWithAuth(refreshed);
                }
            }
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
    return {
        "User-Agent": auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Cookie": "wr_skey=" + wrSkey + "; wr_vid=" + wrVid
    };
}

// Try to flip all available cards (max 5 flips per week)
async function runFlipCard(auth) {
    $.log("[WeRead] 翻牌游戏 — 开始...");

    // Get auth if not provided
    if (!auth) auth = getAuth();

    if (!auth || !(auth.wrVid || auth.vid) || !(auth.wrSkey || auth.skey)) {
        $.msg("WeRead", "翻牌", "未捕获到 weread.qq.com 登录信息，请先打开微信读书 App 触发认证捕获");
        return;
    }

    let results = [];
    let attempts = 0;
    const MAX_ATTEMPTS = 5; // 每周最多 5 次

    while (attempts < MAX_ATTEMPTS) {
        // 1. GET card list to find unflipped cards
        let listUrl = FLIP_API + "/flipCard?pf=ios&platform=ios_html";
        let listRes = await get(listUrl, getFlipHeaders(auth));

        if (listRes.status !== 200) {
            $.log("[WeRead] 翻牌 — 查询卡列表失败 HTTP " + listRes.status);
            break;
        }

        let data = JSON.parse(listRes.body || "{}");

        // remainingCount = remaining flips allowed
        let remaining = data.remainingCount;
        if (!remaining || remaining <= 0) {
            $.log("[WeRead] 翻牌 — 无剩余翻牌次数");
            break;
        }

        // 2. Find first unflipped card (status === 0)
        let cards = data.cardList || [];
        let target = null;
        for (let c of cards) {
            if (c.status === 0) {
                target = c;
                break;
            }
        }

        if (!target) {
            $.log("[WeRead] 翻牌 — 没有未翻开的卡片");
            break;
        }

        $.log("[WeRead] 翻牌 — 第 " + (attempts + 1) + "/" + MAX_ATTEMPTS + " 次, 翻 cardIndex=" + target.cardIndex);

        // 3. POST flip request (captured as POST, URL has query params, no body)
        let flipUrl = FLIP_API + "/flipCardFlip?cardIndex=" + target.cardIndex + "&pf=ios&platform=ios_html";
        let flipRes = await post(
            flipUrl,
            "",
            getFlipHeaders(auth)
        );

        attempts++;

        if (flipRes.status === 200) {
            let flipData = JSON.parse(flipRes.body || "{}");
            // Extract prize info
            let prize = flipData.prizeName || flipData.reward || flipData.giftName || "未知奖励";
            let type = flipData.prizeType || flipData.type || "";
            results.push("第" + attempts + "次: " + prize + (type ? " (" + type + ")" : ""));
            $.log("[WeRead] 翻牌 — 第 " + attempts + " 次成功: " + prize);
        } else {
            $.log("[WeRead] 翻牌 — 第 " + attempts + " 次失败 HTTP " + flipRes.status);
            results.push("第" + attempts + "次: 失败 (HTTP " + flipRes.status + ")");
            break;
        }

        // Brief delay between flips
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


// Try to refresh vid/skey via /login using saved refreshToken + deviceId
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

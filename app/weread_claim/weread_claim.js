/*
#!name=微信读书·自动领取（每日签到）
#!desc=微信读书阅读奖励自动领取（每日 23:00）。仅负责每日阅读时长与天数达标奖励领取。
#!author=TomCatXue
#!homepage=https://github.com/TomCatXue/MyCookieCenter
#!icon=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/icons/weread.png
#!tag=微信读书,自动领取,阅读奖励

配置由 loon/CookieCenter.plugin 或 loon/WeReadEnhance.plugin 提供：
- 每日领取 cron -> 本文件（每日 23:00）
- 凭据自动捕获 -> 本文件（打开微信读书 App 时自动保存）
参数面板由 boxjs/CookieCenter.boxjs.json 订阅提供。
*/

const AUTH_KEY = "weread_auth_v2";
const SCRIPT_VERSION = "2026-09-05-independent";
const API = "https://i.weread.qq.com";
const PF = "weread_wx-2001-iap-2001-iphone";

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

function describeChoice(choice, resp) {
    if (resp && resp.body) {
        let ex = decode(resp.body);
        if (ex) {
            if (ex.awardName) return ex.awardName;
            if (ex.exchangeName) return ex.exchangeName;
            if (ex.desc) return ex.desc;
            if (ex.choiceName) return ex.choiceName;
        }
    }
    if (choice.choiceName) return choice.choiceName;
    if (choice.name) return choice.name;
    if (choice.desc) return choice.desc;
    if (choice.choiceType === 2) return "书币";
    if (choice.choiceType === 1) return "体验卡";
    return "奖励";
}

function resolvePreferCoin(rawPrefer) {
    let preferVal = rawPrefer;
    if (typeof preferVal === "string") {
        preferVal = preferVal.replace(/^(input|switch),/, "");
    }
    let preferCoin = true;
    if (preferVal === 1 || preferVal === "1" || preferVal === false || preferVal === "false") {
        preferCoin = false;
    }
    return {
        raw: rawPrefer,
        preferCoin: preferCoin,
        firstType: preferCoin ? 2 : 1,
        secondType: preferCoin ? 1 : 2
    };
}

async function runClaim() {

    let auth = getAuth();

    if (!auth) {
        $.msg("WeRead · 每日签到", "没有认证", "请打开微信读书刷新一次");
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
        $.msg("WeRead · 每日签到", "领取完成", "成功领取 " + count + " 个奖励\n" + details.join("、"));
    else
        $.msg("WeRead · 每日签到", "领取完成", "暂无可领取的奖励");

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


let $ = new Env("WeRead · 每日签到");

async function main() {
    try {
        await runClaim();
    } catch (e) {
        $.msg("WeRead · 每日签到", "执行异常", String(e));
    }
    $done({});
}

if (typeof module === "undefined" || !module.exports) {
    main();
}

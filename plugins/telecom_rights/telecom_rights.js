/*
------------------------------------------
@Name: 中国电信 · 等级权益兑换话费
@Author: TomCatXue
@Description: 基于电信真实 wappark.189.cn/jt-sign 网关，自动拦截 sign/accId，0点准时自动抢兑话费
@Rule: 完全摒弃失效的脱机密码与金豆体系，直接继承 App 登录态与瑞数 Cookie，内置 RSA-1024 加密
------------------------------------------
*/

const $ = new Env("中国电信 · 等级权益兑换");
const AUTH_KEY = "telecom_rights_auth";

// RSA 公钥 (来自 0点权益.py)
const RSA_PUBLIC_KEY = `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB`;

function getStoredAuth() {
    let raw = $.getdata(AUTH_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw); } catch (e) { return {}; }
}

function saveAuth(newAuth) {
    $.setdata(JSON.stringify(newAuth), AUTH_KEY);
}

// ============================================================
// 1. 抓取与回填层 (http-request / http-response)
// ============================================================
if (typeof $request !== "undefined" && typeof $response === "undefined") {
    handleRequest();
} else if (typeof $response !== "undefined") {
    handleResponse();
} else {
    // ============================================================
    // 2. 执行层 (Cron 定时任务 / 手动测试模式)
    // ============================================================
    executeTask();
}

function handleRequest() {
    const url = $request.url || "";
    const headers = $request.headers || {};
    const body = $request.body || "";

    let existing = getStoredAuth();
    let updated = false;

    // 1. 拦截请求头中的核心字段：sign
    let sign = headers["sign"] || headers["Sign"] || "";
    if (sign && existing.sign !== sign) {
        existing.sign = sign;
        updated = true;
    }

    // 2. 提取有效 Cookie (包含通过瑞数校验的关键 Cookie)
    let cookie = headers["Cookie"] || headers["cookie"] || "";
    if (cookie && cookie.length > 30 && existing.cookie !== cookie) {
        existing.cookie = cookie;
        updated = true;
    }

    // 3. 提取 User-Agent
    let ua = headers["User-Agent"] || headers["user-agent"] || "";
    if (ua && existing.ua !== ua) {
        existing.ua = ua;
        updated = true;
    }

    // 4. 尝试从 URL 或 Body 提取 accId
    if (url) {
        let m = url.match(/[?&]accId=([0-9a-zA-Z_-]+)/i);
        if (m && existing.accId !== m[1]) {
            existing.accId = m[1];
            updated = true;
        }
    }
    if (body) {
        let m = body.match(/"accId"\s*:\s*"([0-9a-zA-Z_-]+)"/i);
        if (m && existing.accId !== m[1]) {
            existing.accId = m[1];
            updated = true;
        }
    }

    if (updated) {
        existing.updateTime = Date.now();
        saveAuth(existing);
        let statusDesc = existing.sign ? "sign: " + existing.sign.slice(0, 8) + "..." : (existing.cookie ? "Cookie已记录" : "未就绪");
        $.log("[电信权益] 抓取到参数更新: " + statusDesc + " (URL: " + url.slice(0, 60) + "...)");
        if (existing.sign) {
            $.msg($.name, "✅ 等级权益凭据捕获成功", "已捕获核心 sign 与鉴权 Cookie\n0 点抢兑话费已就绪");
        }
    }

    $done({});
}

function handleResponse() {
    const url = $request ? ($request.url || "") : "";
    const resBody = $response ? ($response.body || "") : "";

    let existing = getStoredAuth();
    let updated = false;

    try {
        let data = JSON.parse(resBody);

        // 拦截 ssoHomLogin 响应：直接提取 sign 与 accId
        if (url.indexOf("ssoHomLogin") !== -1 && (data.resoultCode === "0" || data.code === 0)) {
            if (data.sign) {
                existing.sign = data.sign;
                updated = true;
            }
            if (data.accId) {
                existing.accId = data.accId;
                updated = true;
            }
            $.log("[电信权益] 从 ssoHomLogin 响应回填成功: accId=" + existing.accId + ", sign=" + (existing.sign ? existing.sign.slice(0, 8) + "..." : "无"));
        }
    } catch (e) { }

    if (updated && existing.sign) {
        existing.updateTime = Date.now();
        saveAuth(existing);
        $.msg($.name, "✅ 等级权益会话已锁定", "accId: " + (existing.accId || "已记录") + "\nsign: " + existing.sign.slice(0, 8) + "...\n零点准时抢兑");
    }

    $done({});
}

async function executeTask() {
    let auth = getStoredAuth();
    let sign = auth.sign || "";
    let accId = auth.accId || "";
    let cookie = auth.cookie || "";

    if (!sign) {
        $.msg($.name, "❌ 缺少核心 sign 凭证", "请打开电信营业厅 App -> 点击「我」->「签到」或「等级权益」页面，等待凭据自动捕获！");
        $.log("[电信权益] 错误: 未找到有效 sign。请进入电信 App 的等级权益中心进行一次流量拦截。");
        $.done();
        return;
    }

    $.log("[电信权益] 任务启动: accId=" + (accId || "待查询") + ", sign=" + sign.slice(0, 8) + "...");

    // 1. 查询当前等级与话费权益 ID (queryLevelRightInfo)
    $.log("[电信权益] 正在查询当期等级权益列表...");
    let rightInfo = await queryRightsInfo(auth);

    if (!rightInfo || !rightInfo.rightsId) {
        $.msg($.name, "⚠️ 未匹配到话费权益", "可能当月已领完，或未查询到包含话费的等级项目");
        $.log("[电信权益] 查询权益失败或未识别到话费选项: " + JSON.stringify(rightInfo));
        $.done();
        return;
    }

    $.log("[电信权益] 成功定位目标话费权益: ID=" + rightInfo.rightsId + " (" + (rightInfo.title || "话费券") + ")");

    // 2. 准点发起兑换请求 (receiverRights)
    $.log("[电信权益] 正在提交领取请求...");
    let res = await receiveRights(auth, rightInfo.rightsId);
    $.log("[电信权益] 领取响应: " + JSON.stringify(res));

    let resText = JSON.stringify(res);
    if (resText.includes("成功") || resText.includes("已领取过该权益") || (res && res.resoultCode === "0")) {
        let desc = (res && res.resoultMsg) || "话费权益已到账";
        $.msg($.name, "🎉 兑换成功！", desc);
    } else if (resText.includes("领完") || resText.includes("结束") || resText.includes("售罄")) {
        $.msg($.name, "⚠️ 库存告罄", "当期话费权益已领完，下期请早~");
    } else if (resText.includes("人数过多")) {
        $.msg($.name, "👥 抢购人数过多", "并发触发系统繁忙，建议下次微调时间重试");
    } else {
        $.msg($.name, "❌ 领取反馈", (res ? (res.resoultMsg || res.msg || resText.slice(0, 60)) : "请求异常"));
    }

    $.done();
}

// 查询等级权益列表
function queryRightsInfo(auth) {
    return new Promise(resolve => {
        let value = {
            type: "hg_qd_djqydh",
            accId: auth.accId || "",
            shopId: "20001"
        };
        let paraV = encryptParaRsa(value);

        let options = {
            url: "https://wappark.189.cn/jt-sign/paradise/queryLevelRightInfo",
            headers: {
                "sign": auth.sign,
                "Content-Type": "application/json;charset=utf-8",
                "Referer": "https://wappark.189.cn/resources/dist/signInActivity.html",
                "User-Agent": auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
            },
            body: JSON.stringify({ para: paraV }),
            timeout: 8000
        };
        if (auth.cookie) options.headers["Cookie"] = auth.cookie;

        $httpClient.post(options, (err, resp, data) => {
            if (err || !data) {
                resolve(null);
                return;
            }
            try {
                let d = JSON.parse(data);
                if (d.currentLevel) {
                    let key = "V" + d.currentLevel;
                    let items = d[key] || [];
                    let target = items.find(it => it.title && it.title.includes("话费")) || items[0];
                    if (target) {
                        resolve({
                            rightsId: target.activityId || target.id,
                            title: target.title,
                            level: d.currentLevel
                        });
                        return;
                    }
                }
                resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    });
}

// 提交领取权益
function receiveRights(auth, rightsId) {
    return new Promise(resolve => {
        let value = {
            id: rightsId,
            accId: auth.accId || "",
            showType: "9003",
            showEffect: "8",
            czValue: "0"
        };
        let paraV = encryptParaRsa(value);

        let options = {
            url: "https://wappark.189.cn/jt-sign/paradise/receiverRights",
            headers: {
                "sign": auth.sign,
                "Content-Type": "application/json;charset=utf-8",
                "Referer": "https://wappark.189.cn/resources/dist/signInActivity.html",
                "User-Agent": auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
            },
            body: JSON.stringify({ para: paraV }),
            timeout: 8000
        };
        if (auth.cookie) options.headers["Cookie"] = auth.cookie;

        $httpClient.post(options, (err, resp, data) => {
            if (err) {
                resolve({ code: -1, msg: String(err) });
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                resolve({ code: -1, msg: data ? data.slice(0, 100) : "响应非JSON" });
            }
        });
    });
}

// ==================== 纯 JS 原生 RSA-1024 加密 (PKCS#1 v1.5) ====================
function parseSpkiKey(b64) {
    let raw = (typeof Buffer !== "undefined") ? Buffer.from(b64, "base64") : base64ToUint8(b64);
    let idx = 0;
    while (idx < raw.length - 4) {
        if (raw[idx] === 0x02) {
            let len = raw[idx + 1];
            let offset = idx + 2;
            if (len & 0x80) {
                let count = len & 0x7f;
                len = 0;
                for (let k = 0; k < count; k++) len = (len << 8) | raw[offset++];
            }
            let nBytes = raw.slice(offset, offset + len);
            let nHex = bytesToHex(nBytes);
            let n = BigInt("0x" + nHex);
            idx = offset + len;
            if (idx < raw.length && raw[idx] === 0x02) {
                let eLen = raw[idx + 1];
                let eBytes = raw.slice(idx + 2, idx + 2 + eLen);
                let e = BigInt("0x" + bytesToHex(eBytes));
                return { n, e, keyLen: (nBytes[0] === 0 ? nBytes.length - 1 : nBytes.length) };
            }
        }
        idx++;
    }
    throw new Error("解析 RSA 公钥失败");
}

function modPow(b, exp, mod) {
    let res = 1n;
    b = b % mod;
    while (exp > 0n) {
        if (exp & 1n) res = (res * b) % mod;
        exp >>= 1n;
        b = (b * b) % mod;
    }
    return res;
}

function rsaEncryptPkcs1Hex(chunkStr, b64Key) {
    let { n, e, keyLen } = parseSpkiKey(b64Key);
    let dataBuf = (typeof Buffer !== "undefined") ? Buffer.from(chunkStr, "utf-8") : strToUtf8(chunkStr);
    let psLen = keyLen - 3 - dataBuf.length;
    if (psLen < 8) throw new Error("Data too long for RSA key");

    let em = new Uint8Array(keyLen);
    em[0] = 0x00;
    em[1] = 0x02;
    for (let i = 2; i < 2 + psLen; i++) {
        let b = 0;
        while (b === 0) b = Math.floor(Math.random() * 255) + 1;
        em[i] = b;
    }
    em[2 + psLen] = 0x00;
    for (let i = 0; i < dataBuf.length; i++) em[3 + psLen + i] = dataBuf[i];

    let m = BigInt("0x" + bytesToHex(em));
    let c = modPow(m, e, n);
    let cHex = c.toString(16);
    while (cHex.length < keyLen * 2) cHex = "0" + cHex;
    return cHex;
}

function encryptParaRsa(payloadObj) {
    let jsonStr = JSON.stringify(payloadObj);
    let chunkSize = 117;
    let hexResult = "";
    for (let i = 0; i < jsonStr.length; i += chunkSize) {
        let chunk = jsonStr.substr(i, chunkSize);
        hexResult += rsaEncryptPkcs1Hex(chunk, RSA_PUBLIC_KEY);
    }
    return hexResult;
}

function bytesToHex(b) {
    let s = "";
    for (let i = 0; i < b.length; i++) {
        let h = b[i].toString(16);
        s += (h.length === 1 ? "0" + h : h);
    }
    return s;
}

function strToUtf8(str) {
    let utf8 = [];
    for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        } else {
            utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        }
    }
    return new Uint8Array(utf8);
}

function base64ToUint8(base64) {
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes = [];
    let p = 0;
    for (let i = 0; i < base64.length; i += 4) {
        let n = (chars.indexOf(base64[i]) << 18) | (chars.indexOf(base64[i+1]) << 12) |
                (chars.indexOf(base64[i+2]) << 6) | (chars.indexOf(base64[i+3]));
        bytes.push((n >> 16) & 255);
        if (base64[i+2] !== '=') bytes.push((n >> 8) & 255);
        if (base64[i+3] !== '=') bytes.push(n & 255);
    }
    return new Uint8Array(bytes);
}

function Env(name) {
    this.name = name;
    this.getdata = function (k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        return null;
    };
    this.setdata = function (v, k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        return false;
    };
    this.msg = function (t, s, b) {
        if (typeof $notification !== "undefined") $notification.post(t, s, b);
        console.log("[通知] " + t + " - " + s + ": " + b);
    };
    this.log = function (msg) { console.log(msg); };
    this.done = function () { if (typeof $done !== "undefined") $done({}); };
}

/*
------------------------------------------
@Name: 中国电信 · 等级权益兑换话费
@Author: TomCatXue
@Description: 基于电信 wappark.189.cn/jt-sign 网关，23:59提前唤醒，提前250ms毫秒级偷跑直发，当月中奖自动休眠
@Rule: 1. 23:59提前唤醒，高精度倒计时至 23:59:59.750 偷跑对冲网络延迟
       2. 提前预热 rightsId，零点免查直接并发 3 连发
       3. 当月中奖一次立即全月休眠，未中每天循环偷跑抢兑
------------------------------------------
*/

const $ = new Env("中国电信 · 等级权益兑换");
const AUTH_KEY = "telecom_rights_auth";
const DEFAULT_LV5_RIGHTS_ID = "eae02aa850f607daa851910621d86200b10256cab2504e274ba6224e91254ea7";

const CLAIMED_MONTH_KEY = "telecom_rights_claimed_month";

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
// 1. 抓取与回填层 (进 App 自动预热锁定 sign 与话费权益 ID)
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

    let sign = headers["sign"] || headers["Sign"] || "";
    let cookie = headers["Cookie"] || headers["cookie"] || "";

    // 3 分钟同 sign 防抖
    const isDebounced = existing.sign && sign === existing.sign && (Date.now() - (existing.updateTime || 0) < 3 * 60 * 1000);
    if (isDebounced) {
        $done({});
        return;
    }

    let updated = false;

    if (sign && existing.sign !== sign) {
        existing.sign = sign;
        updated = true;
    }

    if (cookie && cookie.length > 30 && existing.cookie !== cookie) {
        existing.cookie = cookie;
        updated = true;
    }

    let ua = headers["User-Agent"] || headers["user-agent"] || "";
    if (ua && existing.ua !== ua) {
        existing.ua = ua;
        updated = true;
    }

    if (url) {
        let m = url.match(/[?&]accId=([0-9a-zA-Z_-]+)/i);
        if (m && existing.accId !== m[1]) {
            existing.accId = m[1];
            updated = true;
        }
    }

    if (updated && existing.sign) {
        existing.updateTime = Date.now();
        saveAuth(existing);

        // 防抖通知：5 分钟内最多弹 1 次
        let lastNotify = existing.lastNotifyTime || 0;
        if (Date.now() - lastNotify > 5 * 60 * 1000) {
            existing.lastNotifyTime = Date.now();
            saveAuth(existing);
            $.msg($.name, "✅ 等级权益凭据已锁定", "sign: " + existing.sign.slice(0, 8) + "...\n今晚偷跑已就绪");
        }
        $.log("[电信权益] sign 凭据已更新: " + existing.sign.slice(0, 8) + "...");
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

        // 拦截 ssoHomLogin 响应
        if (url.indexOf("ssoHomLogin") !== -1 && (data.resoultCode === "0" || data.code === 0)) {
            if (data.sign && existing.sign !== data.sign) {
                existing.sign = data.sign;
                updated = true;
            }
            if (data.accId && existing.accId !== data.accId) {
                existing.accId = data.accId;
                updated = true;
            }
        }

        // 拦截 queryLevelRightInfo 响应，预热缓存当前等级与话费项目 ID
        if (url.indexOf("queryLevelRightInfo") !== -1 && data.currentLevel) {
            let key = "V" + data.currentLevel;
            let items = data[key] || [];
            let target = items.find(it => it.title && it.title.includes("话费")) || items[0];
            if (target && target.activityId) {
                existing.cachedRightsId = target.activityId || target.id;
                existing.cachedTitle = target.title;
                existing.cachedLevel = data.currentLevel;
                updated = true;
                $.log("[电信权益] 预热缓存话费权益 ID 成功: " + existing.cachedRightsId + " (" + target.title + ")");
            }
        }
    } catch (e) { }

    if (updated && existing.sign) {
        existing.updateTime = Date.now();
        saveAuth(existing);

        let lastNotify = existing.lastNotifyTime || 0;
        if (Date.now() - lastNotify > 5 * 60 * 1000) {
            existing.lastNotifyTime = Date.now();
            saveAuth(existing);
            $.msg($.name, "✅ 等级权益会话已锁定", "accId 与 sign 已就绪，今晚准时抢兑");
        }
        $.log("[电信权益] ssoHomLogin 凭据已回填: accId=" + existing.accId);
    }

    $done({});
}

// ============================================================
// 2. 执行层：提前唤醒 + 提前 250ms 偷跑 + 3连发突发
// ============================================================
async function executeTask() {
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`; // 形如 "202609"

    // 【机制 1：当月中奖终结休眠锁】
    const claimedMonth = $.getdata(CLAIMED_MONTH_KEY);
    const isManualTest = (typeof $argument === "string" && $argument.toLowerCase().includes("test"));

    if (!isManualTest && claimedMonth === currentYearMonth) {
        $.log(`[电信权益] 🎉 本月（${currentYearMonth}）话费权益已成功领取，全月自动休眠，下月1号自动恢复。`);
        $.done();
        return;
    }

    let auth = getStoredAuth();
    let sign = auth.sign || "";
    let accId = auth.accId || "";

    if (!sign) {
        $.msg($.name, "❌ 缺少核心 sign 凭证", "请打开电信营业厅 App -> 点击「我」->「签到」或「等级权益」页面完成捕获！");
        $.log("[电信权益] 错误: 本地未找到 sign。需进入电信 App 的等级权益中心完成一次静默拦截。");
        $.done();
        return;
    }

    let ageMinutes = Math.round((Date.now() - (auth.updateTime || 0)) / 60000);
    $.log(`[电信权益] 任务就绪: accId=${accId || "待查询"}, sign=${sign.slice(0, 8)}..., 距捕获已过 ${ageMinutes} 分钟`);

    // 【机制 2：预热获取 rightsId】
    let rightsId = $.getdata("telecom_rights_id") || auth.cachedRightsId || DEFAULT_LV5_RIGHTS_ID;
    let rightsTitle = auth.cachedTitle || "LV5等级权益3元话费";

    if (!rightsId) {
        $.log("[电信权益] 本地未缓存 rightsId，正在向服务端查询当期项目...");
        let rightInfo = await queryRightsInfo(auth);

        if (rightInfo && (rightInfo.error === "UNAUTHORIZED" || rightInfo.error === "EXPIRED")) {
            let reason = rightInfo.error === "EXPIRED" ? "会话超时(412)" : "sign失效(401)";
            $.msg($.name, "❌ 凭据已超时失效", `距上次捕获已过 ${ageMinutes} 分钟，${reason}。请在今晚 23:55 打开电信 App 刷新凭据！`);
            $.log(`[电信权益] 错误: 凭证已过期失效（服务端返回 ${reason}）。请在 23:50~23:58 打开 App 刷新！`);
            $.done();
            return;
        }

        if (!rightInfo || !rightInfo.rightsId) {
            let errDesc = rightInfo ? (rightInfo.msg || "无匹配数据") : "网络异常";
            $.msg($.name, "⚠️ 未匹配到话费权益", errDesc);
            $.log("[电信权益] 查询权益失败: " + JSON.stringify(rightInfo));
            $.done();
            return;
        }

        rightsId = rightInfo.rightsId;
        rightsTitle = rightInfo.title || "话费券";
        auth.cachedRightsId = rightsId;
        auth.cachedTitle = rightsTitle;
        saveAuth(auth);
    }

    $.log(`[电信权益] 🎯 目标话费锁定: ID=${rightsId} (${rightsTitle})`);

    // 【机制 3：23:59 提前唤醒 + 提前 250ms 毫秒级偷跑倒计时】
    // 在 23:58~23:59 触发时自动驻留内存，精准等待至 23:59:59.750
    if (!isManualTest && now.getHours() === 23 && now.getMinutes() >= 58) {
        const targetMidnight = new Date(now);
        targetMidnight.setDate(targetMidnight.getDate() + 1);
        targetMidnight.setHours(0, 0, 0, 0);

        // 提前 250 毫秒开火，抵消 50~100ms 网络传输与调度延迟
        const fireTimestamp = targetMidnight.getTime() - 250;
        const waitMs = fireTimestamp - Date.now();

        if (waitMs > 0 && waitMs <= 75000) {
            $.log(`[电信权益] ⚡️ 偷跑引擎启动！当前时间 ${now.toLocaleTimeString()}，倒计时 ${(waitMs / 1000).toFixed(1)} 秒，将在 23:59:59.750 准点突发抢兑...`);
            await $.wait(waitMs);
        }
    }

    // 【机制 4：短间隔 3 连发并发突发 (Burst Strategy)】
    let success = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
        let fireNow = new Date().toLocaleTimeString() + "." + String(Date.now() % 1000).padStart(3, "0");
        $.log(`[电信权益] 🚀 @${fireNow} [第${attempt}枪] 发起抢兑...`);
        let res = await receiveRights(auth, rightsId);
        let resText = JSON.stringify(res);
        $.log(`[电信权益] 响应 [第${attempt}枪]: ${resText}`);

        if (resText.includes("成功") || resText.includes("已领取过该权益") || (res && (res.resoultCode === "0" || res.code === 0))) {
            let desc = (res && res.resoultMsg) || "话费权益已成功提交到账！";
            $.setdata(currentYearMonth, CLAIMED_MONTH_KEY);
            $.msg($.name, "🎉 话费秒杀成功！", `${desc}\n已开启全月深度休眠，下月1号自动恢复。`);
            $.log(`[电信权益] 🎉 恭喜秒杀成功！已打上本月（${currentYearMonth}）休眠锁。`);
            success = true;
            break;
        } else if (resText.includes("领完") || resText.includes("结束") || resText.includes("售罄")) {
            $.msg($.name, "⚠️ 本轮已售罄", "今日 105 个名额已被抢光，明晚 23:59 继续自动蹲守！");
            $.log("[电信权益] 本轮库存告罄，未锁定休眠，明晚继续尝试。");
            break;
        } else if (res && (res.code === "401" || resText.includes("未授权") || resText.includes("DOCTYPE"))) {
            $.msg($.name, "❌ sign 凭证已过期", "请在今晚 23:55 左右打开一次电信 App 刷新凭证！");
            break;
        }

        if (attempt < 3) await $.wait(250);
    }

    if (!success) {
        $.log("[电信权益] 本轮抢兑结束，明晚 23:59 继续值守。");
    }

    $.done();
}


function cleanCookie(rawCookie) {
    if (!rawCookie) return "";
    return rawCookie
        .split(";")
        .map(s => s.trim())
        .filter(s => s && !s.startsWith("FSSBBIl1Ugzb") && !s.startsWith("wSmxQu") && !s.startsWith("1cieWOle"))
        .join("; ");
}

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
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://wappark.189.cn",
                "Referer": "https://wappark.189.cn/resources/dist/signInActivity.html",
                "User-Agent": auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
                "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({ para: paraV }),
            timeout: 8000
        };
        let c = cleanCookie(auth.cookie);
        if (c) options.headers["Cookie"] = c;

        $httpClient.post(options, (err, resp, data) => {
            if (err || !data) {
                $.log("[电信权益] 查询网络异常: " + (err ? String(err) : "空响应"));
                resolve({ error: "NETWORK_ERROR", msg: String(err || "无网络响应") });
                return;
            }
            $.log("[电信权益] 服务端权益原始返回: " + (data.indexOf("<!DOCTYPE") !== -1 ? "触发瑞数412防护(会话超时)" : data.slice(0, 200)));
            if (data.indexOf("<!DOCTYPE") !== -1 || (resp && resp.status === 412)) {
                resolve({ error: "EXPIRED", msg: "电信会话与Cookie已过期超时(412)" });
                return;
            }
            try {
                let d = JSON.parse(data);
                if (d.code === "401" || d.code === 401 || (d.msg && d.msg.includes("未授权"))) {
                    resolve({ error: "UNAUTHORIZED", msg: d.msg || "未授权访问" });
                    return;
                }
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
                resolve({ error: "NO_MATCH", msg: "未找到符合的话费权益", raw: d });
            } catch (e) {
                resolve({ error: "PARSE_ERROR", msg: data.slice(0, 100) });
            }
        });
    });
}

function receiveRights(auth, rightsId, useCleanCookie = true) {
    return new Promise(resolve => {
        let value = {
            id: rightsId,
            accId: auth.accId || "",
            showType: "9003",
            showEffect: "8",
            czValue: "0"
        };
        let paraV = encryptParaRsa(value);

        let c = useCleanCookie ? cleanCookie(auth.cookie) : (auth.cookie || "");

        let options = {
            url: "https://wappark.189.cn/jt-sign/paradise/receiverRights",
            headers: {
                "sign": auth.sign,
                "Content-Type": "application/json;charset=utf-8",
                "Accept": "application/json, text/plain, */*",
                "Origin": "https://wappark.189.cn",
                "Referer": "https://wappark.189.cn/resources/dist/signInActivity.html",
                "User-Agent": auth.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
                "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify({ para: paraV }),
            timeout: 8000
        };
        if (c) options.headers["Cookie"] = c;

        $httpClient.post(options, (err, resp, data) => {
            if (err) {
                resolve({ code: -1, msg: String(err) });
                return;
            }
            if (data && (data.indexOf("<!DOCTYPE") !== -1 || (resp && resp.status === 412))) {
                // 如果是第一次使用纯净 Cookie 被拦，则回退尝试使用原始 Cookie
                if (useCleanCookie) {
                    $.log("[电信权益] 纯净 Cookie 触发 412，自动切换原始 Cookie 重试提交...");
                    receiveRights(auth, rightsId, false).then(resolve);
                    return;
                }
                resolve({ code: -1, msg: "触发瑞数412防护(请在App内点一次兑换)" });
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
    this.wait = function (ms) { return new Promise(r => setTimeout(r, ms)); };
    this.done = function () { if (typeof $done !== "undefined") $done({}); };
}

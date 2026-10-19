/**
 * 中国电信 · 5G会员与权益商城凭据捕获脚本 (纯抓取版)
 * 
 * 职责：专职负责在 Loon / 代理工具中捕获微信小程序「中国电信5G会员」与「权益商城」的凭据：
 * 1. 捕获 32位 SessionKey 与 11位有效手机号 (productNo)；
 * 2. 捕获当前有效的批次活动号 (activityNo)；
 * 3. 严格去重与静默更新，新凭据首次捕获才发送通知，同凭据静默跳过；
 * 4. 【核心规范】：纯捕获层，绝不发起任何网络抽奖或签到执行，执行全部由青龙面板负责。
 *
 * @Author: TomCatXue
 * @Version: 2.1.0 (纯抓取 + 捕获通知)
 * @Date: 2026-10-15
 */

const $ = new Env("中国电信 · 会员凭据捕获");

// 同一页面会并发多个请求，10 秒内同源通知只弹一次；超过窗口再进入仍会提示
const NOTIFY_GAP_MS = 10 * 1000;

const STORAGE_KEYS = {
    SESSION_KEY: "telecom_draw_session_key",
    PRODUCT_NO: "telecom_draw_product_no",
    WEDNESDAY_ACT1: "telecom_draw_wednesday_act1",
    WEDNESDAY_ACT2: "telecom_draw_wednesday_act2",
    LUCKY_ACT: "telecom_draw_lucky_act",
    LAST_CAPTURE_TIME: "telecom_draw_last_capture_time",
    NOTIFIED_SESSION_KEY: "telecom_draw_notified_session_key",
    LAST_NOTIFY_TIME: "telecom_draw_last_notify_time"
};

(function main() {
    if (typeof $request === "undefined" && typeof $response === "undefined") {
        $.log("[ERROR] 本脚本仅作为 http-request / http-response 重写脚本运行");
        $.done();
        return;
    }

    const url = (typeof $request !== "undefined" && $request.url) ? $request.url : ((typeof $response !== "undefined" && $response.url) ? $response.url : "");
    const headers = (typeof $request !== "undefined" && $request.headers) ? $request.headers : ((typeof $response !== "undefined" && $response.headers) ? $response.headers : {});
    let body = "";
    if (typeof $response !== "undefined" && $response.body) {
        body = typeof $response.body === "string" ? $response.body : "";
    } else if (typeof $request !== "undefined" && $request.body) {
        body = typeof $request.body === "string" ? $request.body : "";
    }

    let capturedSessionKey = "";
    let capturedProductNo = "";
    let capturedAct = "";

    // 1. 从 URL 查询参数提取
    const urlSession = getQueryParam(url, "sessionKey") || getQueryParam(url, "sessionkey");
    const urlProduct = getQueryParam(url, "productNo") || getQueryParam(url, "phoneNo");
    const urlAct = getQueryParam(url, "activityNo") || getQueryParam(url, "activityId");

    if (urlSession) capturedSessionKey = urlSession;
    if (urlProduct) capturedProductNo = urlProduct;
    if (urlAct) capturedAct = urlAct;

    // 2. 从 Header 提取
    const headerSession = headers["sessionkey"] || headers["sessionKey"] || headers["SessionKey"];
    if (headerSession) capturedSessionKey = headerSession;

    // 3. 从 Body 提取
    if (body) {
        try {
            let parsed = null;
            if (body.startsWith("{")) {
                parsed = JSON.parse(body);
            } else if (/^[A-Za-z0-9+/=]+$/.test(body.trim())) {
                // 解码 checkParam 登录校验请求体的 base64 明文 JSON
                parsed = tryDecodeBase64Json(body);
            } else {
                parsed = parseQueryString(body);
            }

            if (parsed) {
                const targetObj = parsed.result && typeof parsed.result === "object" ? parsed.result : parsed;
                if (targetObj.sessionKey) capturedSessionKey = targetObj.sessionKey;
                if (targetObj.sessionkey) capturedSessionKey = targetObj.sessionkey;
                if (targetObj.productNo) capturedProductNo = targetObj.productNo;
                if (targetObj.phoneNo) capturedProductNo = targetObj.phoneNo;
                if (targetObj.activityNo) capturedAct = targetObj.activityNo;
                if (targetObj.activityId) capturedAct = targetObj.activityId;
            }
        } catch (e) {}
    }

    let isSessionUpdated = false;

    // 严格校验 SessionKey：必须是 32 位 Hex 字符
    if (capturedSessionKey && /^[0-9a-fA-F]{32}$/.test(capturedSessionKey)) {
        const oldSession = $.getdata(STORAGE_KEYS.SESSION_KEY);
        if (capturedSessionKey !== oldSession) {
            $.setdata(capturedSessionKey, STORAGE_KEYS.SESSION_KEY);
            isSessionUpdated = true;
        }
    }

    // 严格校验手机号：必须符合大陆 11 位有效手机号格式（过滤内部产品线 ID）
    if (capturedProductNo && /^1[3-9]\d{9}$/.test(capturedProductNo)) {
        const oldProduct = $.getdata(STORAGE_KEYS.PRODUCT_NO);
        if (capturedProductNo !== oldProduct) {
            $.setdata(capturedProductNo, STORAGE_KEYS.PRODUCT_NO);
        }
    }

    // 动态捕获并更新活动编号
    if (capturedAct) {
        if (capturedAct.startsWith("hd")) {
            if (capturedAct === "hd76690472") {
                $.setdata(capturedAct, STORAGE_KEYS.WEDNESDAY_ACT1);
            } else if (capturedAct === "hd92859166") {
                $.setdata(capturedAct, STORAGE_KEYS.WEDNESDAY_ACT2);
            } else if (capturedAct !== "hd70226376") {
                $.log("[凭据捕获] 发现新批次周三活动号: " + capturedAct);
                $.setdata(capturedAct, STORAGE_KEYS.WEDNESDAY_ACT1);
            }
        } else if (capturedAct.startsWith("A202")) {
            $.setdata(capturedAct, STORAGE_KEYS.LUCKY_ACT);
        }
    }

    // 记录捕获时间并执行【新会话只通知一次】策略
    if (isSessionUpdated) {
        const nowTime = new Date().toLocaleString();
        $.setdata(nowTime, STORAGE_KEYS.LAST_CAPTURE_TIME);
        const rawPhone = $.getdata(STORAGE_KEYS.PRODUCT_NO) || "";
        const maskedPhone = rawPhone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") || "已更新";
        const keySnippet = capturedSessionKey.slice(0, 8) + "...";

        $.setdata(capturedSessionKey, STORAGE_KEYS.NOTIFIED_SESSION_KEY);
        // 凭据确实变化：强制通知，不受 10 秒窗口限制
        $.setdata(String(Date.now()), STORAGE_KEYS.LAST_NOTIFY_TIME);
        $.msg("中国电信 · 会员凭据已就绪", "账号: " + maskedPhone,
            "SessionKey: " + keySnippet + "\n已存入本地持久化，可在 BoxJS 查看复制");
        $.log("[凭据捕获] 凭据已保存: phone=" + maskedPhone + ", sessionKey=" + keySnippet);
    } else if (capturedSessionKey) {
        // SessionKey 未变化也照常提示，避免用户误以为没抓到
        const rawPhone2 = $.getdata(STORAGE_KEYS.PRODUCT_NO) || "";
        const maskedPhone2 = rawPhone2.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2") || "已记录";
        notifyOnce("中国电信 · 会员凭据已就绪", "账号: " + maskedPhone2,
            "SessionKey: " + capturedSessionKey.slice(0, 8) + "...\n凭据有效（未变化），可直接在 BoxJS 查看复制");
        $.log("[凭据捕获] SessionKey 未变化，仍发送确认通知");
    } else {
        $.log("[凭据捕获] 本次请求未解析到有效 SessionKey: " + (url || "").split("?")[0]);
    }

    $.done();
})();

function notifyOnce(title, sub, body) {
    const last = Number($.getdata(STORAGE_KEYS.LAST_NOTIFY_TIME) || 0);
    if (Date.now() - last < NOTIFY_GAP_MS) return false;
    $.setdata(String(Date.now()), STORAGE_KEYS.LAST_NOTIFY_TIME);
    $.msg(title, sub, body);
    return true;
}

function getQueryParam(url, key) {
    const match = (url || "").match(new RegExp("[?&]" + key + "=([^&#]*)", "i"));
    return match ? decodeURIComponent(match[1]) : "";
}

function parseQueryString(str) {
    const obj = {};
    (str || "").replace(/([^?=&]+)(=([^&]*))?/g, ($0, $1, $2, $3) => {
        obj[$1] = decodeURIComponent($3 || "");
    });
    return obj;
}

function _b64ToUtf8(b64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
    let out = "";
    let bits = 0, acc = 0;
    for (let i = 0; i < clean.length; i++) {
        const c = clean[i];
        if (c === "=") break;
        const v = chars.indexOf(c);
        if (v === -1) continue;
        acc = (acc << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out += String.fromCharCode((acc >> bits) & 0xff);
        }
    }
    return out;
}

function tryDecodeBase64Json(str) {
    if (!str || typeof str !== "string") return null;
    const t = str.trim();
    if (t.startsWith("{")) {
        try { return JSON.parse(t); } catch (e) { return null; }
    }
    try {
        return JSON.parse(_b64ToUtf8(t));
    } catch (e) {
        return null;
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
        console.log("[通知] " + t + " - " + s + ": " + b);
    };
    this.log = function (msg) { console.log(msg); };
    this.done = function () {
        if (typeof $done !== "undefined") $done({});
    };
}

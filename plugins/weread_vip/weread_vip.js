/*
------------------------------------------
@Name: 微信读书 VIP
@Version: 6.0.1
@Desc: v6.x: 不阻feconfig,全局洗更新字段,老格式会员
------------------------------------------
*/

console.log("[微信读书] v6脚本已就绪");

const URL = ($request && $request.url) || "";
let body;

try { body = JSON.parse($response.body); } catch (e) { $done({}); return; }

const now = Math.floor(Date.now() / 1000);
const exp = now + 30 * 86400;
const OLDSIG = "63e6257faa3498333df963aff22884ddfb205c5cc0d7761bc84eac4b21de4edb";

// ==========================================
// 全局: 清洗所有响应里的更新/版本提示字段
// ==========================================
function deepStrip(obj) {
    if (!obj || typeof obj !== "object") return;
    var kill = ["forceUpdate","needUpdate","mustUpdate","updateFlag","isForce","isLatest","minVersion","showUpdate","updateContent","updateURL","updateUrl","forceUpdateVersion","appVersion","recommendUpdate","updateTitle","updateDesc","newVersion","versionTip","upgradeInfo","upgradeFlag"];
    for (var i = 0; i < kill.length; i++) {
        if (obj[kill[i]] !== undefined) delete obj[kill[i]];
    }
    // 递归洗
    for (var key in obj) {
        if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            deepStrip(obj[key]);
        }
    }
}
deepStrip(body);

// ==========================================
// 特定接口: 直接拦截返回无更新
// ==========================================
if (URL.includes("updateConfig") || URL.includes("/app/update") || URL.includes("/app/version")) {
    $done({ body: JSON.stringify({ succ: 1, ret: 0, forceUpdate: false, needUpdate: false, isLatest: true }) });
    return;
}

// feconfig/getBundles 不拦截,让它正常过,只洗字段

// ==========================================
// 会员摘要 (v6老格式)
// ==========================================
if (URL.includes("memberCardSummary") || URL.includes("membercardsummary")) {
    body.ret = 0;
    body.isAutoRenewable = false;
    body.historyAutoRenewable = false;
    body.autoRenewableChannel = "";
    body.autoRenewableTime = 0;
    body.autoRenewablePrice = 1900;
    body.autoRenewableType = "none";
    body.day = 30;
    body.remainTime = 2592000;
    body.payingRemainTime = 2592000;
    body.isPaying = false;
    body.permanent = false;
    body.payingUsedDay = 0;
    body.canUseDiscount = false;
    body.expired = false;
    body.savedMoney = 2213;
    body.totalFreeReadDay = 0;
    body.remainCoupon = 0;
    body.remainCount = 0;
    body.mcardHint = "";
    body.nextAutoChargeTime = 0;
    body.startTime = now;
    body.expiredTime = exp;
    body.timestamp = now;
    body.random = 6024;
    body.signature = OLDSIG;
    body.freeBookIds = body.freeBookIds || ["25514495"];
    body.tipforpayFlag = "0|0|0";
    $done({ body: JSON.stringify(body) });
    return;
}

// ==========================================
// 余额
// ==========================================
if (URL.includes("/pay/balance")) {
    body.ret = 0;
    body.balance = 99999;
    body.giftBalance = 99999;
    body.isVip = true;
    body.day = 30;
    body.isAutoRenewable = false;
    body.historyAutoRenewable = false;
    body.autoRenewableChannel = "";
    body.autoRenewableTime = 0;
    body.autoRenewablePrice = 1900;
    body.savedMoney = 2213;
    body.totalFreeReadDay = 0;
    body.remainCoupon = 0;
    body.remainCount = 0;
    body.permanent = false;
    body.freeBookIds = body.freeBookIds || ["25514495"];
    body.signature = OLDSIG;
    body.timestamp = now;
    body.random = 6024;
    body.payingUsedDay = 0;
    body.canUseDiscount = false;
    body.mcardHint = "";
    body.isPaying = false;
    $done({ body: JSON.stringify(body) });
    return;
}

// ==========================================
// 其他接口
// ==========================================
if (URL.includes("/user/profile")) {
    body.isVip = true;
    $done({ body: JSON.stringify(body) });
    return;
}

if (URL.includes("/login")) {
    body.isVip = true;
    body.balance = 99999;
    $done({ body: JSON.stringify(body) });
    return;
}

if (URL.includes("/book/info")) {
    body.payingStatus = 0;
    body.payType = 0;
    body.centPrice = 0;
    body.realPrice = 0;
    if (body.maxFreeInfo) {
        body.maxFreeInfo.maxFreeChapterIdx = 99999;
        body.maxFreeInfo.maxFreeChapterUid = 99999;
    }
}

if (URL.includes("reader/tips")) {
    body.canFreeRead = 1;
    body.endOfTrialTitle = "";
    body.readAfterPay = 1;
    body.payingType = 0;
    body.showShareTips = 0;
    body.showLastPageShareTips = 0;
    if (body.secondaryCampaign) delete body.secondaryCampaign;
}

if (URL.includes("/book/chapterdownload")) {
    if (body.info && body.info.payType) body.info.payType = 0;
}

if (URL.includes("unipay.qq.com")) {
    body.ret = 0;
    body.token = "tk_" + Date.now().toString(36);
}

if (URL.includes("buyChapters") || URL.includes("buyBook")) {
    body.succ = true;
    body.errcode = 0;
    body.orderId = "order_" + Date.now();
}

if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) body.ret = 0;
if (URL.includes("memberCardDetails")) body.ret = 0;
if (URL.includes("careplan")) body.ret = 0;

if (URL.includes("readgift/card")) {
    body.ret = 0;
    body.remainCount = 999;
}

if (URL.includes("welfareCoin")) {
    body.coin = 999;
    body.ret = 0;
}

if (body.expiredTime && body.expiredTime < now) body.expiredTime = exp;

$done({ body: JSON.stringify(body) });

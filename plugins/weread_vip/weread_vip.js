/*
------------------------------------------
@Name: 微信读书 VIP
@Version: 6.0.0
@Desc: v6.x专用: 老字段+硬签名+屏蔽更新+解锁阅读
------------------------------------------
*/

console.log("[微信读书] v6脚本已就绪");

const URL = ($request && $request.url) || "";
let body;

try { body = JSON.parse($response.body); } catch (e) { $done({}); return; }

const now = Math.floor(Date.now() / 1000);
const exp = now + 30 * 86400;
const OLDSIG = "63e6257faa3498333df963aff22884ddfb205c5cc0d7761bc84eac4b21de4edb";

// === 屏蔽更新 ===
if (URL.includes("updateConfig") || URL.includes("/app/update") || URL.includes("/app/version") || URL.includes("feconfig/getBundles")) {
    $done({ body: JSON.stringify({ succ: 1, result: [] }) });
    return;
}

// === 屏蔽更新字段 ===
["forceUpdate","needUpdate","mustUpdate","updateFlag","isForce","isLatest","minVersion","showUpdate"].forEach(function(k){ if(body[k]!==undefined)body[k]=false; });

// === 会员摘要 (v6老格式) ===
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

// === 余额 (v6老格式) ===
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

// === 用户资料 ===
if (URL.includes("/user/profile")) {
    body.isVip = true;
    $done({ body: JSON.stringify(body) });
    return;
}

// === 登录 ===
if (URL.includes("/login")) {
    body.isVip = true;
    body.balance = 99999;
    $done({ body: JSON.stringify(body) });
    return;
}

// === 书籍信息 (改付费状态) ===
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

// === 阅读提示 (关键!设置可免费读) ===
if (URL.includes("reader/tips")) {
    body.canFreeRead = 1;
    body.endOfTrialTitle = "";
    body.readAfterPay = 1;
    body.payingType = 0;
    body.showShareTips = 0;
    body.showLastPageShareTips = 0;
    delete body.secondaryCampaign;
}

// === 章节下载 (去付费墙) ===
if (URL.includes("/book/chapterdownload")) {
    if (body.info && body.info.payType) body.info.payType = 0;
}

// === Midas支付 ===
if (URL.includes("unipay.qq.com")) {
    body.ret = 0;
    body.token = "tk_" + Date.now().toString(36);
}

// === 购买章节 ===
if (URL.includes("buyChapters") || URL.includes("buyBook")) {
    body.succ = true;
    body.errcode = 0;
    body.orderId = "order_" + Date.now();
}

// === 会员卡相关 ===
if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) {
    body.ret = 0;
}
if (URL.includes("memberCardDetails")) {
    body.ret = 0;
}
if (URL.includes("careplan")) {
    body.ret = 0;
}

// === 礼品卡 ===
if (URL.includes("readgift/card")) {
    body.ret = 0;
    body.remainCount = 999;
}

// === welfareCoin ===
if (URL.includes("welfareCoin")) {
    body.coin = 999;
    body.ret = 0;
}

if (body.expiredTime && body.expiredTime < now) body.expiredTime = exp;

$done({ body: JSON.stringify(body) });

/*
------------------------------------------
@Name: 微信读书 VIP
@Version: 4.3.0
@Desc: 只改payType，不动errcode
------------------------------------------
*/

console.log("[微信读书] VIP脚本已就绪");

const URL = ($request && $request.url) || "";
let body;

try {
    body = JSON.parse($response.body);
} catch (e) {
    $done({});
    return;
}

const now = Math.floor(Date.now() / 1000);
const expire30d = now + 30 * 86400;

function patchDisplay(body) {
    body.ret = 0;
    body.vipStatus = "active";
    body.vipType = "month";
    body.expiredTime = expire30d;
    body.remainDaysToExpire = 30;
    body.payingRemainDaysToExpire = 30;
    body.freeRemainDaysToExpire = 0;
    body.isAutoRenewYear = false;
    body.isMemberCardAutoPay = false;
    body.isPaying = false;
    body.permanent = false;
    body.day = 30;
    body.remainTime = 2592000;
    body.payingRemainTime = 2592000;
    body.isAutoRenewable = false;
    body.historyAutoRenewable = false;
    body.autoRenewableType = "none";
    body.autoRenewableChannel = "";
    body.autoRenewableTime = 0;
    body.autoRenewablePrice = 1900;
    body.canUseDiscount = false;
    body.payingUsedDay = 0;
    body.expired = false;
    body.student = false;
    body.studentRemainTime = 0;
    body.banPay = false;
    body.mcardHint = "";
    body.totalFreeReadDay = 0;
    body.remainCoupon = 0;
    body.remainCount = 0;
    body.savedMoney = 2213;
    body.totalSavedMoney = 0;
    body.nextAutoChargeTime = 0;
    body.startTime = now;
    body.giftRemainCount = 0;
    body.giftIsExpired = false;
    body.giftSendSecs = 0;
    body.shareForCardIsActive = false;
    body.shareForCardHint = "";
    body.balance = 99999;
    body.credit = 99999;
    body.coin = 99999;
    body.weishaCredit = 99999;
    body.totalBalance = 99999;
    body.isVip = true;

    if (!body.cardItems || body.cardItems.length === 0) {
        body.cardItems = [{
            cardId: "wr_vip_" + Date.now(),
            cardType: "month",
            productId: "com.tencent.weread.video.month_35",
            expiredTime: expire30d,
            remainDays: 30,
            isAutoPay: false,
            cardStatus: "active",
            cardName: "付费会员卡(月度)",
            startTime: now
        }];
    }

    body.hintsForRecharge = {
        predictedSavedMoney: 10315,
        predictedChapterPrice: 15,
        pricePerMonth: 900,
        sendCoupons: false,
        buttonTitle: "了解解锁",
        buttonSubtitle: "立即开通"
    };
}

// ==================== 章节下载 ====================

if (URL.includes("/book/chapterdownload")) {
    // 只改 payType，不动 errcode（-2223 是正常状态码）
    if (body.info && body.info.payType) {
        body.info.payType = 0;
    }
    console.log("[微信读书] chapterdownload: payType归零");
    $done({ body: JSON.stringify(body) });
    return;
}

// ==================== 会员/余额 ====================

if (URL.includes("/login")) {
    patchDisplay(body);
}

if (URL.includes("/user/profile") || URL.includes("/pay/balance") || URL.includes("/pay/present")) {
    patchDisplay(body);
}

if (URL.includes("unipay.qq.com")) {
    patchDisplay(body);
}

if (URL.includes("memberCardSummary") || URL.includes("membercardsummary")) {
    patchDisplay(body);
}

if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) {
    patchDisplay(body);
}

if (URL.includes("memberCardDetails")) {
    patchDisplay(body);
}

if (URL.includes("/pay/item")) {
    patchDisplay(body);
}

if (URL.includes("buyChapters") || URL.includes("buyBook")) {
    patchDisplay(body);
    body.succ = true;
    body.orderId = "order_" + Date.now();
}

if (URL.includes("careplan")) {
    patchDisplay(body);
}

if (URL.includes("/book/secret")) {
    patchDisplay(body);
    body.secret = body.secret || ("sec_" + Date.now());
}

if (URL.includes("/book/readinfo")) {
    patchDisplay(body);
}

if (URL.includes("welfareCoin")) {
    body.coin = 999;
    body.ret = 0;
}

if (URL.includes("updateConfig")) {
    $done({});
    return;
}

if (body.expiredTime && body.expiredTime < now) {
    body.expiredTime = expire30d;
}

$done({ body: JSON.stringify(body) });

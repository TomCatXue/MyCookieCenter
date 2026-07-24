/*
------------------------------------------
@Name: 微信读书 VIP
@Version: 5.1.0
@Desc: v10+精简版: 不改签名,只改显示+付费墙+屏蔽更新
------------------------------------------
*/

console.log("[微信读书] v10精简版已就绪");

const URL = ($request && $request.url) || "";
let body;

try { body = JSON.parse($response.body); } catch (e) { $done({}); return; }

const now = Math.floor(Date.now() / 1000);
const exp = now + 30 * 86400;

// === 屏蔽更新 ===
if (URL.includes("rdelivery.qq.com") || URL.includes("updateConfig") || URL.includes("/app/update") || URL.includes("/app/version") || URL.includes("iap/config") || URL.includes("feconfig/getBundles")) {
    $done({ body: JSON.stringify({ ret: 0, succ: 1, result: [], forceUpdate: false, needUpdate: false }) });
    return;
}

function stripUpdate(o) {
    if (!o || typeof o !== "object") return;
    ["forceUpdate","needUpdate","mustUpdate","updateFlag","isForce","isLatest","minVersion","showUpdate"].forEach(function(k){ if(o[k]!==undefined)o[k]=false; });
}
stripUpdate(body); if(body.data)stripUpdate(body.data); if(body.info)stripUpdate(body.info);

// === 会员 ===
function patch(b) {
    b.ret = 0;
    b.vipStatus = "active"; b.vipType = "month";
    b.expiredTime = exp; b.remainDaysToExpire = 30;
    b.payingRemainDaysToExpire = 30; b.freeRemainDaysToExpire = 0;
    b.isAutoRenewYear = false; b.isMemberCardAutoPay = false;
    b.isPaying = false; b.permanent = false; b.day = 30;
    b.remainTime = 2592000; b.payingRemainTime = 2592000;
    b.isAutoRenewable = false; b.historyAutoRenewable = false;
    b.autoRenewableType = "none"; b.autoRenewableChannel = "";
    b.autoRenewableTime = 0; b.autoRenewablePrice = 1900;
    b.canUseDiscount = false; b.payingUsedDay = 0; b.expired = false;
    b.student = false; b.studentRemainTime = 0; b.banPay = false;
    b.mcardHint = ""; b.totalFreeReadDay = 0; b.remainCoupon = 0; b.remainCount = 0;
    b.savedMoney = 2213; b.totalSavedMoney = 0; b.nextAutoChargeTime = 0;
    b.startTime = now;
    b.giftRemainCount = 0; b.giftIsExpired = false; b.giftSendSecs = 0;
    b.shareForCardIsActive = false; b.shareForCardHint = "";
    b.balance = 99999; b.credit = 99999; b.coin = 99999;
    b.weishaCredit = 99999; b.totalBalance = 99999; b.isVip = true;
    if (!b.cardItems || b.cardItems.length === 0) {
        b.cardItems = [{cardId:"wr_vip_"+Date.now(),cardType:"month",productId:"com.tencent.weread.video.month_35",expiredTime:exp,remainDays:30,isAutoPay:false,cardStatus:"active",cardName:"付费会员卡(月度)",startTime:now}];
    }
    b.hintsForRecharge = {predictedSavedMoney:10315,predictedChapterPrice:15,pricePerMonth:900,sendCoupons:false,buttonTitle:"了解解锁",buttonSubtitle:"立即开通"};
}

// === 付费墙 ===
if (URL.includes("/book/chapterdownload")) {
    if (body.info && body.info.payType) body.info.payType = 0;
    $done({ body: JSON.stringify(body) });
    return;
}

// === 路由 ===
if (URL.includes("/login")) patch(body);
if (URL.includes("/user/profile") || URL.includes("/pay/balance") || URL.includes("/pay/present")) patch(body);
if (URL.includes("unipay.qq.com")) patch(body);
if (URL.includes("memberCardSummary") || URL.includes("membercardsummary")) patch(body);
if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) patch(body);
if (URL.includes("memberCardDetails")) patch(body);
if (URL.includes("/pay/item")) patch(body);
if (URL.includes("buyChapters") || URL.includes("buyBook")) { patch(body); body.succ = true; body.orderId = "order_" + Date.now(); }
if (URL.includes("careplan")) patch(body);
if (URL.includes("/book/secret")) { patch(body); body.secret = body.secret || ("sec_" + Date.now()); }
if (URL.includes("/book/readinfo")) patch(body);
if (URL.includes("welfareCoin")) { body.coin = 999; body.ret = 0; }
if (body.expiredTime && body.expiredTime < now) body.expiredTime = exp;

$done({ body: JSON.stringify(body) });

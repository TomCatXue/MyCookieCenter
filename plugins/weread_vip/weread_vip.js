/*
------------------------------------------
@Name: 微信读书 VIP
@Version: 4.1.0
@Desc: 保留签名 + 改显示 + 解除付费墙
------------------------------------------
*/

console.log("[微信读书] VIP脚本已就绪");

const URL = ($request && $request.url) || "";
let body;

try {
    body = JSON.parse($response.body);
} catch (e) {
    // 非JSON响应,直接放行
    $done({});
    return;
}

const now = Math.floor(Date.now() / 1000);
const expire30d = now + 30 * 86400;

// ==================== 公共工具 ====================

function patchDisplay(body) {
    body.ret = 0;

    // 会员状态
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

    // 余额
    body.balance = 99999;
    body.credit = 99999;
    body.coin = 99999;
    body.weishaCredit = 99999;
    body.totalBalance = 99999;
    body.isVip = true;

    // cardItems
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

// ==================== 解除付费墙 ====================

function patchChapter(body) {
    // 把付费类型改成免费,app就不会弹付费墙
    if (body.payType && body.payType !== 0) {
        body.payType = 0;
        console.log("[微信读书] 章节付费墙: payType " + String(body.payType_bak || "?") + " -> 0");
    }
    // 确保errCode归零
    if (body.errcode && body.errcode !== 0) {
        body.errcode_bak = body.errcode;
        body.errcode = 0;
    }
    // 有收费信息也清掉
    if (body.payInfo) {
        body.payInfo = null;
    }
    if (body.needPay !== undefined) {
        body.needPay = false;
    }
    if (body.isPay !== undefined) {
        body.isPay = true;
    }
}

// ==================== 路由处理 ====================

// 章节下载 - 解除付费墙 (关键!)
if (URL.includes("/book/chapterdownload")) {
    patchChapter(body);
    console.log("[微信读书] chapterdownload: 已解除付费墙");
    $done({ body: JSON.stringify(body) });
    return;
}

// 书籍阅读信息
if (URL.includes("/book/readinfo")) {
    patchDisplay(body);
    patchChapter(body);
    console.log("[微信读书] readinfo: 已处理");
    $done({ body: JSON.stringify(body) });
    return;
}

// welfareCoin
if (URL.includes("welfareCoin")) {
    body.coin = 999;
    body.ret = 0;
    console.log("[微信读书] welfareCoin: 已修改");
    $done({ body: JSON.stringify(body) });
    return;
}

// 以下为会员/余额相关

if (URL.includes("/login")) {
    patchDisplay(body);
    console.log("[微信读书] 登录: 已处理");
}

if (URL.includes("/user/profile") || URL.includes("/pay/balance") || URL.includes("/pay/present")) {
    patchDisplay(body);
    console.log("[微信读书] 资料/余额: 已处理");
}

if (URL.includes("unipay.qq.com")) {
    patchDisplay(body);
    console.log("[微信读书] Midas: 已处理");
}

if (URL.includes("memberCardSummary") || URL.includes("membercardsummary")) {
    patchDisplay(body);
    console.log("[微信读书] 会员摘要: 已处理");
}

if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) {
    patchDisplay(body);
    console.log("[微信读书] 会员卡列表: 已处理");
}

if (URL.includes("memberCardDetails")) {
    patchDisplay(body);
    console.log("[微信读书] 会员卡详情: 已处理");
}

if (URL.includes("/pay/item")) {
    patchDisplay(body);
}

if (URL.includes("buyChapters") || URL.includes("buyBook")) {
    patchDisplay(body);
    body.succ = true;
    body.orderId = "order_" + Date.now();
    console.log("[微信读书] 购买: 已模拟成功");
}

if (URL.includes("careplan")) {
    patchDisplay(body);
}

if (URL.includes("/book/secret")) {
    patchDisplay(body);
    body.secret = body.secret || ("sec_" + Date.now());
}

if (URL.includes("updateConfig")) {
    $done({});
    return;
}

if (body.expiredTime && body.expiredTime < now) {
    body.expiredTime = expire30d;
}

// 不改 signature/timestamp/random，保服务器原始值
$done({ body: JSON.stringify(body) });

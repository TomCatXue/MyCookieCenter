/*
------------------------------------------
@Name: 微信读书 · 会员解锁
@Version: 3.1.0
@Desc: 兼容旧版(v5/v6) + 新版(v10)字段 + 签名模拟
------------------------------------------
*/

console.log("✅ [微信读书] 会员辅助已就绪");

const URL = ($request && $request.url) || "";
let body;

try {
    body = JSON.parse($response.body);
} catch (e) {
    $done({});
    return;
}

// ==================== 公共工具 ====================

const now = Math.floor(Date.now() / 1000);
const expire30d = now + 30 * 86400;
const expireFar = now + 3650 * 86400;
const remainSec = 30 * 86400;

// 二进制硬编码测试 OpenId
const TEST_OPENID = "onb3Mjj2BZD2JeYlcsOlf35oLaM4";

// 旧 txwxds.js 的 signature, 可能是 client-side seed
const OLDSIG = "63e6257faa3498333df963aff22884ddfb205c5cc0d7761bc84eac4b21de4edb";
const OLDRANDOM = 6024;

// ==================== 归一化字段 ====================

function normalize(body) {
    body.ret = 0;

    // --- 旧版字段 (v5.4.3 / v6.0.1) ---
    body.day = 30;
    body.isAutoRenewable = false;
    body.historyAutoRenewable = false;
    body.autoRenewableChannel = 0;
    body.autoRenewableTime = 0;
    body.autoRenewablePrice = 1900;
    body.savedMoney = 2213;
    body.totalFreeReadDay = 0;
    body.remainCoupon = 0;
    body.remainCount = 0;
    body.permanent = false;
    body.freeBookIds = body.freeBookIds || ["25514495"];
    body.signature = body.signature || OLDSIG;
    body.timestamp = body.timestamp || now;
    body.random = body.random || OLDRANDOM;
    body.payingUsedDay = 0;
    body.canUseDiscount = false;
    body.mcardHint = "";
    body.isPaying = false;

    // --- 新版字段 (v10.2.0) ---
    body.vipStatus = "active";
    body.vipType = "month";
    body.expiredTime = expire30d;
    body.remainDaysToExpire = 30;
    body.payingRemainDaysToExpire = 30;
    body.freeRemainDaysToExpire = 0;
    body.isAutoRenewYear = false;
    body.isMemberCardAutoPay = false;
    body.autoRenewableType = "none";
    body.autoRenewableChannel = "";
    body.autoRenewableTime = 0;
    body.remainTime = remainSec;
    body.payingRemainTime = remainSec;
    body.totalSavedMoney = 0;
    body.startTime = now;
    body.expired = false;
    body.giftRemainCount = 0;
    body.giftIsExpired = false;
    body.giftSendSecs = 0;
    body.shareForCardIsActive = false;
    body.shareForCardHint = "";
    body.nextAutoChargeTime = 0;
    body.student = false;
    body.studentRemainTime = 0;
    body.banPay = false;
    body.predictedSavedMoney = 10315;
    body.predictedChapterPrice = 15;
    body.pricePerMonth = 0;
    body.sendCoupons = false;
    body.buttonSubtitle = "";

    // --- 会员卡 ---
    if (!body.cardItems || body.cardItems.length === 0) {
        body.cardItems = [makeCardItem()];
    }

    // --- 旧版充值提示 ---
    if (!body.hintsForRecharge || typeof body.hintsForRecharge !== "object") {
        body.hintsForRecharge = {
            "predictedSavedMoney": 10315,
            "predictedChapterPrice": 15,
            "pricePerMonth": 900,
            "sendCoupons": false,
            "buttonTitle": "了解解锁",
            "buttonSubtitle": "立即开通"
        };
    }
}

function makeCardItem() {
    return {
        "cardId": "wr_vip_" + Date.now(),
        "cardType": "month",
        "productId": "com.tencent.weread.video.month_35",
        "expiredTime": expire30d,
        "remainDays": 30,
        "isAutoPay": false,
        "cardStatus": "active",
        "cardName": "付费会员卡(月度)",
        "startTime": now
    };
}

// ==================== 路由处理 ====================

// --- 登录 ---
if (URL.includes("/login")) {
    normalize(body);
    body.openId = TEST_OPENID;
    body.wr_openid = TEST_OPENID;
    body.testOpenId = TEST_OPENID;
    body.vid = body.vid || TEST_OPENID.replace(/onb/, "vid_");
    body.balance = 99999;
    body.credit = 99999;
    body.coin = 99999;
    body.isVip = true;
    console.log("[微信读书] 登录: 已注入测试OpenId");
}

// --- 用户资料 / 余额 ---
if (URL.includes("/user/profile") || URL.includes("/pay/balance") || URL.includes("/pay/present")) {
    normalize(body);
    body.balance = 99999;
    body.credit = 99999;
    body.coin = 99999;
    body.weishaCredit = 99999;
    body.totalBalance = 99999;
    body.isVip = true;
    console.log("[微信读书] 资料/余额: 已处理");
}

// --- Midas 支付回调 ---
if (URL.includes("unipay.qq.com")) {
    normalize(body);
    body.token = "tk_" + Date.now().toString(36);
    body.purchase_date = now.toString();
    body.is_reprovide = "0";
    body.provide_no = "0";
    body.buy_info = {
        "product_id": "com.tencent.weread.video.month_35",
        "quantity": 1,
        "purchase_date": now.toString(),
        "original_purchase_date": now.toString(),
        "transaction_id": "txn_" + Date.now(),
        "original_transaction_id": "txn_" + Date.now(),
        "web_order_line_item_id": "txn_" + Date.now()
    };
    console.log("[微信读书] Midas: 已模拟支付成功");
}

// --- 会员摘要 (完全覆盖, 兼容 txwxds.js 的替换策略) ---
if (URL.includes("memberCardSummary") || URL.includes("membercardsummary")) {
    normalize(body);
    // 额外确保所有关键字段
    body.cardItems = body.cardItems || [makeCardItem()];
    console.log("[微信读书] 会员摘要: 已完全重写");
}

// --- 会员卡列表 ---
if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) {
    normalize(body);
    body.cardItems = body.cardItems || [makeCardItem()];
    console.log("[微信读书] 会员卡列表: 已处理");
}

// --- 会员卡详情 ---
if (URL.includes("memberCardDetails")) {
    normalize(body);
    body.cardItems = body.cardItems || [makeCardItem()];
    console.log("[微信读书] 会员卡详情: 已处理");
}

// --- 商品列表 ---
if (URL.includes("/pay/item")) {
    normalize(body);
}

// --- 购买章节/书籍 ---
if (URL.includes("buyChapters") || URL.includes("buyBook")) {
    normalize(body);
    body.succ = true;
    body.orderId = "order_" + Date.now();
    console.log("[微信读书] 购买: 已模拟成功");
}

// --- 关怀计划 / 兑换 ---
if (URL.includes("careplan")) {
    normalize(body);
}

// --- 阅读密钥 ---
if (URL.includes("/book/secret")) {
    normalize(body);
    body.secret = body.secret || ("sec_" + Date.now());
}

// --- updateConfig 拦截 ---
if (URL.includes("updateConfig")) {
    $done({});
    return;
}

// --- 过期时间修正 (保险: 避免服务端返回过期数据) ---
if (body.expiredTime && body.expiredTime < now) {
    body.expiredTime = expire30d;
}

$done({ body: JSON.stringify(body) });

/*
------------------------------------------
@Name: 微信读书 · 会员解锁
@Version: 2.0.0
@Desc: 完成购买流程后自动解锁会员权益
------------------------------------------
触发时机：在微信读书中完成任意付费操作后
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
const expire365d = now + 365 * 86400;

function ensureOk(body) {
    body.ret = 0;
    if (body.result !== undefined) body.result = 0;
    if (body.retcode !== undefined) body.retcode = 0;
    if (body.ret_code !== undefined) body.ret_code = 0;
    if (body.err_code !== undefined) body.err_code = 0;
    if (body.msg) body.msg = "ok";
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
        "startTime": now,
        "isAutoRenewable": false,
        "autoRenewableChannel": "",
        "autoRenewableTime": 0,
        "historyAutoRenewable": false,
        "savedMoney": 0
    };
}

function makeCardSummary() {
    return {
        "ret": 0,
        "vipStatus": "active",
        "vipType": "month",
        "expiredTime": expire30d,
        "remainDaysToExpire": 30,
        "payingRemainDaysToExpire": 30,
        "freeRemainDaysToExpire": 0,
        "isAutoRenewYear": false,
        "isMemberCardAutoPay": false,
        "isAutoRenewable": false,
        "autoRenewableChannel": "",
        "autoRenewableTime": 0,
        "remainTime": 2592000,
        "payingRemainTime": 2592000,
        "savedMoney": 0,
        "totalSavedMoney": 0,
        "totalFreeReadDay": 0,
        "startTime": now,
        "expired": false,
        "isPaying": false,
        "permanent": false,
        "remainCoupon": 0,
        "remainCount": 0,
        "canUseDiscount": false,
        "mcardHint": "",
        "giftRemainCount": 0,
        "giftIsExpired": false,
        "giftSendSecs": 0,
        "shareForCardIsActive": false,
        "shareForCardHint": "",
        "nextAutoChargeTime": 0,
        "autoRenewableType": "none",
        "student": false,
        "studentRemainTime": 0,
        "banPay": false,
        "hintsForRecharge": "",
        "predictedSavedMoney": 0,
        "predictedChapterPrice": 0,
        "pricePerMonth": 0,
        "sendCoupons": false,
        "buttonSubtitle": "",
        "cardItems": [makeCardItem()]
    };
}

// ==================== 路由处理 ====================

// --- Midas 支付回调 (api.unipay.qq.com) ---
if (URL.includes("unipay.qq.com")) {
    ensureOk(body);
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

    body.cardItems = [makeCardItem()];
    body.memberCardSummary = makeCardSummary();

    console.log("[微信读书] Midas 回调已处理");
}

// --- 会员摘要查询 ---
if (URL.includes("memberCardSummary") || URL.includes("membercardsummary")) {
    ensureOk(body);
    Object.assign(body, makeCardSummary());
    console.log("[微信读书] 会员摘要已处理, 到期: " + new Date(expire30d * 1000).toLocaleDateString());
}

// --- 会员卡列表 ---
if (URL.includes("memberCardItems") || URL.includes("membercardexitems")) {
    ensureOk(body);
    body.cardItems = [makeCardItem()];
    if (!body.items && !body.memberCardExchangeItems) {
        body.items = body.cardItems;
    }
    console.log("[微信读书] 会员卡列表已处理");
}

// --- 会员卡详情 ---
if (URL.includes("memberCardDetails")) {
    ensureOk(body);
    body.cardItems = [makeCardItem()];
    body.vipStatus = "active";
    body.expiredTime = expire30d;
    console.log("[微信读书] 会员卡详情已处理");
}

// --- 商品列表 (item) ---
if (URL.includes("/pay/item")) {
    ensureOk(body);
    // 不改动商品列表，只确保 error 码正常
}

// --- 关怀计划 ---
if (URL.includes("careplan")) {
    ensureOk(body);
}

// --- 余额 ---
if (URL.includes("/pay/balance")) {
    ensureOk(body);
    body.balance = body.balance || 9999;
}

$done({ body: JSON.stringify(body) });

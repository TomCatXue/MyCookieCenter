/*
------------------------------------------
@Description: 微信读书 · 会员解锁 (Midas IAP 绕过)
@Author: Codex
@Version: 1.0.0
@Note: 实验性插件，基于 MidasIAPSDK v1.7.7 + WeRead 10.2.0 静态分析
        如果无效，请用 Frida hook validateMemberCardSummaryResponse: 做二次确认
------------------------------------------
原理:
  Midas IAP SDK v1.7.7 (2014) 的收据验证请求发往 api.unipay.qq.com。
  ATS 关闭 + SDK 无证书固定 → Loon 可以 MITM 并伪造成功响应。
  伪造的响应经过三层消费:
    1. Midas 原生层: 检查 ret=0 → 通过
    2. WRCardDepositor.onDistributeGoodsFinish: → 检查 cardItems 非空 → 通过
    3. WRPayManager.didSaveVIPStatusWithResponse:isValidResponse: → validateMemberCardSummaryResponse 字段校验

触发:
  在微信读书中完成任意 IAP 购买流程 (书币/会员卡/章节)，
  Loon 自动拦截 Midas 验证请求并返回伪造的成功响应。

MITM 配置 (Loon):
  [MITM]
  hostname = *.unipay.qq.com

  [Script]
  http-response ^https://api\.unipay\.qq\.com/v1/r/ script-path=weread_vip.js
  http-response ^https://sandbox\.api\.unipay\.qq\.com/v1/r/ script-path=weread_vip.js
*/

console.log("\u2705 [微信读书VIP] Midas绕过脚本已加载");

const URL = $request.url;
let body;

try {
    body = JSON.parse($response.body);
} catch (e) {
    $done({});
}

// 生产环境: api.unipay.qq.com
// 沙箱环境: sandbox.api.unipay.qq.com
const isSandbox = URL.includes("sandbox");

// ==================== 通用: 所有响应 ret 强制为 0 ====================
if (body.ret !== undefined) body.ret = 0;
if (body.result !== undefined) body.result = 0;
if (body.retcode !== undefined) body.retcode = 0;
if (body.ret_code !== undefined) body.ret_code = 0;
if (body.msg) body.msg = "ok";
if (body.err_code) body.err_code = 0;

// ==================== get_key: 获取会话密钥 ====================
if (URL.includes("get_key")) {
    body.key = body.key || ("bypass_" + Math.random().toString(36).substr(2, 16));
    body.token = body.token || ("tk_" + Date.now().toString(36));
    console.log("[VIP] get_key forged");
}

// ==================== mobile_save_goods / buy_goods : 收据验证核心 ====================
if (URL.includes("save_goods") || URL.includes("buy_goods") || URL.includes("provide")) {

    const now = Math.floor(Date.now() / 1000);
    const expireTime = now + 30 * 86400; // 30天后

    // --- Midas SDK 原生层所需字段 ---
    body.ret = 0;
    body.msg = "ok";
    body.token = "midas_vip_" + Date.now().toString(36);
    body.purchase_date = now.toString();
    body.is_reprovide = "0";
    body.provide_no = "0";

    // --- buy_info: WRPayManager.handleProvideSuccessWithProductIds: 所需 ---
    body.buy_info = {
        "product_id": body.product_id || "com.tencent.weread.video.month_35",
        "quantity": 1,
        "purchase_date": now.toString(),
        "original_purchase_date": now.toString(),
        "transaction_id": "vip_" + Date.now(),
        "original_transaction_id": "vip_" + Date.now(),
        "web_order_line_item_id": "vip_" + Date.now()
    };

    // --- cardItems: WRCardDepositor.onDistributeGoodsFinish: 所需 ---
    // 必须非空且结构合法，否则 "cannot filter out boughtCardItems from local cardItems"
    body.cardItems = [{
        "cardId": "card_vip_" + Date.now(),
        "cardType": "month",
        "productId": "com.tencent.weread.video.month_35",
        "expiredTime": expireTime,
        "remainDays": 30,
        "isAutoPay": false,
        "cardStatus": "active",
        "cardName": "\u4ed8\u8d39\u4f1a\u5458\u5361(\u6708\u5ea6)"  // 付费会员卡(月度)
    }];

    // --- memberCardSummary: validateMemberCardSummaryResponse: 所需 ---
    // 这是最可能被拒绝的地方, 字段必须类型正确且逻辑一致
    body.memberCardSummary = {
        "vipStatus": "active",
        "vipType": "month",
        "expiredTime": expireTime,
        "remainDaysToExpire": 30,
        "payingRemainDaysToExpire": 30,
        "freeRemainDaysToExpire": 0,
        "isAutoRenewYear": false,
        "isMemberCardAutoPay": false,
        "cardItems": body.cardItems
    };

    console.log(`[VIP] save_goods forged: expire=${new Date(expireTime * 1000).toISOString()}`);
}

// ==================== memberCardSummary 查询接口 ====================
if (URL.includes("memberCardSummary") || URL.includes("cardSummary")) {
    const expireTime = Math.floor(Date.now() / 1000) + 30 * 86400;

    body.vipStatus = "active";
    body.vipType = "month";
    body.expiredTime = expireTime;
    body.remainDaysToExpire = 30;
    body.payingRemainDaysToExpire = 30;
    body.freeRemainDaysToExpire = 0;
    body.isMemberCardAutoPay = false;
    body.isAutoRenewYear = false;

    // 确保有 cardItems, 否则 WRCardDepositor 报错 "card items is empty"
    if (!body.cardItems || body.cardItems.length === 0) {
        body.cardItems = [{
            "cardId": "card_query_" + Date.now(),
            "cardType": "month",
            "productId": "com.tencent.weread.video.month_35",
            "expiredTime": expireTime,
            "remainDays": 30,
            "isAutoPay": false,
            "cardStatus": "active"
        }];
    }

    console.log("[VIP] cardSummary forged as active member");
}

// ==================== memberCardItems / item 查询接口 ====================
if (URL.includes("memberCardItems") || (URL.includes("item") && !URL.includes("get_key"))) {
    const expireTime = Math.floor(Date.now() / 1000) + 30 * 86400;

    if (!body.cardItems || body.cardItems.length === 0) {
        body.cardItems = [{
            "cardId": "card_items_" + Date.now(),
            "cardType": "month",
            "productId": "com.tencent.weread.video.month_35",
            "expiredTime": expireTime,
            "remainDays": 30,
            "isAutoPay": false,
            "cardStatus": "active"
        }];
    }

    // memberCardExchange 接口的 items 格式
    if (!body.items && !body.memberCardExchangeItems) {
        body.items = body.cardItems;
    }
}

$done({ body: JSON.stringify(body) });

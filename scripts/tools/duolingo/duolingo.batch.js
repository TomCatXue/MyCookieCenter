// 多邻国 Duolingo /batch 聚合响应解锁
// 拦截 <date>/batch 请求，向 users 子响应注入伪造的 Premium(Super) 订阅。
// 真机抓包核对：字段与值对齐 7.148.1 现网（tier/type/renewer/productId/timerBoostConfig）
if (typeof $response === "undefined" || !$response.body) {
  $done({});
} else {
  try {
    var response = JSON.parse($response.body);
    if (!response || !response.responses || !response.responses[0]) {
      $done({});
    } else {
      var innerBody = JSON.parse(response.responses[0].body);
      if (!innerBody) {
        $done({});
      } else {
        if (!innerBody.shopItems) {
          innerBody.shopItems = [];
        }
        if (!innerBody.subscriptionConfigs) {
          innerBody.subscriptionConfigs = [];
        }
        if (!innerBody.trackingProperties) {
          innerBody.trackingProperties = {};
        }
        if (!innerBody.timerBoostConfig) {
          innerBody.timerBoostConfig = {};
        }

        var now = Math.floor(Date.now() / 1000);
        var expire = now + 10 * 365 * 24 * 3600;
        var uid = innerBody.id || 0;
        var productId = "com.duolingo.DuolingoMobile.subscription.Premium.TwelveMonth.26Q2RtrExtFTFam30D.Trial30.120";

        var shopMaxSub = {
          "purchaseId": "duo-premium-injected",
          "purchaseDate": now,
          "purchasePrice": 0,
          "purchasedByUserId": uid,
          "quantity": 1,
          "expectedExpirationDate": expire,
          "id": "premium_subscription",
          "xpBoostMultiplier": 1.0,
          "subscriptionInfo": {
            "currency": "USD",
            "expectedExpiration": expire,
            "firstPaymentDate": now,
            "isFreeTrialPeriod": true,
            "isInBillingRetryPeriod": false,
            "periodLength": 12,
            "price": 0,
            "productId": productId,
            "promotionalOfferId": "",
            "renewer": "VENDOR_APP_STORE",
            "renewing": true,
            "renewingIsFamilyPlan": false,
            "renewingProductId": null,
            "renewingType": "premium",
            "tier": "twelve_month",
            "type": "premium"
          }
        };

        var configMaxSub = {
          "vendorPurchaseId": "123456789012345",
          "isInBillingRetry": false,
          "subscriptionType": "premium",
          "productId": productId,
          "expirationDate": expire
        };

        innerBody.shopItems.push(shopMaxSub);
        innerBody.subscriptionConfigs.push(configMaxSub);
        innerBody.subscriberLevel = "SUPER";
        innerBody.trackingProperties.has_item_premium_subscription = true;
        innerBody.trackingProperties.has_item_gold_subscription = true;
        innerBody.timerBoostConfig.timerBoosts = 8;
        innerBody.timerBoostConfig.hasPurchasedTimerBoost = true;

        response.responses[0].body = JSON.stringify(innerBody);
        $done({ body: JSON.stringify(response) });
      }
    }
  } catch (e) {
    $done({});
  }
}

// 多邻国 Duolingo /batch 聚合响应解锁
// 拦截 <date>/batch 请求，向 users 子响应注入伪造的家庭订阅。
// 真机实测：subscriberLevel 用 "GOLD" 才能触发完整解锁（SUPER/PREMIUM 仅改 UI），
// 故保留原作 GOLD 体系，并补齐家庭计划字段与 EXPLAIN_MY_ANSWER 新功能。
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
        var productId = "com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.25Q2WB7D.Trial7.240";

        var shopMaxSub = {
          "purchaseId": "123xxx321yyy1234567890",
          "purchaseDate": now,
          "purchasePrice": 249,
          "purchasedByUserId": uid,
          "quantity": 1,
          "expectedExpirationDate": expire,
          "id": "gold_subscription",
          "itemName": "gold_subscription",
          "xpBoostMultiplier": 1.0,
          "familyPlanInfo": {
            "ownerId": uid,
            "secondaryMembers": [],
            "inviteToken": "",
            "pendingInvites": [],
            "pendingInviteSuggestions": []
          },
          "subscriptionInfo": {
            "currency": "USD",
            "expectedExpiration": expire,
            "firstPaymentDate": now,
            "isFreeTrialPeriod": true,
            "isIntroOfferPeriod": false,
            "isInBillingRetryPeriod": false,
            "periodLength": 12,
            "price": 99999,
            "productId": productId,
            "promotionalOfferId": "",
            "renewer": "APPLE",
            "renewing": true,
            "renewingIsFamilyPlan": true,
            "renewingProductId": null,
            "renewingType": "gold",
            "tier": "twelve_month",
            "type": "gold",
            "vendorPurchaseId": "123456789012345"
          }
        };

        var configMaxSub = {
          "vendorPurchaseId": "123456789012345",
          "isInBillingRetryPeriod": false,
          "isInGracePeriod": false,
          "pauseStart": now,
          "pauseEnd": null,
          "productId": productId,
          "receiptSource": 1,
          "expirationTimestamp": expire * 1000,
          "isFreeTrialPeriod": true,
          "itemType": "gold_subscription"
        };

        innerBody.shopItems.push(shopMaxSub);
        innerBody.subscriptionConfigs.push(configMaxSub);
        innerBody.subscriberLevel = "GOLD";
        innerBody.trackingProperties.has_item_gold_subscription = true;
        innerBody.trackingProperties.has_item_premium_subscription = true;
        innerBody.trackingProperties.monetizable_status = "free_trial_owner_max";
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

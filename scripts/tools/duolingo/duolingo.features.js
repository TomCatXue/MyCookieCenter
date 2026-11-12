// 多邻国 Duolingo 订阅功能列表
// 真机抓包核对：available-features 返回 subscriptionFeatures + purchasableFeatures，
// 付费 Premium 功能清单取自 subscription-catalog 现网 advertisableFeatures
var features = [
  "NO_NETWORK_ADS",
  "UNLIMITED_HEARTS",
  "LEGENDARY_LEVEL",
  "MISTAKES_INBOX",
  "MASTERY_QUIZ",
  "NO_SUPER_PROMOS",
  "LICENSED_SONGS",
  "CHAT_TUTORS",
  "EXPLAIN_MY_ANSWER",
  "VIDEO_CALL_IN_PATH",
  "VIDEO_CALL_IN_PRACTICE_HUB",
  "CAN_ADD_SECONDARY_MEMBERS"
];

let obj = {
  "subscriptionFeatures": features,
  "advertisableFeatures": features,
  "purchasableFeatures": [
    "CAN_PURCHASE_IAP",
    "CAN_PURCHASE_SUBSCRIPTION",
    "CAN_PURCHASE_APPLE_GIFT_SUBSCRIPTION",
    "CAN_PURCHASE_LITE"
  ]
};

$done({ body: JSON.stringify(obj), status: 200 });

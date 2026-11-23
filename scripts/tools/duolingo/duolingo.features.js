/**
 * 多邻国 Duolingo 功能清单注入（Loon 响应脚本）
 *
 * 拦截 /available-features 与 /advertisable-features，补全 subscriptionFeatures
 * 与 purchasableFeatures。付费功能清单取自现网 subscription-catalog 的
 * advertisableFeatures，真机核对过。
 *
 * 与 v2.0.3 的区别：保留服务端返回的其它字段，只补齐缺失的功能项，
 * 不再整个 body 覆盖。
 */

const SCRIPT_VERSION = '2.1.1';

/** 付费（订阅）功能清单 */
const FEATURES = [
  'NO_NETWORK_ADS',
  'UNLIMITED_HEARTS',
  'LEGENDARY_LEVEL',
  'MISTAKES_INBOX',
  'MASTERY_QUIZ',
  'NO_SUPER_PROMOS',
  'LICENSED_SONGS',
  'CHAT_TUTORS',
  'EXPLAIN_MY_ANSWER',
  'VIDEO_CALL_IN_PATH',
  'VIDEO_CALL_IN_PRACTICE_HUB',
  'CAN_ADD_SECONDARY_MEMBERS',
];

/** 内购能力清单 */
const PURCHASABLE = [
  'CAN_PURCHASE_IAP',
  'CAN_PURCHASE_SUBSCRIPTION',
  'CAN_PURCHASE_APPLE_GIFT_SUBSCRIPTION',
  'CAN_PURCHASE_LITE',
];

/** 把 items 合并进 target，返回是否有新增 */
function mergeInto(target, items) {
  if (!Array.isArray(target)) return { list: items.slice(), changed: true };
  let changed = false;
  items.forEach((item) => {
    if (target.indexOf(item) === -1) {
      target.push(item);
      changed = true;
    }
  });
  return { list: target, changed };
}

try {
  if (typeof $response === 'undefined' || !$response || !$response.body) {
    $done({});
  } else {
    let payload;
    try {
      payload = JSON.parse($response.body);
    } catch (error) {
      payload = null;
    }

    if (payload === null) {
      // 解析失败：原样放行，不用假功能表覆盖服务端响应
      $done({});
    } else if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      let changed = false;

      const subscription = mergeInto(payload.subscriptionFeatures, FEATURES);
      if (subscription.changed) {
        payload.subscriptionFeatures = subscription.list;
        changed = true;
      }

      const advertisable = mergeInto(payload.advertisableFeatures, FEATURES);
      if (advertisable.changed) {
        payload.advertisableFeatures = advertisable.list;
        changed = true;
      }

      const purchasable = mergeInto(payload.purchasableFeatures, PURCHASABLE);
      if (purchasable.changed) {
        payload.purchasableFeatures = purchasable.list;
        changed = true;
      }

      if (changed) {
        $done({ body: JSON.stringify(payload) });
      } else {
        $done({});
      }
    } else {
      // 合法 JSON 但不是对象（数组 / 字面量），退回完整功能表
      $done({
        body: JSON.stringify({
          subscriptionFeatures: FEATURES,
          advertisableFeatures: FEATURES,
          purchasableFeatures: PURCHASABLE,
        }),
      });
    }
  }
} catch (error) {
  $done({});
}

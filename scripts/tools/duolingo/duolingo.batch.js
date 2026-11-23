/**
 * 多邻国 Duolingo 订阅解锁（Loon 响应脚本）
 *
 * 作用范围（一条规则，两种响应形状）
 *   1. /<date>/batch 聚合响应：逐个识别 responses[] 里的用户对象再注入
 *   2. /users/<id> 单用户响应：
 *      - 完整用户对象 → 注入 Gold 订阅
 *      - 轻量响应（只有 subscriberLevel 等少数字段）→ 只改等级，不塞订阅结构
 *
 * 设计要点
 *   1. 幂等：shopItems 里已有 gold_subscription 就跳过，避免同一会话多次请求
 *      把 Gold 堆成一长串。
 *   2. 缓存：子响应 status 为 304、或 etag 命中且无 body 时原样放行。
 *   3. 遍历：不假设用户对象在 responses[0]，逐条按特征识别。
 *   4. 认不出形状就原样放行，绝不用假对象覆盖服务端响应。
 *   5. 无任何开关，装上即生效。
 *
 * 真机实测：subscriberLevel 必须是 "GOLD"，SUPER / PREMIUM 只改 UI 不解锁。
 */

const SCRIPT_VERSION = '3.0.0';

/** Gold 年订阅商品号（真机实测可用） */
const PRODUCT_ID = 'com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.25Q2WB7D.Trial7.240';
/** 订阅有效期：10 年 */
const EXPIRY_SECONDS = 10 * 365 * 24 * 3600;
/** 已存在这些 id 的 shopItem 视为已订阅，不重复注入 */
const SUBSCRIPTION_ITEM_IDS = ['gold_subscription'];

// ---------------------------------------------------------------------------
// 订阅注入
// ---------------------------------------------------------------------------

function buildShopItem(now, userId) {
  return {
    purchaseId: '123xxx321yyy1234567890',
    purchaseDate: now,
    purchasePrice: 249,
    purchasedByUserId: userId,
    quantity: 1,
    expectedExpirationDate: now + EXPIRY_SECONDS,
    id: 'gold_subscription',
    itemName: 'gold_subscription',
    xpBoostMultiplier: 1.0,
    familyPlanInfo: {
      ownerId: userId,
      secondaryMembers: [],
      inviteToken: '',
      pendingInvites: [],
      pendingInviteSuggestions: [],
    },
    subscriptionInfo: {
      currency: 'USD',
      expectedExpiration: now + EXPIRY_SECONDS,
      firstPaymentDate: now,
      isFreeTrialPeriod: true,
      isIntroOfferPeriod: false,
      isInBillingRetryPeriod: false,
      periodLength: 12,
      price: 99999,
      productId: PRODUCT_ID,
      promotionalOfferId: '',
      renewer: 'APPLE',
      renewing: true,
      renewingIsFamilyPlan: true,
      renewingProductId: null,
      renewingType: 'gold',
      tier: 'twelve_month',
      type: 'gold',
      vendorPurchaseId: '123456789012345',
    },
  };
}

function buildSubscriptionConfig(now) {
  return {
    vendorPurchaseId: '123456789012345',
    isInBillingRetryPeriod: false,
    isInGracePeriod: false,
    pauseStart: now,
    pauseEnd: null,
    productId: PRODUCT_ID,
    receiptSource: 1,
    expirationTimestamp: (now + EXPIRY_SECONDS) * 1000,
    isFreeTrialPeriod: true,
    itemType: 'gold_subscription',
  };
}

function applySubscription(user, now) {
  let changed = false;

  if (!Array.isArray(user.shopItems)) {
    user.shopItems = [];
    changed = true;
  }

  const hasSubscription = user.shopItems.some(
    (item) => item && SUBSCRIPTION_ITEM_IDS.indexOf(item.id) !== -1,
  );
  if (!hasSubscription) {
    user.shopItems.push(buildShopItem(now, user.id || 0));
    changed = true;
  }

  if (!Array.isArray(user.subscriptionConfigs)) {
    user.subscriptionConfigs = [];
  }
  const hasConfig = user.subscriptionConfigs.some(
    (config) => config && config.itemType === 'gold_subscription',
  );
  if (!hasConfig) {
    user.subscriptionConfigs.push(buildSubscriptionConfig(now));
    changed = true;
  }

  if (!user.trackingProperties || typeof user.trackingProperties !== 'object') {
    user.trackingProperties = {};
  }
  [
    'has_item_gold_subscription',
    'has_item_premium_subscription',
    'has_item_immersive_subscription',
    'has_item_live_subscription',
    'has_item_max_subscription',
  ].forEach((key) => {
    if (user.trackingProperties[key] !== true) {
      user.trackingProperties[key] = true;
      changed = true;
    }
  });
  if (user.trackingProperties.monetizable_status !== 'free_trial_owner_max') {
    user.trackingProperties.monetizable_status = 'free_trial_owner_max';
    changed = true;
  }

  if (user.subscriberLevel !== 'GOLD') {
    user.subscriberLevel = 'GOLD';
    changed = true;
  }

  // 限时加速：8 次
  if (!user.timerBoostConfig || typeof user.timerBoostConfig !== 'object') {
    user.timerBoostConfig = {};
  }
  if (user.timerBoostConfig.timerBoosts !== 8) {
    user.timerBoostConfig.timerBoosts = 8;
    changed = true;
  }
  if (user.timerBoostConfig.hasPurchasedTimerBoost !== true) {
    user.timerBoostConfig.hasPurchasedTimerBoost = true;
    changed = true;
  }

  return changed;
}

// ---------------------------------------------------------------------------
// 形状识别与主流程
// ---------------------------------------------------------------------------

/**
 * 完整用户对象：有订阅结构才算，光有 subscriberLevel 不算。
 * 返回 true 才走全量注入。
 */
function isFullUser(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Array.isArray(value.shopItems)) return true;
  if (value.trackingProperties && typeof value.trackingProperties === 'object') return true;
  return false;
}

/**
 * 轻量用户对象：只有 subscriberLevel 之类的标量字段。
 * 这种响应只改等级，不塞 shopItems —— 塞进去就是畸形半成品。
 */
function isLightUser(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.subscriberLevel === undefined) return false;
  return !isFullUser(value);
}

function patchUser(user, now) {
  if (isLightUser(user)) {
    if (user.subscriberLevel === 'GOLD') return false;
    user.subscriberLevel = 'GOLD';
    return true;
  }
  return applySubscription(user, now);
}

/** 子响应是否应该跳过（缓存命中 / 空 body） */
function shouldSkipEntry(entry) {
  if (!entry || typeof entry !== 'object') return true;
  if (entry.status === 304) return true;
  const body = entry.body;
  if (body === null || body === undefined || body === '') return true;
  return false;
}

/**
 * 修补 batch 聚合响应或单用户响应。
 * 返回 true 表示内容有改动，需要回写 body。
 */
function patchPayload(payload, now) {
  if (!payload || typeof payload !== 'object') return false;

  if (Array.isArray(payload.responses)) {
    let changed = false;
    payload.responses.forEach((entry) => {
      if (shouldSkipEntry(entry)) return;

      let inner = entry.body;
      const wasString = typeof inner === 'string';
      if (wasString) {
        try {
          inner = JSON.parse(inner);
        } catch (error) {
          return;
        }
      }
      if (!isFullUser(inner) && !isLightUser(inner)) return;

      if (patchUser(inner, now)) {
        entry.body = wasString ? JSON.stringify(inner) : inner;
        changed = true;
      }
    });
    return changed;
  }

  if (!isFullUser(payload) && !isLightUser(payload)) return false;
  return patchUser(payload, now);
}

try {
  if (typeof $response === 'undefined' || !$response || !$response.body) {
    $done({});
  } else {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.parse($response.body);
    if (patchPayload(payload, now)) {
      $done({ body: JSON.stringify(payload) });
    } else {
      $done({});
    }
  }
} catch (error) {
  // 任何异常都原样放行，宁可不解锁也不要让 App 白屏
  $done({});
}

/**
 * 多邻国 Duolingo 订阅注入与玩法增强（Loon 响应脚本）
 *
 * 作用范围（一条规则，两种响应形状）
 *   1. /<date>/batch 聚合响应：逐个识别 responses[] 里的用户对象再注入
 *   2. /users/<id> 单用户响应：
 *      - 完整用户对象 → 注入订阅 + 玩法
 *      - 轻量响应（只有 subscriberLevel 等少数字段）→ 只改等级，不塞订阅结构
 *
 * 设计要点
 *   1. 幂等：shopItems 里已有 gold_subscription 就跳过，避免同一会话多次请求
 *      把 Gold 堆成一长串。
 *   2. 缓存：子响应 status 为 304、或 etag 命中且无 body 时原样放行。
 *   3. 遍历：不假设用户对象在 responses[0]，逐条按特征识别。
 *   4. 玩法：经验加倍、解锁全部关卡、Max 权益标记，全部由插件开关控制，
 *      默认全关，开箱即用与 v2.0.3 行为一致。
 *   5. 认不出形状就原样放行，绝不用假对象覆盖服务端响应。
 *
 * 真机实测：subscriberLevel 必须是 "GOLD"，SUPER / PREMIUM 只改 UI 不解锁。
 */

const SCRIPT_VERSION = '2.1.1';

/** Gold 年订阅商品号（真机实测可用） */
const PRODUCT_ID = 'com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.25Q2WB7D.Trial7.240';
/** 订阅有效期：10 年 */
const EXPIRY_SECONDS = 10 * 365 * 24 * 3600;
/** 已存在这些 id 的 shopItem 视为已订阅，不重复注入 */
const SUBSCRIPTION_ITEM_IDS = ['gold_subscription'];
const XP_BOOST_ITEM_ID = 'xp_boost_stackable';

// ---------------------------------------------------------------------------
// 参数
// ---------------------------------------------------------------------------

function readArgs() {
  const raw = typeof $argument !== 'undefined' ? $argument : null;
  if (!raw) return {};
  // 插件里写成 {${a}, ${b}} 时拿到对象；写成字符串时按 a=1&b=2 解析
  if (typeof raw === 'object') return raw;
  const out = {};
  String(raw)
    .split('&')
    .forEach((pair) => {
      if (!pair) return;
      const index = pair.indexOf('=');
      if (index === -1) return;
      out[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
    });
  return out;
}

function isOn(value) {
  if (value === true || value === 1) return true;
  const text = String(value === null || value === undefined ? '' : value)
    .trim()
    .toLowerCase();
  return text === 'true' || text === '1' || text === 'on' || text === 'yes';
}

function toInt(value, fallback) {
  const parsed = parseInt(String(value === null || value === undefined ? '' : value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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

function applySubscription(user, now, args) {
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
  if (user.trackingProperties.has_item_gold_subscription !== true) {
    user.trackingProperties.has_item_gold_subscription = true;
    changed = true;
  }
  if (user.trackingProperties.has_item_premium_subscription !== true) {
    user.trackingProperties.has_item_premium_subscription = true;
    changed = true;
  }
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

  // Max 权益标记：让客户端进入 Max 分支（视频通话等）。默认关闭，
  // 因为这些能力仍需服务端放行，标记打开后失败是「点了报错」而非静默降级。
  if (isOn(args.max_flags)) {
    ['has_item_immersive_subscription', 'has_item_live_subscription', 'has_item_max_subscription'].forEach(
      (key) => {
        if (user.trackingProperties[key] !== true) {
          user.trackingProperties[key] = true;
          changed = true;
        }
      },
    );
  }

  return changed;
}

// ---------------------------------------------------------------------------
// 玩法：经验加倍 / 解锁全部关卡
// ---------------------------------------------------------------------------

function applyXpBoost(user, now, args) {
  if (!isOn(args.xp_boost)) return false;
  const multiplier = Math.max(1, toInt(args.multiplier, 2));
  if (!Array.isArray(user.shopItems)) user.shopItems = [];

  // 字段与上游实测可用的实现保持一致，不额外塞客户端可能不认识的键
  const existing = user.shopItems.find((item) => item && item.id === XP_BOOST_ITEM_ID);
  if (existing) {
    existing.purchaseDate = now;
    existing.expectedExpirationDate = now + 3600;
    existing.xpBoostMultiplier = multiplier;
    return true;
  }

  user.shopItems.push({
    id: XP_BOOST_ITEM_ID,
    purchaseDate: now,
    expectedExpirationDate: now + 3600,
    purchasePrice: 0,
    xpBoostMultiplier: multiplier,
  });
  return true;
}

function applyUnlockAll(user, args) {
  if (!isOn(args.unlock_all)) return false;
  const course = user.currentCourse;
  if (!course || !Array.isArray(course.pathSectioned)) return false;

  let changed = false;
  course.pathSectioned.forEach((section) => {
    if (!section || !Array.isArray(section.units)) return;
    section.units.forEach((unit) => {
      if (!unit || !Array.isArray(unit.levels)) return;
      unit.levels.forEach((level) => {
        if (level && level.state === 'locked') {
          level.state = 'active';
          changed = true;
        }
      });
    });
  });
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

function patchUser(user, now, args) {
  if (isLightUser(user)) {
    if (user.subscriberLevel === 'GOLD') return false;
    user.subscriberLevel = 'GOLD';
    return true;
  }

  let changed = false;
  if (applySubscription(user, now, args)) changed = true;
  if (applyXpBoost(user, now, args)) changed = true;
  if (applyUnlockAll(user, args)) changed = true;
  return changed;
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
function patchPayload(payload, now, args) {
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

      if (patchUser(inner, now, args)) {
        entry.body = wasString ? JSON.stringify(inner) : inner;
        changed = true;
      }
    });
    return changed;
  }

  if (!isFullUser(payload) && !isLightUser(payload)) return false;
  return patchUser(payload, now, args);
}

try {
  if (typeof $response === 'undefined' || !$response || !$response.body) {
    $done({});
  } else {
    const now = Math.floor(Date.now() / 1000);
    const args = readArgs();
    const payload = JSON.parse($response.body);
    if (patchPayload(payload, now, args)) {
      $done({ body: JSON.stringify(payload) });
    } else {
      $done({});
    }
  }
} catch (error) {
  // 任何异常都原样放行，宁可不解锁也不要让 App 白屏
  $done({});
}

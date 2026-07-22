/**
 * Adapty 合集解锁 (Loon 兼容版 · 去混淆重写)
 *
 * 原脚本: chxm1023/Rewrite/adapty.js (jsjiami.com.v5 混淆)
 *
 * 为什么原脚本在 Loon 中"显示任务成功但解锁不了":
 *   1. 首行检查 typeof $rocket !== 'undefined' → Loon 无 $rocket → 整段主逻辑被跳过
 *   2. BoxJS adapty_switch 不存在时默认关闭 → $done() 直接退出不修改
 *   3. 末尾 window 引用在 Loon 非浏览器环境抛 ReferenceError
 *
 * 本重写版: 去混淆 + 仅用 Loon 原生 API + 保留全部 15 个 App 解锁逻辑
 *
 * @Original: chxm1023 <https://github.com/chxm1023/Rewrite>
 * @Rewritten: MyCookieCenter <https://github.com/TomCatXue/MyCookieCenter>
 * @Updated: 2026-07-22
 *
 * ===== Loon =====
 * [MITM] hostname = api.adapty.io
 * [Script]
 * http-response ^https?:\/\/api\.adapty\.io\/api\/v\d\/sdk\/(analytics\/profiles|in-apps\/(apple\/receipt\/validate|purchase-containers)|purchase\/app-store) script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/adapty/adapty.js, requires-body=true, tag=Adapty 合集解锁, enable=true
 */

// ─── 解析原始响应 ───────────────────────────────────────────────────────
let ddm = JSON.parse($response.body);
const headers = $request?.headers || {};
const ua = headers['User-Agent'] || headers['user-agent'] || "";
const profileid = headers['adapty-sdk-profile-id'] ||
    headers['ADAPTY-SDK-PROFILE-ID'] || "";
const time = Date.now();

// ─── App 匹配表 ────────────────────────────────────────────────────────
// dy='dypda' 单一订阅; dy='dypdba' 双订阅(含备用 ids)
// prettier-ignore
const appList = {
    'Yomu': { dy: 'dypda', id: "lifetime.yomu.app", bundle_id: "yomu.app" },
    'Logo Maker': { dy: 'dypda', id: "com.limepresso.lm.paid.subscription.pro_yearly_high", bundle_id: "com.limepresso.logomaker" },
    'Luminar': { dy: 'dypda', id: "com.skylum.luminaripad.lifetime", bundle_id: "com.skylum.luminaripad" },
    'Genie': { dy: 'dypda', id: "yearly_advanced_pro", bundle_id: "co.appnation.geniechat" },
    'Flight Tracker': { dy: 'dypda', id: "com.iaftt.flightplusfree.49.99year", bundle_id: "com.iaftt.flightplusfree" },
    'AvA': { dy: 'dypda', id: "momo_yearly_subs_pro", bundle_id: "com.scaleup.dreame" },
    'PlantApp': { dy: 'dypda', id: "plantapp.lifetime.promoted.sub", bundle_id: "com.scaleup.plantid" },
    'KeyboardGPT': { dy: 'dypda', id: "smart.keyboard.yearly.01", bundle_id: "com.smart.keyboard" },
    'SketchAR': { dy: 'dypda', id: "tech.sketchar.subscription.yearly", bundle_id: "tech.sketchar.ios" },
    'universal': { dy: 'dypda', id: "remotetv.yearly.01", bundle_id: "com.universal.remotetv" },
    'Lingvist': { dy: 'dypda', id: "com.lingvist.unlimited_12_months.v11.full_1md_ft", bundle_id: "ee.keel24.Lingvist" },
    'ChatAI': { dy: 'dypda', id: "chatai_yearly_ios", bundle_id: "com.scaleup.chatai" },
    'FacePlus': { dy: 'dypda', id: "faceplus_yearly_subs_3dft_ios", bundle_id: "com.scaleup.faceplus" },
    'Batched': { dy: 'dypdba', id: "com.advasoft.batched.premium_year", bundle_id: "com.advasoft.batched" }
};

// ─── 会员 & 收据模板 ────────────────────────────────────────────────────
const premium = {
    'id': 'premium', 'is_lifetime': true, 'store': 'app_store',
    'starts_at': '2024-01-23T09:09:09.000000+0000',
    'expires_at': '2099-01-23T09:09:09.000000+0000',
    'will_renew': true, 'is_active': true, 'is_in_grace_period': false,
    'activated_at': '2024-01-23T09:09:09.000000+0000',
    'renewed_at': '2024-01-23T09:09:09.000000+0000',
    'is_refund': false,
    'vendor_transaction_id': '490001271881589',
    'vendor_original_transaction_id': '490001271881589',
    'is_sandbox': false,
    'active_introductory_offer_type': 'free_trial'
};

const receiptTpl = {
    'quantity': '1', 'purchase_date_ms': '1706000949000',
    'expires_date': '2099-01-23T09:09:09.000000+0000',
    'is_in_intro_offer_period': 'true',
    'transaction_id': '490001271881589',
    'is_trial_period': 'true',
    'original_transaction_id': '490001271881589',
    'purchase_date': '2024-01-23T09:09:09.000000+0000',
    'in_app_ownership_type': 'PURCHASED',
    'original_purchase_date_ms': '1706000949000',
    'expires_date_ms': '4070884149000'
};

// ─── 辅助函数 ───────────────────────────────────────────────────────────
function makePaidAccess(vendorId) {
    return { 'premium': Object.assign({}, premium, { 'vendor_product_id': vendorId }) };
}

// ─── UA 匹配 & 响应注入 ─────────────────────────────────────────────────
let matched = false;

for (const key in appList) {
    const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp('^' + escKey, 'i').test(ua)) continue;

    const cfg = appList[key];
    const subs = {};
    const rcpts = [];

    subs[cfg.id] = Object.assign({}, premium, { 'vendor_product_id': cfg.id });
    rcpts.push(Object.assign({}, receiptTpl, { 'product_id': cfg.id }));

    if (cfg.dy === 'dypdba' && cfg.ids) {
        subs[cfg.ids] = Object.assign({}, premium, { 'vendor_product_id': cfg.ids });
        rcpts.push(Object.assign({}, receiptTpl, { 'product_id': cfg.ids }));
    }

    const paidAccess = makePaidAccess(cfg.id);

    // profiles / purchase/app-store 端点
    if (/(analytics\/profiles|purchase\/app-store)/.test($request.url)) {
        ddm = {
            'data': {
                'type': 'adapty_analytics_profile', 'id': profileid,
                'attributes': {
                    'profile_id': profileid, 'is_test_user': false,
                    'segment_hash': 'none', 'timestamp': time,
                    'apple_validation_result': {
                        'environment': 'Production', 'revision': '1', 'appAppleId': 1560800462,
                        'transactions': [{
                            'productId': cfg.id, 'storefront': 'CHN',
                            'originalTransactionId': '490001271881589',
                            'expiresDate': '2099-01-23T09:09:09.000000+0000',
                            'subscriptionGroupIdentifier': 'premium',
                            'purchaseDate': '2024-01-23T09:09:09.000000+0000',
                            'price': 0, 'transactionId': '490001271881589',
                            'currency': 'CNY', 'inAppOwnershipType': 'PURCHASED'
                        }],
                        'hasMore': false, 'bundleId': cfg.bundle_id
                    },
                    'subscriptions': subs,
                    'paid_access_levels': paidAccess
                }
            }
        };
    }

    // receipt/validate / purchase-containers 端点
    if (/(receipt\/validate|purchase-containers)/.test($request.url)) {
        ddm = {
            'data': {
                'type': 'adapty_purchase_container', 'id': profileid,
                'attributes': {
                    'profile_id': profileid,
                    'apple_validation_result': {
                        'environment': 'Production',
                        'receipt': {
                            'receipt_type': 'Production', 'bundle_id': cfg.bundle_id,
                            'in_app': rcpts,
                            'original_purchase_date': '2024-01-23T09:09:09.000000+0000',
                            'adam_id': 1560800462,
                            'request_date': '2024-01-23T09:09:09.000000+0000',
                            'request_date_ms': '1706000949000',
                            'application_version': '1',
                            'original_application_version': '1'
                        },
                        'status': 0,
                        'pending_renewal_info': [{
                            'expiration_intent': '1', 'product_id': cfg.id,
                            'is_in_billing_retry_period': '0',
                            'auto_renew_product_id': cfg.id,
                            'original_transaction_id': '490001271881589',
                            'auto_renew_status': '0'
                        }],
                        'latest_receipt_info': rcpts,
                        'latest_receipt': 'base64encodedreceipt=='
                    },
                    'subscriptions': subs,
                    'paid_access_levels': paidAccess
                }
            }
        };
    }

    console.log('[AdaptyCrack] ✅ 已匹配: ' + key + ' (' + cfg.bundle_id + ') → 注入永久会员');
    matched = true;
    break;
}

if (!matched) {
    console.log('[AdaptyCrack] ⚠️ 未匹配任何 App, UA 前缀: ' + ua.slice(0, 80));
}

$done({ 'body': JSON.stringify(ddm) });

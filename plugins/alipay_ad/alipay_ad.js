/*
------------------------------------------
@Name: 支付宝广告净化
@Version: 1.0.0
@Desc: 拦截推广资源/创意图，清空运营配置数据
------------------------------------------
*/

const URL = ($request && $request.url) || "";

let body;
try { body = JSON.parse($response.body); } catch (e) { $done({}); return; }

// ==========================================
// 高德推广资源 — 清空 data，无气泡/弹窗
// ==========================================
if (URL.includes("promotion-web/resource")) {
    body.data = {};
    body.result = true;
    body.code = "1";
    $done({ body: JSON.stringify(body) });
    return;
}

// ==========================================
// 闲鱼支付宝营销券 — 清空 data，无券可弹
// ==========================================
if (URL.includes("market.voucher")) {
    body.data = {};
    $done({ body: JSON.stringify(body) });
    return;
}

// ==========================================
// 12306 支付宝小程序 main/conf — 清广告位，保留核心功能
// ==========================================
if (URL.includes("12306") && URL.includes("main/conf")) {
    var d = body.data;
    if (d && typeof d === "object") {
        // 首页/订单页轮播广告 — 整组清空
        if (d.ads_banner_conf) d.ads_banner_conf = [];
        // 首页 banner 图
        if (d.index_banner_url) d.index_banner_url = "";
        if (d.is_show_new_index_banner !== undefined) d.is_show_new_index_banner = false;
        // 旅游/机酒联程广告
        if (d.travel_ad) d.travel_ad = {};
        if (d.trainandplaneAdType) d.trainandplaneAdType = "";
        // 运营导流位：约车/订餐 关掉 isShow（核心：退票/扫码/查票/补票 保留）
        var dropTypes = { car: 1, meal: 1 };
        if (Array.isArray(d.icons_button_conf)) {
            d.icons_button_conf.forEach(function (g) {
                if (Array.isArray(g.conf)) {
                    g.conf.forEach(function (it) {
                        if (it && dropTypes[it.type]) it.isShow = false;
                    });
                }
            });
        }
    }
    $done({ body: JSON.stringify(body) });
    return;
}

// ==========================================
// 通用清洗 — 删除广告创意/运营字段
// ==========================================
var kill = ["ad", "ads", "banner", "popup", "promote", "promo", "creative", "feedad", "splash", "operation", "marketing", "bubble"];
function deepStrip(obj) {
    if (!obj || typeof obj !== "object") return;
    for (var i = 0; i < kill.length; i++) {
        var k = kill[i];
        if (obj[k] !== undefined) delete obj[k];
    }
    for (var key in obj) {
        if (obj[key] && typeof obj[key] === "object") {
            deepStrip(obj[key]);
        }
    }
}
deepStrip(body);

$done({ body: JSON.stringify(body) });

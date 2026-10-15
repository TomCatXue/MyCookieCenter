/**
 * MyCookieCenter · 凭据导出与管理脚本 (BoxJS 增强)
 *
 * 核心功能：
 * 1. 【一键复制青龙变量】：从本地持久化提取凭据，按各青龙脚本真实读取的变量名格式化输出，便于全选复制。
 * 2. 【凭据完备度诊断】：针对微信读书检测 App 票据 / 脱机自愈 / 翻牌 Cookie 的完备度并给出补全指引。
 * 3. 【Paperclip 风格一键清除】：联动 BoxJS 各模块的 xxx_clear 开关，清空对应凭据后自动复位开关。
 *
 * 【重要】输出的变量名与格式严格对齐仓库内青龙脚本的真实读取逻辑，不做臆测：
 * - 微信读书  -> WEREAD_AUTH (JSON)
 * - 中国电信  -> dxlin (手机号#服务密码#AndroidID[#SessionKey]，兼容 dxqy/CHINA_TELECOM_AUTH)
 *
 * @Author: TomCatXue
 * @Version: 1.1.0
 * @Date: 2026-10-15
 */

const $ = new Env("凭据导出中心");

// 由 BoxJS scripts 传入模块名；未传则导出全部
const ARG = (typeof globalThis.$argument !== "undefined" ? globalThis.$argument : "").trim().toLowerCase();

(function main() {
    if (handleClearActions()) {
        $.done();
        return;
    }

    const lines = [];
    lines.push("====================================================");
    lines.push("📋 MyCookieCenter · 青龙环境变量导出");
    lines.push("====================================================");
    lines.push("💡 复制指南：长按控制台输出区域，点击「全选」即可复制。");
    lines.push("");

    let count = 0;

    // 1. 微信读书 -> WEREAD_AUTH
    if (!ARG || ARG === "weread" || ARG === "all") {
        const raw = $.getdata("weread_auth_v2");
        if (raw) {
            count++;
            let obj = null;
            try { obj = JSON.parse(raw); } catch (e) { }
            const hasApp = Boolean(obj && obj.vid && obj.skey);
            const hasToken = Boolean(obj && obj.refreshToken && obj.deviceId);
            const hasFlip = Boolean(obj && (obj.wrVid || obj.wrSkey));

            lines.push("# --------------------------------------------------");
            lines.push("# 【微信读书】App票据: " + (hasApp ? "就绪" : "不完整")
                + " | 脱机自愈: " + (hasToken ? "已激活" : "未激活")
                + " | 翻牌Cookie: " + (hasFlip ? "已捕获" : "未捕获"));
            lines.push("# 青龙变量: WEREAD_AUTH   (ql_script/weread.js)");
            lines.push("# --------------------------------------------------");
            lines.push("export WEREAD_AUTH='" + raw + "'");

            if (!hasFlip) {
                lines.push("# 💡 缺少翻牌 H5 凭据：请再打开微信读书 App 的「周二翻牌」活动页补全。");
            }
            if (!hasToken) {
                lines.push("# 💡 缺少 refreshToken/deviceId：请在 App 内退出并重新登录一次以捕获长效种子。");
            }
            lines.push("");
        } else if (ARG === "weread") {
            lines.push("# 【微信读书】未捕获到凭据 (weread_auth_v2 为空)");
            lines.push("# 请先打开微信读书 App 进入「我」的页面触发捕获。");
            lines.push("");
        }
    }

    // 2. 中国电信 -> dxlin (手机号#服务密码#AndroidID[#SessionKey])
    if (!ARG || ARG === "telecom_draw" || ARG === "telecom_rights" || ARG === "all") {
        const phone = $.getdata("telecom_draw_product_no") || "";
        const sessionKey = $.getdata("telecom_draw_session_key") || "";

        lines.push("# --------------------------------------------------");
        lines.push("# 【中国电信】青龙变量: dxlin");
        lines.push("#   (兼容 dxqy / CHINA_TELECOM_AUTH；telecom_daily.py 与 telecom_midnight_equity.py 共用)");
        lines.push("#   格式: 手机号#服务密码#AndroidID[#SessionKey]");
        lines.push("# --------------------------------------------------");

        if (phone || sessionKey) {
            count++;
            lines.push("# 已捕获的手机号: " + (phone || "(未捕获)"));
            lines.push("# 已捕获的 SessionKey: " + (sessionKey ? sessionKey.slice(0, 8) + "..." : "(未捕获)"));
            lines.push("#");
            lines.push("# 👉 Loon 只能捕获 SessionKey，无法捕获服务密码/AndroidID。");
            lines.push("#    请按下述方式拼装 dxlin（SessionKey 为可选第 4 段）：");
            lines.push("#    " + (phone || "手机号") + "#服务密码#" + "AndroidID"
                + (sessionKey ? "#" + sessionKey : ""));
            lines.push("#");
            lines.push("# ⚠️ 若第 4 段留空，青龙会在运行时自动完成 SSO Ticket → SessionKey 换票，");
            lines.push("#    此时无需手动填 SessionKey，脚本仍可正常跑通。");
        } else {
            lines.push("# 暂未捕获到电信凭据。");
            lines.push("# 请打开微信小程序「中国电信5G会员/权益商城」或营业厅 App 的签到/权益页触发捕获。");
        }
        lines.push("");
    }

    // 3. 山西福利 / 扫描全能王：本仓库暂无对应青龙脚本
    if (!ARG || ARG === "telecom_benefit" || ARG === "camscanner" || ARG === "all") {
        const sxCookie = $.getdata("sx_benefit_cookie");
        const csData = $.getdata("camscanner_data");
        if (sxCookie || csData) {
            lines.push("# --------------------------------------------------");
            lines.push("# 【以下项目本仓库暂无对应青龙脚本，仅供本地查看】");
            lines.push("# --------------------------------------------------");
            if (sxCookie) {
                lines.push("# 山西电信领福利 Cookie (时长: " + sxCookie.length + " 字符)");
            }
            if (csData) {
                lines.push("# 扫描全能王凭据 (时长: " + csData.length + " 字符)");
            }
            lines.push("");
        }
    }

    if (count === 0) {
        lines.push("⚠️ 暂未检测到可用于青龙的有效凭据。");
        lines.push("请先在 Loon 插件中开启对应抓取开关，并打开对应 App / 小程序触发一次捕获。");
        lines.push("");
    }

    lines.push("====================================================");

    console.log(lines.join("\n"));

    if (count > 0) {
        $.msg("MyCookieCenter", "📋 凭据导出已生成", "已导出 " + count + " 项，请在日志中全选复制。");
    } else {
        $.msg("MyCookieCenter", "⚠️ 暂无有效凭据", "请先进入对应 App 触发捕获");
    }

    $.done();
})();

/** Paperclip 风格：检测并执行 xxx_clear 开关 */
function handleClearActions() {
    let cleared = false;

    if (isTruthy($.getdata("weread_clear"))) {
        $.setdata("", "weread_auth_v2");
        $.setdata("false", "weread_clear");
        $.msg("微信读书", "🗑️ 凭据已清空", "weread_auth_v2 已重置，开关已复位。");
        console.log("[RESET] 微信读书凭据已清空");
        cleared = true;
    }

    if (isTruthy($.getdata("telecom_draw_clear"))) {
        $.setdata("", "telecom_draw_session_key");
        $.setdata("", "telecom_draw_product_no");
        $.setdata("false", "telecom_draw_clear");
        $.msg("电信·会员抽奖", "🗑️ 凭据已清空", "SessionKey 与手机号已重置，开关已复位。");
        console.log("[RESET] 电信会员抽奖凭据已清空");
        cleared = true;
    }

    if (isTruthy($.getdata("telecom_rights_clear"))) {
        $.setdata("", "telecom_rights_auth");
        $.setdata("false", "telecom_rights_clear");
        $.msg("电信·等级权益", "🗑️ 凭据已清空", "等级权益凭据已重置，开关已复位。");
        console.log("[RESET] 电信等级权益凭据已清空");
        cleared = true;
    }

    if (isTruthy($.getdata("sx_benefit_clear"))) {
        $.setdata("", "sx_benefit_cookie");
        $.setdata("false", "sx_benefit_clear");
        $.msg("电信·山西福利", "🗑️ 凭据已清空", "活动 Cookie 已重置，开关已复位。");
        console.log("[RESET] 山西福利凭据已清空");
        cleared = true;
    }

    if (isTruthy($.getdata("camscanner_clear"))) {
        $.setdata("", "camscanner_data");
        $.setdata("false", "camscanner_clear");
        $.msg("扫描全能王", "🗑️ 凭据已清空", "camscanner_data 已重置，开关已复位。");
        console.log("[RESET] 扫描全能王凭据已清空");
        cleared = true;
    }

    return cleared;
}

function isTruthy(val) {
    return val === true || val === "true" || val === 1 || val === "1";
}

function Env(name) {
    this.name = name;
    this.getdata = function (k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
        if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
        return null;
    };
    this.setdata = function (v, k) {
        if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
        if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
        return false;
    };
    this.msg = function (t, s, b) {
        if (typeof $notification !== "undefined") $notification.post(t, s, b);
        console.log("[通知] " + t + " - " + s + ": " + b);
    };
    this.done = function () {
        if (typeof $done !== "undefined") $done({});
    };
}

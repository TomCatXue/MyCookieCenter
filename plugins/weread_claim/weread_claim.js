/*
 * WeRead Auto Claim · 微信读书自动领取阅读奖励
 *
 * 本脚本提供：
 * 1. Cookie 捕获（http-request，仅备用——已通过 plugin 内嵌脚本实现）
 * 2. 定时自动领取（cron，主功能——每晚 21:00 检查并领取已达标奖励）
 *
 * 插件已内嵌 Cookie 捕获脚本（无需外部文件），因此 http-request 部分备用。
 * cron 部分仍需要本文件，请在推送至 GitHub 后生效，或手动复制到 Loon 脚本目录。
 *
 * @Author: Codex
 * @Updated: 2026-07-27
 *
 * ===== Loon =====
 * [MITM]
 * hostname = i.weread.qq.com
 *
 * [Script]
 * # Cookie 捕获（内嵌于 plugin，无需此文件）
 * http-request ^https?://i\.weread\.qq\.com/.* script-path=script-content=<base64>, tag=WeReadClaim Cookie
 *
 * # 定时领取
 * cron "0 21 * * *" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/weread_claim/weread_claim.js, tag=WeReadClaim 签到
 */

const SCRIPT_VERSION = '2026-07-27.r2';
console.log('[WeReadClaim] 脚本已加载 v' + SCRIPT_VERSION + ', type=' + ($script ? $script.type : 'unknown'));

const BASE_URL = 'https://i.weread.qq.com';
const PF = 'weread_wx-2001-iap-2001-iphone';
const USER_AGENT = 'WeRead/10.2.1 (iPhone; iOS 26.3.1; Scale/3.00)';
const COOKIE_KEY = 'weread_cookie';

// ====== 读取插件参数 ======

function getPreference() {
    let preferCoin = true;
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            const args = typeof $argument === 'string' ? JSON.parse($argument) : $argument;
            if (args.prefer_coin === 'false' || args.prefer_coin === false) {
                preferCoin = false;
            }
        }
    } catch (e) {
        console.log('[WeReadClaim] 读取插件参数失败: ' + e.message);
    }
    return preferCoin ? 'coin' : 'card';
}

// ====== 安全获取 Cookie（兼容大小写）======

function getCookieFromHeaders(headers) {
    if (!headers) return null;
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase() === 'cookie') {
            return headers[keys[i]];
        }
    }
    return null;
}

// ====== 辅助函数 ======

function decodeBase64(body) {
    try {
        const decoded = $base64.decode(body);
        return JSON.parse(decoded);
    } catch (e) {
        console.log('[WeReadClaim] Base64 decode error: ' + e.message);
        return null;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== 核心逻辑：检查并领取奖励 ======

async function autoClaim() {
    console.log('[WeReadClaim] ▶ 开始自动领取任务');

    // 第一步：检查 Cookie
    const cookie = $persistentStore.read(COOKIE_KEY);
    if (!cookie) {
        const msg = '未找到 Cookie，请先打开微信读书 App';
        console.log('[WeReadClaim] ✗ ' + msg);
        $notification.post('WeRead自动领取', '❌ ' + msg, '请打开 App 浏览「我的」页面触发 Cookie 捕获');
        return;
    }
    console.log('[WeReadClaim] ✓ Cookie 存在，准备查询奖励状态');

    // 第二步：查询奖励状态
    const resp = await $task.fetch({
        url: BASE_URL + '/weekly/exchange',
        headers: {
            'Cookie': cookie,
            'User-Agent': USER_AGENT,
            'Accept': '*/*',
            'Accept-Language': 'zh-Hans-US;q=1, en-US;q=0.9'
        }
    });

    if (resp.status !== 200) {
        const msg = '请求奖励接口失败 (HTTP ' + resp.status + ')';
        console.log('[WeReadClaim] ✗ ' + msg);
        $notification.post('WeRead自动领取', '❌ ' + msg, 'Cookie 可能已过期，请重新打开 App 以刷新');
        return;
    }

    const data = decodeBase64(resp.body);
    if (!data) {
        $notification.post('WeRead自动领取', '❌ 响应解析失败', '可能 App 版本更新，请检查插件是否需要更新');
        return;
    }

    // 检查是否有奖励数据
    if (!data.readtimeAwards && !data.readdayAwards) {
        $notification.post('WeRead自动领取', '⚠️ 未找到奖励数据', '响应结构异常，可能接口已变更');
        return;
    }

    // 第三步：读取偏好选择
    const prefer = getPreference();
    const preferName = prefer === 'coin' ? '书币' : '体验卡';
    const allAwards = [...(data.readtimeAwards || []), ...(data.readdayAwards || [])];

    console.log('[WeReadClaim] 共 ' + allAwards.length + ' 个奖励阶梯，偏好: ' + preferName);

    // 检查是否有可领取的奖励
    const claimable = allAwards.filter(function(a) { return a.awardStatus === 1; });
    if (claimable.length === 0) {
        const totalAwards = allAwards.length;
        const completedAwards = allAwards.filter(function(a) { return a.awardStatus === 2; }).length;
        const unlockedAwards = allAwards.filter(function(a) { return a.awardStatus === 0; }).length;
        const msg = '今日无待领取奖励 (已领 ' + completedAwards + '/' + totalAwards + ', 未达标 ' + unlockedAwards + ')';
        console.log('[WeReadClaim] ℹ️ ' + msg);
        $notification.post('WeRead自动领取', 'ℹ️ ' + msg, '阅读时长：' + (data.readingTime || 0) + '秒');
        return;
    }

    // 第四步：逐级领取
    let claimedCount = 0;
    let failedCount = 0;
    let claimedNames = [];

    for (let i = 0; i < allAwards.length; i++) {
        const award = allAwards[i];
        if (award.awardStatus !== 1) {
            console.log('[WeReadClaim] 跳过 ' + award.awardLevelDesc + ' (状态: ' + award.awardStatus + ')');
            continue;
        }

        const choices = award.awardChoices || [];
        let choiceType, choiceName;

        if (prefer === 'coin') {
            const coinChoice = choices.find(function(c) { return c.choiceType === 2 && c.canChoice === 1; });
            if (coinChoice) { choiceType = 2; choiceName = '书币'; }
            else {
                const cardChoice = choices.find(function(c) { return c.choiceType === 1 && c.canChoice === 1; });
                if (cardChoice) { choiceType = 1; choiceName = '体验卡'; }
                else {
                    console.log('[WeReadClaim] 跳过 ' + award.awardLevelDesc + ' (无可用选项)');
                    continue;
                }
            }
        } else {
            const cardChoice = choices.find(function(c) { return c.choiceType === 1 && c.canChoice === 1; });
            if (cardChoice) { choiceType = 1; choiceName = '体验卡'; }
            else {
                const coinChoice = choices.find(function(c) { return c.choiceType === 2 && c.canChoice === 1; });
                if (coinChoice) { choiceType = 2; choiceName = '书币'; }
                else {
                    console.log('[WeReadClaim] 跳过 ' + award.awardLevelDesc + ' (无可用选项)');
                    continue;
                }
            }
        }

        const claimResp = await $task.fetch({
            url: BASE_URL + '/weekly/exchange',
            method: 'POST',
            headers: {
                'Cookie': cookie,
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'Accept-Language': 'zh-Hans-US;q=1, en-US;q=0.9'
            },
            body: $base64.encode(JSON.stringify({
                unread: 1,
                awardChoiceType: choiceType,
                pf: PF,
                awardLevelId: award.awardLevelId,
                isExchangeAward: 1
            }))
        });

        if (claimResp.status === 200) {
            claimedCount++;
            claimedNames.push(award.awardLevelDesc + '(' + choiceName + ')');
            console.log('[WeReadClaim] ✓ ' + award.awardLevelDesc + ' → ' + choiceName + ' (成功)');
        } else {
            failedCount++;
            console.log('[WeReadClaim] ✗ ' + award.awardLevelDesc + ' HTTP ' + claimResp.status);
        }

        await sleep(1000);
    }

    // 第五步：汇总通知
    let resultMsg;
    if (claimedCount > 0 && failedCount === 0) {
        resultMsg = '✅ 成功领取 ' + claimedCount + ' 项: ' + claimedNames.join('、');
        $notification.post('WeRead自动领取', resultMsg, '偏好: ' + preferName + '，阅读 ' + (data.readingTime || 0) + '秒');
    } else if (claimedCount > 0 && failedCount > 0) {
        resultMsg = '⚠️ 成功 ' + claimedCount + ' 项，失败 ' + failedCount + ' 项';
        $notification.post('WeRead自动领取', resultMsg, '偏好: ' + preferName + '，请检查日志');
    } else if (failedCount > 0) {
        resultMsg = '❌ 领取全部失败 (' + failedCount + ' 项)';
        $notification.post('WeRead自动领取', resultMsg, 'Cookie 可能已过期，请重新捕获');
    } else {
        resultMsg = 'ℹ️ 今日无可领取奖励';
        $notification.post('WeRead自动领取', resultMsg, '');
    }
    console.log('[WeReadClaim] ' + resultMsg);
}

// ====== Cookie 捕获（备用，主逻辑由 plugin 内嵌脚本处理）======

function cookieCapture() {
    console.log('[WeReadClaim] ▶ http-request 触发, URL=' + $request.url);
    var cookie = getCookieFromHeaders($request.headers);
    if (cookie) {
        $persistentStore.write(cookie, COOKIE_KEY);
        var preview = cookie.length > 60 ? cookie.substring(0, 60) + '...' : cookie;
        console.log('[WeReadClaim] ✅ Cookie 捕获成功: ' + preview);
        $notification.post('WeRead自动领取', '✅ Cookie 捕获成功', preview);
    } else {
        console.log('[WeReadClaim] ℹ️ 请求无 Cookie 头，跳过捕获');
    }
}

// ====== 主分发器 ======

try {
    if ($script.type === 'cron') {
        console.log('[WeReadClaim] ▶ cron 触发（每晚 21:00 自动领取）');
        autoClaim()
            .then(function() { $done(); })
            .catch(function(e) {
                var msg = e && e.message ? e.message : JSON.stringify(e);
                console.log('[WeReadClaim] ❌ 异常: ' + msg);
                $notification.post('WeRead自动领取', '❌ 执行异常', msg);
                $done();
            });
    } else if ($script.type === 'http-request') {
        cookieCapture();
        $done($request);
    } else if ($script.type === 'http-response') {
        console.log('[WeReadClaim] ▶ http-response 触发');
        var setCookie = $response.headers['Set-Cookie'];
        if (setCookie) {
            var cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
            var wrCookie = null;
            for (var i = 0; i < cookies.length; i++) {
                if (cookies[i].indexOf('wr_vid=') === 0) { wrCookie = cookies[i]; break; }
            }
            if (wrCookie) {
                $persistentStore.write(wrCookie, COOKIE_KEY);
                console.log('[WeReadClaim] ✅ 从 Set-Cookie 捕获: ' + wrCookie.substring(0, 30) + '...');
                $notification.post('WeRead自动领取', '✅ Cookie 捕获成功（Set-Cookie）', '已保存认证信息');
            }
        }
        $done($response);
    } else {
        console.log('[WeReadClaim] ⚠️ 未知脚本类型: ' + $script.type);
        $done({});
    }
} catch (e) {
    console.log('[WeReadClaim] ❌ 分发器异常: ' + (e.message || JSON.stringify(e)));
    $done({});
}

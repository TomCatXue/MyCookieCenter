/*
 * WeRead Auto Claim · 微信读书自动领取阅读奖励
 *
 * 抓取：打开微信读书 App → 浏览「我的」页面 → 自动捕获 Cookie
 * 签到：cron 每晚 21:00 自动检查并领取已达标阅读时长奖励（书币/体验卡）
 *
 * @Author: Codex
 * @Updated: 2026-07-27
 *
 * ===== Loon =====
 * [MITM]
 * hostname = i.weread.qq.com
 *
 * [Script]
 * http-request ^https?://i\.weread\.qq\.com/.* script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/weread_claim/weread_claim.js, tag=WeReadClaim Cookie
 * cron "0 21 * * *" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/weread_claim/weread_claim.js, tag=WeReadClaim 签到
 */

// ====== 启动确认（脚本被成功加载后会打印此行）======
console.log('[WeReadClaim] 脚本已加载, type=' + ($script ? $script.type : 'unknown'));

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
    // 遍历所有 header key，大小写不敏感匹配 cookie
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
    console.log('[WeReadClaim] 开始自动领取任务');
    const cookie = $persistentStore.read(COOKIE_KEY);

    if (!cookie) {
        const msg = '未找到 Cookie，请先打开微信读书 App';
        console.log('[WeReadClaim] ' + msg);
        $notification.post('WeRead自动领取', msg, '请打开 App 浏览「我的」页面触发 Cookie 捕获');
        return;
    }

    console.log('[WeReadClaim] Cookie 存在，请求奖励状态...');

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
        console.log('[WeReadClaim] ' + msg);
        $notification.post('WeRead自动领取', msg, 'Cookie 可能已过期，请重新打开 App 以刷新');
        return;
    }

    const data = decodeBase64(resp.body);
    if (!data) {
        $notification.post('WeRead自动领取', '响应解析失败', '可能 App 版本更新，请检查插件是否需要更新');
        return;
    }

    const prefer = getPreference();
    const preferName = prefer === 'coin' ? '书币' : '体验卡';
    const allAwards = [...(data.readtimeAwards || []), ...(data.readdayAwards || [])];

    console.log('[WeReadClaim] 共 ' + allAwards.length + ' 个奖励阶梯，偏好: ' + preferName);

    let claimedCount = 0;
    let failedCount = 0;
    let claimedNames = [];

    for (const award of allAwards) {
        if (award.awardStatus !== 1) continue;

        const choices = award.awardChoices || [];
        let choiceType, choiceName;

        if (prefer === 'coin') {
            const coinChoice = choices.find(function(c) { return c.choiceType === 2 && c.canChoice === 1; });
            if (coinChoice) { choiceType = 2; choiceName = '书币'; }
            else {
                const cardChoice = choices.find(function(c) { return c.choiceType === 1 && c.canChoice === 1; });
                if (cardChoice) { choiceType = 1; choiceName = '体验卡'; }
                else continue;
            }
        } else {
            const cardChoice = choices.find(function(c) { return c.choiceType === 1 && c.canChoice === 1; });
            if (cardChoice) { choiceType = 1; choiceName = '体验卡'; }
            else {
                const coinChoice = choices.find(function(c) { return c.choiceType === 2 && c.canChoice === 1; });
                if (coinChoice) { choiceType = 2; choiceName = '书币'; }
                else continue;
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
            console.log('[WeReadClaim] ✓ ' + award.awardLevelDesc + ' → ' + choiceName);
        } else {
            failedCount++;
            console.log('[WeReadClaim] ✗ ' + award.awardLevelDesc + ' HTTP ' + claimResp.status);
        }

        await sleep(1500);
    }

    let resultMsg;
    if (claimedCount > 0 && failedCount === 0) {
        resultMsg = '成功领取 ' + claimedCount + ' 项: ' + claimedNames.join('、');
    } else if (claimedCount > 0 && failedCount > 0) {
        resultMsg = '成功 ' + claimedCount + ' 项，失败 ' + failedCount + ' 项';
    } else if (failedCount > 0) {
        resultMsg = '领取全部失败，请检查日志';
    } else {
        resultMsg = '今日已达标奖励均已领完或尚未达标';
    }
    console.log('[WeReadClaim] ' + resultMsg);
    $notification.post('WeRead自动领取', resultMsg, '偏好: ' + preferName);
}

// ====== 主分发器 ======

if ($script.type === 'cron') {
    console.log('[WeReadClaim] ▶ cron 触发');
    autoClaim()
        .then(function() { $done(); })
        .catch(function(e) {
            var msg = e && e.message ? e.message : JSON.stringify(e);
            console.log('[WeReadClaim] 异常: ' + msg);
            $notification.post('WeRead自动领取', '执行异常', msg);
            $done();
        });
} else if ($script.type === 'http-request') {
    console.log('[WeReadClaim] ▶ http-request 触发, URL=' + $request.url);
    var cookie = getCookieFromHeaders($request.headers);
    if (cookie) {
        $persistentStore.write(cookie, COOKIE_KEY);
        var preview = cookie.length > 30 ? cookie.substring(0, 30) + '...' : cookie;
        console.log('[WeReadClaim] ✅ Cookie 捕获成功: ' + preview);
        $notification.post('WeRead自动领取', '✅ Cookie 捕获成功', '已保存认证信息，每晚 21:00 自动领取');
    } else {
        console.log('[WeReadClaim] ℹ️ 请求无 Cookie 头，跳过捕获');
    }
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
            $notification.post('WeRead自动领取', '✅ Cookie 捕获成功', '已保存认证信息，每晚 21:00 自动领取');
        }
    }
    $done($response);
} else {
    $done({});
}

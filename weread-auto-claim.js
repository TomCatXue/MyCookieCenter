/*
 * WeRead Auto Claim - Loon Plugin Script
 * 微信读书自动领取已达标阅读奖励
 * 
 * 功能：定时（每晚21:00）检查并自动领取阅读时长奖励
 * 支持通过插件配置选择优先书币或体验卡
 * 
 * 使用方式：配合 weread-auto-claim.plugin 使用
 */

const BASE_URL = 'https://i.weread.qq.com';
const PF = 'weread_wx-2001-iap-2001-iphone';
const USER_AGENT = 'WeRead/10.2.1 (iPhone; iOS 26.3.1; Scale/3.00)';
const COOKIE_KEY = 'weread_cookie';

// ====== 读取插件参数（从 Loon 插件 UI 配置）======
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
        console.log('读取插件参数失败: ' + e.message + '，使用默认值');
    }
    console.log('\u2699\uFE0F \u5956\u52B1\u504F\u597D: ' + (preferCoin ? '\u4F18\u5148\u9009\u4E66\u5E01' : '\u4F18\u5148\u9009\u4F53\u9A8C\u5361'));
    return preferCoin ? 'coin' : 'card';
}

// ====== 辅助函数 ======

function decodeBase64(body) {
    try {
        const decoded = $base64.decode(body);
        return JSON.parse(decoded);
    } catch (e) {
        console.log('Base64 decode error: ' + e.message);
        return null;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ====== 核心逻辑：检查并领取奖励 ======

async function autoClaim() {
    const cookie = $persistentStore.read(COOKIE_KEY);
    
    if (!cookie) {
        console.log('\u26A0\uFE0F \u672A\u627E\u5230 Cookie\uFF0C\u8BF7\u5148\u6253\u5F00\u5FAE\u4FE1\u8BFB\u4E66 App \u5B8C\u6210\u4E00\u6B21\u7F51\u7EDC\u8BF7\u6C42');
        return;
    }

    console.log('\uD83D\uDD0D \u5F00\u59CB\u68C0\u67E5\u53EF\u9886\u53D6\u7684\u9605\u8BFB\u5956\u52B1...');
    console.log('\uD83D\uDCCB Cookie: ' + cookie.substring(0, 30) + '...');
    
    // Step 1: 获取当前奖励状态
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
        console.log('\u274C \u8BF7\u6C42\u5931\u8D25: HTTP ' + resp.status);
        return;
    }

    const data = decodeBase64(resp.body);
    if (!data) {
        console.log('\u274C \u54CD\u5E94\u89E3\u6790\u5931\u8D25');
        return;
    }

    const timeAwards = data.readtimeAwards || [];
    const dayAwards = data.readdayAwards || [];
    const allAwards = [...timeAwards, ...dayAwards];
    
    console.log('\uD83D\uDCD3 \u5171 ' + allAwards.length + ' \u4E2A\u5956\u52B1\u9636\u68AF');
    console.log('\uD83D\uDCC9 \u4ECA\u65E5\u9605\u8BFB: ' + (data.readingTime || 0) + ' \u79D2 / ' + (data.readingDay || 0) + ' \u5929');

    const prefer = getPreference();
    let claimedCount = 0;

    for (const award of allAwards) {
        if (award.awardStatus !== 1) {
            console.log('  \u23ED ' + award.awardLevelDesc + ': ' + award.awardStatusDesc);
            continue;
        }

        // 根据用户偏好确定领取选项
        const choices = award.awardChoices || [];
        let choiceType, choiceName;
        
        if (prefer === 'coin') {
            const coinChoice = choices.find(c => c.choiceType === 2 && c.canChoice === 1);
            if (coinChoice) {
                choiceType = 2; choiceName = '\u4E66\u5E01';
            } else {
                const cardChoice = choices.find(c => c.choiceType === 1 && c.canChoice === 1);
                if (cardChoice) {
                    choiceType = 1; choiceName = '\u4F53\u9A8C\u5361';
                } else {
                    console.log('  \u26A0\uFE0F ' + award.awardLevelDesc + ': \u65E0\u53EF\u9009\u9009\u9879');
                    continue;
                }
            }
        } else {
            const cardChoice = choices.find(c => c.choiceType === 1 && c.canChoice === 1);
            if (cardChoice) {
                choiceType = 1; choiceName = '\u4F53\u9A8C\u5361';
            } else {
                const coinChoice = choices.find(c => c.choiceType === 2 && c.canChoice === 1);
                if (coinChoice) {
                    choiceType = 2; choiceName = '\u4E66\u5E01';
                } else {
                    console.log('  \u26A0\uFE0F ' + award.awardLevelDesc + ': \u65E0\u53EF\u9009\u9009\u9879');
                    continue;
                }
            }
        }

        console.log('\uD83C\uDFC6 \u9886\u53D6: ' + award.awardLevelDesc + ' \u2192 ' + choiceName);

        const payload = {
            unread: 1,
            awardChoiceType: choiceType,
            pf: PF,
            awardLevelId: award.awardLevelId,
            isExchangeAward: 1
        };
        
        const encodedBody = $base64.encode(JSON.stringify(payload));

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
            body: encodedBody
        });

        if (claimResp.status === 200) {
            claimedCount++;
            console.log('  \u2705 \u9886\u53D6\u6210\u529F');
        } else {
            console.log('  \u274C \u9886\u53D6\u5931\u8D25: HTTP ' + claimResp.status);
        }

        await sleep(1500);
    }

    if (claimedCount === 0) {
        console.log('\u2139\uFE0F \u6CA1\u6709\u53EF\u9886\u53D6\u7684\u5956\u52B1\uFF08\u5C1A\u672A\u8FBE\u6807\u6216\u5DF2\u9886\u53D6\u5B8C\u6BD5\uFF09');
    } else {
        console.log('\uD83C\uDF89 \u5B8C\u6210\uFF01\u6210\u529F\u9886\u53D6 ' + claimedCount + ' \u4E2A\u5956\u52B1');
    }
}

// ====== 主分发器 ======

if ($script.type === 'cron') {
    autoClaim()
        .then(() => {
            console.log('\uD83D\uDD50 \u5B9A\u65F6\u4EFB\u52A1\u6267\u884C\u5B8C\u6BD5');
            $done();
        })
        .catch(e => {
            console.log('\u274C \u6267\u884C\u5F02\u5E38: ' + (e.message || JSON.stringify(e)));
            $done();
        });
} else if ($script.type === 'http-request') {
    const cookie = $request.headers['Cookie'];
    if (cookie) {
        $persistentStore.write(cookie, COOKIE_KEY);
        console.log('\uD83D\uDCDD \u5DF2\u6355\u83B7 Cookie: ' + cookie.substring(0, 40) + '...');
    }
    $done($request);
} else if ($script.type === 'http-response') {
    const setCookie = $response.headers['Set-Cookie'];
    if (setCookie) {
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        const wrCookie = cookies.find(c => c.startsWith('wr_vid='));
        if (wrCookie) {
            $persistentStore.write(wrCookie, COOKIE_KEY);
            console.log('\uD83D\uDCDD \u5DF2\u4ECE Set-Cookie \u6355\u83B7: ' + wrCookie.substring(0, 30) + '...');
        }
    }
    $done($response);
} else {
    $done({});
}

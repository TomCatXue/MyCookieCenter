/**
 * 微信读书 · 自动领取阅读奖励
 *
 * 抓取：打开微信读书 App → 浏览「我的」页面 → 自动捕获 Cookie
 * 签到：cron 每晚 21:00 自动检查并领取已达标阅读时长奖励（书币/体验卡）
 *
 * 基于 HAR 抓包 (325 条请求, WeRead 10.2.1) 校验：
 *   /weekly/exchange 全部 POST + Base64 body
 *   查询 body 必须含 isVisitReadGoal: 1
 *
 * @Author: Codex
 * @Updated: 2026-07-27
 *
 * ===== Loon =====
 * [MITM]
 * hostname = i.weread.qq.com
 *
 * [Script]
 * http-request ^https?://i\.weread\.qq\.com/.* script-path=<this file>, tag=WeReadClaim Cookie
 * cron "0 21 * * *" script-path=<this file>, tag=WeReadClaim 签到
 */

var $ = new Env('微信读书自动领取');
var COOKIE_KEY = 'weread_cookie';

(function main() {
    // http-request: Cookie 捕获
    if (typeof $request !== 'undefined') {
        if ($request.method === 'OPTIONS') { $.done(); return; }
        try {
            var headers = $request.headers || {};
            var cookie = null;
            for (var k in headers) {
                if (k.toLowerCase() === 'cookie') {
                    cookie = headers[k];
                    break;
                }
            }
            if (cookie) {
                $.setdata(cookie, COOKIE_KEY);
                var preview = cookie.length > 60 ? cookie.substring(0, 60) + '...' : cookie;
                $.log('[WeReadClaim] Cookie 捕获成功: ' + preview);
                $.msg($.name, '✅ Cookie 捕获成功', preview);
            } else {
                $.log('[WeReadClaim] 请求无 Cookie 头，跳过');
            }
        } catch (e) {
            $.log('[WeReadClaim] Cookie 捕获异常: ' + (e.message || e));
        }
        $.done();
        return;
    }

    // http-response: 从 Set-Cookie 捕获
    if (typeof $response !== 'undefined') {
        try {
            var setCookie = $response.headers['Set-Cookie'];
            if (setCookie) {
                var cs = Array.isArray(setCookie) ? setCookie : [setCookie];
                for (var i = 0; i < cs.length; i++) {
                    if (cs[i].indexOf('wr_vid=') === 0) {
                        $.setdata(cs[i], COOKIE_KEY);
                        $.log('[WeReadClaim] 从 Set-Cookie 捕获: ' + cs[i].substring(0, 30) + '...');
                        $.msg($.name, '✅ Cookie 捕获成功', '已保存认证信息');
                        break;
                    }
                }
            }
        } catch (e) {
            $.log('[WeReadClaim] Set-Cookie 捕获异常: ' + (e.message || e));
        }
        $.done();
        return;
    }

    // cron: 自动领取
    $.log('[WeReadClaim] 开始自动领取任务');
    autoClaim()
        .then(function() { $.done(); })
        .catch(function(e) {
            var msg = e && e.message ? e.message : JSON.stringify(e);
            $.log('[WeReadClaim] 异常: ' + msg);
            $.msg($.name, '❌ 执行异常', msg);
            $.done();
        });
})();

// ====== 核心逻辑 ======

var BASE_URL = 'https://i.weread.qq.com';
var PF = 'weread_wx-2001-iap-2001-iphone';
var UA = 'WeRead/10.2.1 (iPhone; iOS 26.3.1; Scale/3.00)';

function getPreference() {
    var preferCoin = true;
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            var args = typeof $argument === 'string' ? JSON.parse($argument) : $argument;
            if (args.prefer_coin === 'false' || args.prefer_coin === false) {
                preferCoin = false;
            }
        }
    } catch (e) {
        $.log('[WeReadClaim] 读取插件参数失败: ' + e.message);
    }
    return preferCoin ? 'coin' : 'card';
}

function b64decode(body) {
    try {
        return JSON.parse($base64.decode(body));
    } catch (e) {
        $.log('[WeReadClaim] Base64 decode error: ' + e.message);
        return null;
    }
}

function b64encode(obj) {
    return $base64.encode(JSON.stringify(obj));
}

function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

async function autoClaim() {
    var cookie = $persistentStore.read(COOKIE_KEY);
    if (!cookie) {
        $.log('[WeReadClaim] 未找到 Cookie');
        $.msg($.name, '❌ 未找到 Cookie', '请先打开微信读书 App，浏览「我的」页面');
        return;
    }
    $.log('[WeReadClaim] Cookie 存在，POST 查询奖励状态...');

    // 查询奖励状态 (POST, isExchangeAward=0)
    var resp = await $task.fetch({
        url: BASE_URL + '/weekly/exchange',
        method: 'POST',
        headers: {
            'Cookie': cookie,
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Accept': '*/*',
            'Accept-Language': 'zh-Hans-US;q=1, en-US;q=0.9'
        },
        body: b64encode({
            awardLevelId: 0,
            unread: 1,
            isExchangeAward: 0,
            pf: PF,
            isVisitReadGoal: 1,
            awardChoiceType: 0
        })
    });

    if (resp.status !== 200) {
        $.log('[WeReadClaim] 查询失败 HTTP ' + resp.status);
        $.msg($.name, '❌ 查询奖励失败', 'HTTP ' + resp.status + '，Cookie 可能已过期');
        return;
    }

    var data = b64decode(resp.body);
    if (!data) {
        $.msg($.name, '❌ 响应解析失败', '可能 App 版本更新');
        return;
    }
    if (!data.readtimeAwards && !data.readdayAwards) {
        $.msg($.name, '⚠️ 未找到奖励数据', '响应结构异常');
        return;
    }

    var prefer = getPreference();
    var preferName = prefer === 'coin' ? '书币' : '体验卡';
    var all = (data.readtimeAwards || []).concat(data.readdayAwards || []);
    $.log('[WeReadClaim] 共 ' + all.length + ' 个阶梯，偏好: ' + preferName);

    var claimable = all.filter(function(a) { return a.awardStatus === 1; });
    if (claimable.length === 0) {
        var completed = all.filter(function(a) { return a.awardStatus === 2; }).length;
        var locked = all.filter(function(a) { return a.awardStatus === 0; }).length;
        var msg = '今日无待领取 (' + completed + '/' + all.length + ' 已领, ' + locked + ' 未达标)';
        $.msg($.name, 'ℹ️ ' + msg, '阅读时长：' + (data.readingTime || 0) + '秒');
        return;
    }

    $.log('[WeReadClaim] 发现 ' + claimable.length + ' 项可领取');

    var ok = 0, fail = 0, names = [];

    for (var i = 0; i < all.length; i++) {
        var award = all[i];
        if (award.awardStatus !== 1) continue;

        // 选择偏好类型
        var choices = award.awardChoices || [];
        var type, label;
        if (prefer === 'coin') {
            var coinMatch = choices.filter(function(c) { return c.choiceType === 2 && c.canChoice === 1; })[0];
            if (coinMatch) { type = 2; label = '书币'; }
            else {
                var cardFallback = choices.filter(function(c) { return c.choiceType === 1 && c.canChoice === 1; })[0];
                if (cardFallback) { type = 1; label = '体验卡'; }
                else continue;
            }
        } else {
            var cardMatch = choices.filter(function(c) { return c.choiceType === 1 && c.canChoice === 1; })[0];
            if (cardMatch) { type = 1; label = '体验卡'; }
            else {
                var coinFallback = choices.filter(function(c) { return c.choiceType === 2 && c.canChoice === 1; })[0];
                if (coinFallback) { type = 2; label = '书币'; }
                else continue;
            }
        }

        // 领取
        var claimResp = await $task.fetch({
            url: BASE_URL + '/weekly/exchange',
            method: 'POST',
            headers: {
                'Cookie': cookie,
                'Content-Type': 'application/json',
                'User-Agent': UA,
                'Accept': '*/*',
                'Accept-Language': 'zh-Hans-US;q=1, en-US;q=0.9'
            },
            body: b64encode({
                unread: 1,
                awardChoiceType: type,
                pf: PF,
                awardLevelId: award.awardLevelId,
                isExchangeAward: 1
            })
        });

        if (claimResp.status === 200) {
            ok++;
            names.push(award.awardLevelDesc + '(' + label + ')');
            $.log('[WeReadClaim] ' + award.awardLevelDesc + ' -> ' + label + ' OK');
        } else {
            fail++;
            $.log('[WeReadClaim] ' + award.awardLevelDesc + ' FAIL ' + claimResp.status);
        }
        await sleep(1000);
    }

    var result;
    if (ok > 0 && fail === 0) {
        result = '✅ 领取 ' + ok + ' 项: ' + names.join('、');
    } else if (ok > 0 && fail > 0) {
        result = '⚠️ 成功 ' + ok + ' 项，失败 ' + fail + ' 项';
    } else if (fail > 0) {
        result = '❌ 全部失败 (' + fail + ' 项)';
    } else {
        result = 'ℹ️ 无可领取';
    }

    $.msg($.name, result, '偏好: ' + preferName + '，阅读 ' + (data.readingTime || 0) + '秒');
    $.log('[WeReadClaim] ' + result);
}

// ====== 跨平台 Env 类 ======

function Env(name) {
    this.name = name;
    this.isLoon = function() { return typeof $loon !== 'undefined'; };
    this.isSurge = function() { return typeof $httpClient !== 'undefined' && !this.isLoon(); };
    this.isQX = function() { return typeof $task !== 'undefined' && !this.isLoon(); };

    this.log = function() {
        var args = Array.prototype.slice.call(arguments);
        console.log(args.join('\n'));
    };

    this.msg = function(title, subtitle, body) {
        title = title || this.name;
        subtitle = subtitle || '';
        body = body || '';
        if (typeof $notification !== 'undefined') {
            $notification.post(title, subtitle, body);
        }
        console.log('📣 ' + title + '\n' + subtitle + '\n' + body);
    };

    this.getdata = function(key) {
        if (typeof $persistentStore !== 'undefined') return $persistentStore.read(key);
        if (typeof $prefs !== 'undefined') return $prefs.valueForKey(key);
        return null;
    };

    this.setdata = function(value, key) {
        if (typeof $persistentStore !== 'undefined') return $persistentStore.write(value, key);
        if (typeof $prefs !== 'undefined') return $prefs.setValueForKey(value, key);
        return false;
    };

    this.done = function(value) {
        if (typeof $done !== 'undefined') { $done(value); }
    };
}

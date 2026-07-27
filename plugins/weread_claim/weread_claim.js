var $ = new Env('WeRead');
var CK = 'weread_auth'; // 存的是 {"vid":"...","skey":"..."} 而不是 Cookie 字符串

(function main() {
    if (typeof $request !== 'undefined') {
        try {
            var h = $request.headers || {};
            var vid = null, skey = null;
            for (var k in h) {
                var kl = k.toLowerCase();
                if (kl === 'vid') vid = h[k];
                if (kl === 'skey') skey = h[k];
            }
            if (vid && skey) {
                var auth = JSON.stringify({ vid: vid, skey: skey });
                $.setdata(auth, CK);
                $.log('[WeReadClaim] Auth OK: vid=' + vid + ' skey=' + skey);
                $.msg($.name, 'Auth OK', 'vid=' + vid + ' skey=' + skey);
            } else {
                // 该请求没带 vid/skey（正常现象，App 并非每个请求都带），静默放行即可
                $.log('[WeReadClaim] No vid/skey in this request: ' + ($request ? $request.url : ''));
            }
        } catch (e) {
            $.log('[WeReadClaim] Auth capture error: ' + (e.message || e));
        }
        $done($request);
        return;
    }

    $.log('[WeReadClaim] cron start');
    autoClaim()
        .then(function() { $.done(); })
        .catch(function(e) {
            var msg = e ? (e.message || JSON.stringify(e)) : 'unknown';
            $.log('[WeReadClaim] cron error: ' + msg);
            $.msg($.name, 'Error', msg);
            $.done();
        });
})();

var BASE = 'https://i.weread.qq.com';
var PF = 'weread_wx-2001-iap-2001-iphone';
var UA = 'WeRead/10.2.1 (iPhone; iOS 26.3.1; Scale/3.00)';

function getPref() {
    var pc = true;
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            var a = typeof $argument === 'string' ? JSON.parse($argument) : $argument;
            if (a.prefer_coin === 'false' || a.prefer_coin === false) pc = false;
        }
    } catch (e) {}
    return pc ? 'coin' : 'card';
}

function bd(b) { try { return JSON.parse($base64.decode(b)); } catch (e) { return null; } }
function be(o) { return $base64.encode(JSON.stringify(o)); }
function sp(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function getAuthHeaders(auth) {
    return {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        'Accept': '*/*',
        'Accept-Language': 'zh-Hans-US;q=1, en-US;q=0.9',
        'vid': auth.vid,
        'skey': auth.skey
    };
}

async function autoClaim() {
    var raw = $persistentStore.read(CK);
    if (!raw) {
        $.log('[WeReadClaim] No auth stored');
        $.msg($.name, 'No Auth', '请打开微信读书 App 随便刷一下（比如"我的"或书架页）');
        return;
    }

    var auth;
    try { auth = JSON.parse(raw); } catch (e) { auth = null; }
    if (!auth || !auth.vid || !auth.skey) {
        $.log('[WeReadClaim] Stored auth invalid: ' + raw);
        $.msg($.name, 'Auth Invalid', '请重新打开微信读书 App 触发抓取');
        return;
    }

    var headers = getAuthHeaders(auth);

    var r1 = await $task.fetch({
        url: BASE + '/weekly/exchange',
        method: 'POST',
        headers: headers,
        body: be({ awardLevelId: 0, unread: 1, isExchangeAward: 0, pf: PF, isVisitReadGoal: 1, awardChoiceType: 0 })
    });

    if (r1.status !== 200) { $.msg($.name, 'Query Failed', 'HTTP ' + r1.status + '（skey 可能已过期，请重新打开 App）'); return; }

    var d = bd(r1.body);
    if (!d || (!d.readtimeAwards && !d.readdayAwards)) { $.msg($.name, 'Parse Error', ''); return; }

    var pref = getPref();
    var pn = pref === 'coin' ? 'coin' : 'card';
    var all = (d.readtimeAwards || []).concat(d.readdayAwards || []);

    var todo = all.filter(function(a) { return a.awardStatus === 1; });
    if (todo.length === 0) {
        var dd = all.filter(function(a) { return a.awardStatus === 2; }).length;
        var ll = all.filter(function(a) { return a.awardStatus === 0; }).length;
        $.msg($.name, 'Nothing', dd + '/' + all.length + ' done, ' + ll + ' locked');
        return;
    }

    var ok = 0, fail = 0, ns = [];

    for (var i = 0; i < all.length; i++) {
        var aw = all[i];
        if (aw.awardStatus !== 1) continue;
        var cs = aw.awardChoices || [];
        var ty, lb;

        if (pref === 'coin') {
            var m1 = cs.filter(function(c) { return c.choiceType === 2 && c.canChoice === 1; })[0];
            if (m1) { ty = 2; lb = 'coin'; }
            else {
                var m2 = cs.filter(function(c) { return c.choiceType === 1 && c.canChoice === 1; })[0];
                if (m2) { ty = 1; lb = 'card'; }
                else continue;
            }
        } else {
            var m3 = cs.filter(function(c) { return c.choiceType === 1 && c.canChoice === 1; })[0];
            if (m3) { ty = 1; lb = 'card'; }
            else {
                var m4 = cs.filter(function(c) { return c.choiceType === 2 && c.canChoice === 1; })[0];
                if (m4) { ty = 2; lb = 'coin'; }
                else continue;
            }
        }

        var r2 = await $task.fetch({
            url: BASE + '/weekly/exchange',
            method: 'POST',
            headers: headers,
            body: be({ unread: 1, awardChoiceType: ty, pf: PF, awardLevelId: aw.awardLevelId, isExchangeAward: 1 })
        });

        if (r2.status === 200) {
            ok++; ns.push(aw.awardLevelDesc + '(' + lb + ')');
            $.log('[WeReadClaim] ' + aw.awardLevelDesc + ' -> ' + lb + ' OK');
        } else {
            fail++;
            $.log('[WeReadClaim] ' + aw.awardLevelDesc + ' FAIL ' + r2.status);
        }
        await sp(1000);
    }

    var rs;
    if (ok > 0 && fail === 0) rs = 'OK: ' + ok + ' items';
    else if (ok > 0) rs = 'Partial: ' + ok + ' ok, ' + fail + ' fail';
    else if (fail > 0) rs = 'All failed: ' + fail;
    else rs = 'Nothing';

    $.msg($.name, rs, 'Prefer: ' + pn);
}

// ====== Env (match camscanner pattern) ======

function Env(n) {
    this.name = n;
    this.isSurge = function() { return typeof $httpClient !== 'undefined' && !!$httpClient; };
    this.isQX = function() { return typeof $task !== 'undefined' && !this.isLoon(); };
    this.isLoon = function() { return typeof $loon !== 'undefined' && !!$loon; };

    this.log = function() {
        var a = [];
        for (var i = 0; i < arguments.length; i++) a.push(arguments[i]);
        console.log(a.join(' '));
    };

    this.msg = function(t, s, b) {
        t = t || this.name;
        s = s || '';
        b = b || '';
        if (this.isSurge() || this.isLoon()) {
            $notification.post(t, s, b);
        } else if (this.isQX()) {
            if (typeof $notify !== 'undefined') $notify(t, s, b);
        }
        console.log(t + ' | ' + s + ' | ' + b);
    };

    this.getdata = function(k) {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(k);
        if (this.isQX()) return $prefs.valueForKey(k);
        return null;
    };

    this.setdata = function(v, k) {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(v, k);
        if (this.isQX()) return $prefs.setValueForKey(v, k);
        return false;
    };

    this.done = function(v) {
        if (typeof $done === 'undefined') return;
        if (arguments.length > 0 && v !== undefined) $done(v);
        else $done();
    };
}

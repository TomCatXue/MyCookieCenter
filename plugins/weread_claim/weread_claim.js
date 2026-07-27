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
                // 去重：同一份 vid/skey 一次浏览会命中十几二十个请求，
                // 只有和上次存的值不一样时才写入 + 通知，避免刷一次弹一堆通知
                var prevRaw = $persistentStore.read(CK);
                var prev = null;
                try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch (e) {}
                var changed = !prev || prev.vid !== vid || prev.skey !== skey;

                if (changed) {
                    var auth = JSON.stringify({ vid: vid, skey: skey });
                    $.setdata(auth, CK);
                    $.log('[WeReadClaim] Auth updated: vid=' + vid + ' skey=' + skey);
                    if (getNotifyCapture()) {
                        $.msg($.name, 'Auth Updated', 'vid=' + vid + ' skey=' + skey);
                    }
                }
                // 没变化就完全静默，不写日志不弹通知
            } else {
                // 该请求没带 vid/skey（正常现象，App 并非每个请求都带），静默放行即可
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

function getNotifyCapture() {
    var nc = false; // 默认关闭：静默抓取，避免刷 App 时弹通知
    try {
        if (typeof $argument !== 'undefined' && $argument) {
            var a = typeof $argument === 'string' ? JSON.parse($argument) : $argument;
            if (a.notify_capture === 'true' || a.notify_capture === true) nc = true;
        }
    } catch (e) {}
    return nc;
}

function sp(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ====== 跨平台 base64（不依赖 $base64，Loon 某些版本没有这个全局对象）======

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8ToBytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.codePointAt(i);
        if (c > 0xffff) i++; // 代理对已合并读取，跳过下一个 code unit
        if (c < 0x80) {
            bytes.push(c);
        } else if (c < 0x800) {
            bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
        } else if (c < 0x10000) {
            bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        } else {
            bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
    }
    return bytes;
}

function bytesToUtf8(bytes) {
    var str = '';
    var i = 0;
    while (i < bytes.length) {
        var c = bytes[i++];
        if (c < 0x80) {
            str += String.fromCharCode(c);
        } else if ((c & 0xe0) === 0xc0) {
            var c2 = bytes[i++];
            str += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
        } else if ((c & 0xf0) === 0xe0) {
            var c2 = bytes[i++], c3 = bytes[i++];
            str += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
        } else if ((c & 0xf8) === 0xf0) {
            var c2 = bytes[i++], c3 = bytes[i++], c4 = bytes[i++];
            var cp = ((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
            cp -= 0x10000;
            str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
            // 非法字节，跳过
        }
    }
    return str;
}

function base64EncodeBytes(bytes) {
    var out = '';
    var i = 0;
    for (; i + 3 <= bytes.length; i += 3) {
        var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63];
    }
    var rem = bytes.length - i;
    if (rem === 1) {
        var n = bytes[i] << 16;
        out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
    } else if (rem === 2) {
        var n = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '=';
    }
    return out;
}

function base64DecodeToBytes(str) {
    str = String(str).replace(/[^A-Za-z0-9+/=]/g, '');
    var lookup = {};
    for (var i = 0; i < B64_CHARS.length; i++) lookup[B64_CHARS[i]] = i;
    var bytes = [];
    var p = 0;
    while (p < str.length) {
        var c1 = lookup[str[p++]] || 0;
        var c2 = lookup[str[p++]] || 0;
        var ch3 = str[p]; var c3 = (ch3 === '=' || ch3 === undefined) ? undefined : lookup[ch3]; p++;
        var ch4 = str[p]; var c4 = (ch4 === '=' || ch4 === undefined) ? undefined : lookup[ch4]; p++;

        var n = (c1 << 18) | (c2 << 12) | ((c3 || 0) << 6) | (c4 || 0);
        bytes.push((n >> 16) & 0xff);
        if (c3 !== undefined) bytes.push((n >> 8) & 0xff);
        if (c4 !== undefined) bytes.push(n & 0xff);
    }
    return bytes;
}

function b64encode(str) {
    if (typeof $base64 !== 'undefined' && $base64.encode) {
        try { return $base64.encode(str); } catch (e) {}
    }
    if (typeof btoa === 'function') {
        try { return btoa(unescape(encodeURIComponent(str))); } catch (e) {}
    }
    return base64EncodeBytes(utf8ToBytes(str));
}

function b64decode(str) {
    if (typeof $base64 !== 'undefined' && $base64.decode) {
        try { return $base64.decode(str); } catch (e) {}
    }
    if (typeof atob === 'function') {
        try { return decodeURIComponent(escape(atob(str))); } catch (e) {}
    }
    return bytesToUtf8(base64DecodeToBytes(str));
}

function bd(b) { try { return JSON.parse(b64decode(b)); } catch (e) { return null; } }
function be(o) { return b64encode(JSON.stringify(o)); }

// 跨平台请求封装：QuantumultX 有 $task.fetch；Loon/Surge 没有 $task，只有回调式的 $httpClient
function httpFetch(opts) {
    return new Promise(function(resolve, reject) {
        if (typeof $task !== 'undefined' && $task.fetch) {
            $task.fetch(opts).then(
                function(resp) {
                    resolve({ status: resp.status || resp.statusCode, body: resp.body, headers: resp.headers });
                },
                function(err) { reject(err); }
            );
            return;
        }
        if (typeof $httpClient !== 'undefined') {
            var method = (opts.method || 'GET').toUpperCase();
            var req = { url: opts.url, headers: opts.headers, body: opts.body };
            var cb = function(err, resp, body) {
                if (err) { reject(err); return; }
                resolve({ status: (resp && (resp.status || resp.statusCode)) || 0, body: body, headers: resp ? resp.headers : {} });
            };
            if (method === 'POST') $httpClient.post(req, cb);
            else if (method === 'PUT') $httpClient.put(req, cb);
            else if (method === 'DELETE' && $httpClient['delete']) $httpClient['delete'](req, cb);
            else $httpClient.get(req, cb);
            return;
        }
        reject(new Error('No HTTP client available ($task/$httpClient not found)'));
    });
}

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

    var r1 = await httpFetch({
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

        var r2 = await httpFetch({
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

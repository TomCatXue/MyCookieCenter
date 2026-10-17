/**
 * 扫描全能王 · Cookie 抓取
 *
 * 行为：
 *   - 进 App 触发 get_user_attribute 时更新 Cookie
 *   - 数据未变 → 直接跳过，不打扰
 *   - 数据变化 → 写入并通知一次「Cookie 获取成功」
 *
 * 基于 MaYIHEI/paperclip 原作改造，存放本仓库维护。
 *
 * @Author: MaYIHEI (原作) / TomCatXue
 * @Source: https://github.com/MaYIHEI/paperclip
 * @Updated: 2026-10-17
 */

const $ = new Env("扫描全能王 [Cookie]");

const CK_KEY = 'camscanner_data';
const SCRIPT_VERSION = '2026-10-17-notify';
const NOTIFY_TIME_KEY = 'camscanner_notify_time';
const NOTIFY_GAP_MS = 10 * 1000;

(function main() {
    if (typeof $request === "undefined") {
        $.log('[ERROR] 该脚本仅作为 http-request 重写脚本运行');
        $.done();
        return;
    }
    if ($request.method === 'OPTIONS') { $.done(); return; }

    try {
        const url = $request.url;
        const headers = $request.headers || {};

        // token 优先从 header 取,再从 URL 取
        const token =
            headers['x-is-token'] ||
            headers['X-Is-Token'] ||
            (url.match(/[?&]token=([^&]+)/) || [])[1] || '';

        const csEptD = (url.match(/[?&]cs_ept_d=([^&]+)/) || [])[1] || '';
        const clientId = (url.match(/[?&]client_id=([^&]+)/) || [])[1] || '';

        if (!token) {
            $.log('[WARN] 未拿到 token,跳过');
            $.done();
            return;
        }

        const old = $.getdata(CK_KEY);
        let prev = {};
        try { prev = JSON.parse(old || '{}'); } catch (e) { }

        // cs_ept_d / client_id 可能在不同请求里,增量更新
        const data = {
            token: token,
            cs_ept_d: csEptD || prev.cs_ept_d || '',
            client_id: clientId || prev.client_id || '',
        };

        const unchanged = prev.token === data.token
            && prev.cs_ept_d === data.cs_ept_d
            && prev.client_id === data.client_id;

        if (!unchanged) {
            $.setdata(JSON.stringify(data), CK_KEY);
            $.log(`[INFO] 已更新 token=${data.token.slice(0, 8)}… cs_ept_d=${data.cs_ept_d ? '有' : '无'} client_id=${data.client_id || '无'}`);
        } else {
            $.log('[INFO] 数据未变化，仅发送确认提示');
        }

        // 无论是否变化都提示：变化时强制通知，未变化时 10 秒内去重
        const lastNotify = Number($.getdata(NOTIFY_TIME_KEY) || 0);
        if (!unchanged || Date.now() - lastNotify >= NOTIFY_GAP_MS) {
            $.setdata(String(Date.now()), NOTIFY_TIME_KEY);
            $.msg('扫描全能王', '✅ Cookie 获取成功',
                `token: ${data.token.slice(0, 8)}…\ncs_ept_d: ${data.cs_ept_d ? '已捕获' : '缺失'}\nclient_id: ${data.client_id || '缺失'}`);
        } else {
            $.log('[INFO] 10 秒内重复触发，已去重');
        }
    } catch (e) {
        $.log('[ERROR] cookie 抓取失败: ' + e);
    }

    $.done();
})();

function Env(s) {
    this.name = s;
    this.isSurge = () => typeof $httpClient !== 'undefined' && !!$httpClient;
    this.isQuanX = () => typeof $task !== 'undefined' && !!$task;
    this.isLoon = () => typeof $loon !== 'undefined' && !!$loon;
    this.log = (...a) => console.log(a.join('\n'));
    this.msg = (t = this.name, s = '', b = '') => {
        if (typeof $notification !== 'undefined' && $notification && $notification.post) {
            $notification.post(t, s, b);
        } else if (this.isQuanX() && typeof $notify !== 'undefined') {
            $notify(t, s, b);
        }
        console.log(['', '====📣' + t + '====', s, b].filter(Boolean).join('\n'));
    };
    this.getdata = (k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.read(k);
        if (this.isQuanX()) return $prefs.valueForKey(k);
        if (typeof $persistentStore !== 'undefined') return $persistentStore.read(k);
        return null;
    };
    this.setdata = (v, k) => {
        if (this.isSurge() || this.isLoon()) return $persistentStore.write(v, k);
        if (this.isQuanX()) return $prefs.setValueForKey(v, k);
        if (typeof $persistentStore !== 'undefined') return $persistentStore.write(v, k);
        return false;
    };
    this.done = (v = {}) => { if (typeof $done !== 'undefined') $done(v); };
}

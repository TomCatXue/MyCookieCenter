/**
 * 扫描全能王 · Cookie 抓取（静默版）
 *
 * 行为：
 *   - 进 App 触发 get_user_attribute 时静默更新 Cookie，不弹通知
 *   - 数据未变 → 直接跳过；数据变化 → 静默写入，不弹"获取成功"
 *   - Cookie 失效的通知由签到脚本（cron camscanner.js）在签到失败时负责
 *
 * 基于 MaYIHEI/paperclip 原作改造，存放本仓库维护。
 * 原作每次数据变化都弹通知，本版按用户需求改为静默。
 *
 * @Author: MaYIHEI (原作) / TomCatXue (静默改造)
 * @Source: https://github.com/MaYIHEI/paperclip
 * @Updated: 2026-08-14
 */

const $ = new Env("扫描全能王 [Cookie]");

const CK_KEY = 'camscanner_data';
const SCRIPT_VERSION = '2026-08-14-silent';

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

        const csEptD  = (url.match(/[?&]cs_ept_d=([^&]+)/) || [])[1] || '';
        const clientId = (url.match(/[?&]client_id=([^&]+)/) || [])[1] || '';

        if (!token) {
            $.log('[WARN] 未拿到 token,跳过');
            $.done();
            return;
        }

        const old = $.getdata(CK_KEY);
        let prev = {};
        try { prev = JSON.parse(old || '{}'); } catch (e) {}

        // cs_ept_d / client_id 可能在不同请求里,增量更新
        const data = {
            token:       token,
            cs_ept_d:    csEptD   || prev.cs_ept_d  || '',
            client_id:   clientId || prev.client_id || '',
        };

        // 数据未变 → 完全静默
        if (prev.token === data.token && prev.cs_ept_d === data.cs_ept_d && prev.client_id === data.client_id) {
            $.log('[INFO] 数据未变,跳过更新');
            $.done();
            return;
        }

        // 数据变化 → 静默更新（不弹通知）；失效与否由签到脚本判定
        $.setdata(JSON.stringify(data), CK_KEY);
        $.log(`[INFO] 已更新 token=${data.token.slice(0, 8)}… cs_ept_d=${data.cs_ept_d ? '有' : '无'} client_id=${data.client_id || '无'}`);
    } catch (e) {
        $.log('[ERROR] cookie 抓取失败: ' + e);
    }

    $.done();
})();

function Env(s) {
    this.name = s;
    this.isSurge = () => typeof $httpClient !== 'undefined' && !!$httpClient;
    this.isQuanX = () => typeof $task !== 'undefined' && !!$task;
    this.isLoon  = () => typeof $loon !== 'undefined' && !!$loon;
    this.log = (...a) => console.log(a.join('\n'));
    this.msg = (t = this.name, s = '', b = '') => {
        if (this.isSurge() || this.isLoon()) $notification.post(t, s, b);
        else if (this.isQuanX()) $notify(t, s, b);
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

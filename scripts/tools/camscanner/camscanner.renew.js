/**
 * 扫描全能王 · 自动换票
 *
 * 用长效种子 token_pwd 调 update_token_by_tokenpwd 换新 token。
 * token_pwd 仅登录/重登时下发，由 camscanner.cookie.js 捕获一次后长期使用。
 *
 * 行为：
 *   - 定时触发 → 读 camscanner_data → 用 token_pwd 换票 → 原地更新并落盘
 *   - 换票成功 → 单行极简通知；失败 → 明确标注是否需重新登录抓种子
 *
 * 隐私铁律：token_pwd / token 绝不打印日志、绝不进通知正文、绝不入库。
 *
 * @Author: TomCatXue
 * @Source: https://github.com/TomCatXue/MyCookieCenter
 * @Updated: 2026-10-22
 */

const $ = new Env("扫描全能王 [换票]");

const CK_KEY = 'camscanner_data';
const SCRIPT_VERSION = '2026-10-22-renew';
// 换票端点（HAR 实测：无 sign / 无 timestamp，GET + token_pwd 鉴权）
const RENEW_URL = 'https://api-cs.intsig.net/user/cs/update_token_by_tokenpwd';
// 换票请求头指纹必须与真机同态（继承自抓包），防触发多设备风控
const RENEW_UA = 'CamScanner_Lite/7.26.6 (iPhone; iOS 27.0.1; Scale/3.00)';

(function main() {
    $.log(`[CamScanner-Renew] v${SCRIPT_VERSION} 启动`);

    let ck = {};
    try { ck = JSON.parse($.getdata(CK_KEY) || '{}'); } catch (e) { }

    const tokenPwd = ck.token_pwd || '';
    if (!tokenPwd) {
        $.msg('扫描全能王', '⚠️ 未捕获长效换票种子',
            '请先在 App 内「退出登录并重新登录」，\n让插件抓取一次 token_pwd，之后即可自动换票');
        $.log('[CamScanner-Renew] 缺少 token_pwd，终止');
        $.done();
        return;
    }

    renew(ck, tokenPwd);
})();

function renew(ck, tokenPwd) {
    // 100% 复刻真机换票参数（无 sign，query 直传）
    const params = {
        accountEncrypt: ck.account_encrypt || '',
        account_type: ck.account_type || 'email',
        client: 'iPhone-iPhone',
        client_app: 'CamScanner_IP_FREE@7.26.6.2609201836',
        client_id: ck.client_id || '',
        cs_ept_d: ck.cs_ept_d || '',
        token_pwd: tokenPwd,
    };

    const qs = Object.keys(params)
        .map(k => `${k}=${encodeURIComponent(params[k])}`)
        .join('&');
    const url = `${RENEW_URL}?${qs}&`;

    // header 指纹用设备级 x-is-cs-ept-d（与 query 的用户级 cs_ept_d 是两个不同值，HAR 实测）
    const deviceEptD = ck.device_ept_d || ck.cs_ept_d || '';
    const headers = {
        'accept': '*/*',
        'accept-language': 'zh-Hans-US;q=1, en-US;q=0.9',
        'x-is-token': ck.token || '',
        'x-is-request-id': randomUUID(),
        'user-agent': RENEW_UA,
        'x-is-cs-ept-d': deviceEptD,
    };

    httpGet(url, headers, (err, body) => {
        if (err) {
            $.msg('扫描全能王', '🌐 换票请求失败', `网络错误：${err}\n稍后自动重试`);
            $.log(`[CamScanner-Renew] 请求异常：${err}`);
            $.done();
            return;
        }

        // 响应是 Base64 编码的 JSON：{"ret":0,"login_token":"...","expiry_time":...}
        const resp = decodeResponse(body);
        if (!resp) {
            $.msg('扫描全能王', '⚠️ 换票响应异常', '无法解析响应，已保留原 token');
            $.log('[CamScanner-Renew] 响应解析失败');
            $.done();
            return;
        }

        const ret = String(resp.ret);
        if (ret === '0' && resp.login_token) {
            // 原地更新 token，保留 token_pwd 等长效字段，落盘
            const newData = {
                token: resp.login_token,
                cs_ept_d: ck.cs_ept_d || '',
                device_ept_d: ck.device_ept_d || '',
                client_id: ck.client_id || '',
                token_pwd: ck.token_pwd || '',
                account_encrypt: ck.account_encrypt || '',
                account_type: ck.account_type || '',
            };
            $.setdata(JSON.stringify(newData), CK_KEY);

            const expiry = resp.expiry_time
                ? formatTime(Number(resp.expiry_time))
                : '未知';
            $.msg('扫描全能王', '✅ 换票成功',
                `• 新 token 已生效\n• 有效期至 ${expiry}`);
            $.log(`[CamScanner-Renew] 换票成功，有效期至 ${expiry}（token 已脱敏）`);
        } else if (isSeedInvalid(resp)) {
            // 种子失效（改密码/服务端重置），必须重新登录抓新 token_pwd
            $.msg('扫描全能王', '🚫 换票种子已失效',
                'token_pwd 已失效（可能改密或重置）\n请在 App 内退出登录并重新登录，重新抓取');
            $.log('[CamScanner-Renew] token_pwd 失效，需重新捕获');
        } else {
            $.msg('扫描全能王', '⚠️ 换票未成功',
                `服务端返回 ret=${ret}，已保留原 token`);
            $.log(`[CamScanner-Renew] 换票返回 ret=${ret}`);
        }
        $.done();
    });
}

// ── 响应解码：兼容 Base64 / 明文 JSON ────────────────────────────────────────

function decodeResponse(body) {
    if (!body) return null;
    // 先试 Base64（HAR 实测响应为 Base64）
    try {
        const decoded = base64Decode(body);
        return JSON.parse(decoded);
    } catch (e) { }
    // 再试明文 JSON（部分网关直接返回）
    try { return JSON.parse(body); } catch (e) { }
    return null;
}

function base64Decode(b64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = String(b64).replace(/=+$/, '');
    let out = '';
    if (str.length % 4 === 1) throw new Error('invalid base64');
    for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? out += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }
    // UTF-8 解码
    return decodeURIComponent(out.split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

// ret 语义：101=参数非法；105/116/种子相关=种子失效
function isSeedInvalid(resp) {
    const ret = String(resp.ret);
    const msg = String(resp.msg || resp.err || resp.errmsg || '');
    return ret === '105' || ret === '116' || ret === '101' ||
        /token.*pwd|token_pwd|password|pwd/i.test(msg) ||
        /invalid|失效|过期|重新登录/i.test(msg);
}

// ── 工具 ─────────────────────────────────────────────────────────────────────

function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    }).toUpperCase();
}

function formatTime(unixSec) {
    const d = new Date(unixSec * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function httpGet(url, headers, cb) {
    const opts = { url, headers, timeout: 15000 };
    const done = (err, resp, data) => cb(err, data);

    if (typeof $httpClient !== 'undefined' && $httpClient && $httpClient.get) {
        // Loon / Surge
        $httpClient.get(opts, done);
    } else if (typeof $task !== 'undefined' && $task) {
        // Quantumult X
        $task.fetch({ url, method: 'GET', headers }).then(
            resp => done(null, resp, resp.body),
            err => done(err && err.error ? err.error : String(err))
        );
    } else if (typeof $environment !== 'undefined' && $environment.system === 'nodejs') {
        cb('Node 环境请用 ql_script 版本');
    } else {
        cb('当前环境不支持 HTTP 请求');
    }
}

// ── Env 多平台适配器 ──────────────────────────────────────────────────────────

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

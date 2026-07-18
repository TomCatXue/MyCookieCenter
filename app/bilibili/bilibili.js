/**
 * 哔哩哔哩 · 每日签到 / 银瓜子
 *
 * 抓取：打开哔哩哔哩 App → 首页 → 触发 nav 接口 → 抓 Cookie（含 SESSDATA）
 * 签到：cron 领取直播银瓜子 / 每日签到奖励
 *
 * @Author: MyCookieCenter <https://github.com/owner/repo>
 * @Updated: 2026-07-18
 *
 * ===== Loon =====
 * [MITM] hostname = api.bilibili.com
 * [Script]
 * http-request ^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav tag=哔哩哔哩 Cookie, script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js, requires-body=false
 * cron "0 9 * * *" script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enable=true
 *
 * ===== Surge =====
 * [MITM] hostname = api.bilibili.com
 * [Script]
 * 哔哩哔哩 Cookie = type=http-request,pattern=^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js
 * 哔哩哔哩签到 = type=cron,cronexp=0 9 * * *,timeout=60,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js
 *
 * ===== Quantumult X =====
 * [MITM] hostname = api.bilibili.com
 * [rewrite_local]
 * ^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav url script-request-header https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js
 * [task_local]
 * 0 9 * * * https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enabled=true
 *
 * ===== Stash =====
 * [MITM] hostname = api.bilibili.com
 * cron:
 *   script:
 *     - name: 哔哩哔哩签到
 *       cron: '0 9 * * *'
 *       timeout: 60
 * http:
 *   script:
 *     - match: ^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav
 *       name: 哔哩哔哩 Cookie
 *       type: request
 *       require-body: false
 * script-providers:
 *   哔哩哔哩签到:
 *     url: https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js
 *     interval: 86400
 */

const $ = new Env("哔哩哔哩");

const SCRIPT_VERSION = "2026-07-18.r1"; // 改一次 +1，确认拉到最新版
$.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}`);

const CK_KEY = "bilibili_data";

// ─── 抓 Cookie ───────────────────────────────────────────────────────────────
function getCookie() {
    const cookie =
        (typeof $request !== "undefined" &&
            ($request.headers?.Cookie || $request.headers?.cookie)) ||
        "";
    if (!cookie || !/SESSDATA=/.test(cookie)) {
        $.log("未获取到有效 Cookie（缺 SESSDATA），跳过");
        return;
    }
    $.setdata(cookie, CK_KEY);
    $.msg($.name, "", "✅ 哔哩哔哩 Cookie 获取成功");
}

// ─── 签到主逻辑 ──────────────────────────────────────────────────────────────
async function main() {
    const cookie = $.getdata(CK_KEY);
    if (!cookie) {
        $.msg($.name, "❌ 未获取到 Cookie", "请先抓取");
        return;
    }

    // TODO: 替换为真实签到接口与成功判断
    const res = await $.get({
        url: "https://api.live.bilibili.com/pay/v1/SilverHeart/getSilver",
        headers: { Cookie: cookie, "User-Agent": "Mozilla/5.0" },
    });

    let ok = false;
    let detail = "";
    try {
        const data = JSON.parse(res.body || "{}");
        ok = data && data.code === 0;
        detail = JSON.stringify(data).slice(0, 200);
    } catch (e) {
        detail = String(res.body || res).slice(0, 200);
    }

    $.msg($.name, ok ? "✅ 签到成功" : "❌ 签到失败", detail);
}

// ─── 入口 ────────────────────────────────────────────────────────────────────
if (typeof $request !== "undefined") {
    getCookie();
    $.done({});
} else {
    (async () => {
        if (JSON.parse($.getdata("bilibili_clear") || "false")) {
            $.setdata("", CK_KEY);
            $.setdata("false", "bilibili_clear");
            $.msg($.name, "", "✅ Cookie 已清除，请重新抓取");
            return;
        }
        await main();
    })()
        .catch((e) => $.msg($.name, "❌ 运行异常", String(e.message || e)))
        .finally(() => $.done({}));
}

// ─── Env 类（内联，兼容 Loon / Surge / Stash / Quantumult X / Node）──────────
// prettier-ignore
function Env(t) { return new class { constructor(t) { this.name = t, this.startTime = new Date().getTime(), this.logSeparator = "\n", this.logs = [], this.isMute = !1, this.encoding = "utf-8", this.isNode() ? (this.fs = require("fs"), this.path = require("path"), this.dataFile = this.path.resolve(process.cwd(), "boxjs.json"), this.fs.existsSync(this.dataFile) || this.fs.writeFileSync(this.dataFile, "{}"), this.data = this.loadData()) : this.data = {} } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } isStash() { return "undefined" != typeof $environment && $environment["stash-version"] } loadData() { if (this.isNode()) { try { return JSON.parse(this.fs.readFileSync(this.dataFile)) } catch (e) { return {} } } return {} } getdata(t) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.read(t); if (this.isQuanX()) return $prefs.valueForKey(t); if (this.isNode()) return this.data[t] || "" } setdata(t, e) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.write(t, e); if (this.isQuanX()) return $prefs.setValueForKey(t, e); if (this.isNode()) return this.data[e] = t, this.fs.writeFileSync(this.dataFile, JSON.stringify(this.data)), !0 } get(t) { return this.send(t, "GET") } post(t) { return this.send(t, "POST") } send(t, e) { return new Promise((s, i) => { if (this.isSurge() || this.isLoon() || this.isStash()) { "GET" === e ? $httpClient.get(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) : $httpClient.post(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) } else if (this.isQuanX()) { t.method = e, $task.fetch(t).then(t => s({ status: t.statusCode, headers: t.headers, body: t.body }), t => i(t)) } else if (this.isNode()) { const o = require(t.url.startsWith("https:") ? "https" : "http"), r = new URL(t.url), n = { method: e, hostname: r.hostname, port: r.port || (r.protocol === "https:" ? 443 : 80), path: r.pathname + r.search, headers: t.headers || {} }; const req = o.request(n, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => s({ status: res.statusCode, headers: res.headers, body: d })) }); req.on("error", i); if (t.body) req.write(t.body); req.end() } }) } msg(t, e, s) { if (this.isMute) return; if (this.isSurge() || this.isLoon() || this.isStash()) $notification.post(t, e || "", s || ""); else if (this.isQuanX()) $notify(t, e || "", s || ""); else if (this.isNode()) console.log(`\n${t}\n${e || ""}\n${s || ""}`) } log(...t) { this.logs.push(t.join(this.logSeparator)), console.log(t.join(this.logSeparator)) } logErr(t) { this.log(`❌ ${t.message || t}`) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { if (this.isQuanX()) $done(t); else if (this.isSurge() || this.isLoon() || this.isStash()) $done(t) } }(t) }

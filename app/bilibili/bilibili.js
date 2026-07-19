/**
 * 哔哩哔哩 · 每日等级任务
 *
 * 抓取：打开哔哩哔哩 App → 首页 → 触发 fingerprint 接口 → 抓 Cookie（含 SESSDATA/bili_jct）+ access_key
 * 签到：cron 每日登录/观看/分享/投币/银瓜子兑换硬币（拿满额升级经验）
 *
 * @Author: MyCookieCenter <https://github.com/owner/repo>
 * @Reference: MartinsKing(@ClydeTime)、SocialSisterYi(Bilibili-API-Collect)
 * @Updated: 2026-07-18
 *
 * ===== Loon =====
 * [MITM] hostname = app.bilibili.com
 * [Script]
 * http-request ^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\? tag=哔哩哔哩 Cookie, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js, requires-body=false
 * cron "30 7 * * *" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enable=true
 *
 * ===== Surge =====
 * [MITM] hostname = app.bilibili.com
 * [Script]
 * 哔哩哔哩 Cookie = type=http-request,pattern=^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\?,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
 * 哔哩哔哩签到 = type=cron,cronexp=30 7 * * *,timeout=60,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
 *
 * ===== Quantumult X =====
 * [MITM] hostname = app.bilibili.com
 * [rewrite_local]
 * ^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\? url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
 * [task_local]
 * 30 7 * * * https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enabled=true
 *
 * ===== Stash =====
 * [MITM] hostname = app.bilibili.com
 * cron:
 *   script:
 *     - name: 哔哩哔哩签到
 *       cron: '30 7 * * *'
 *       timeout: 60
 * http:
 *   script:
 *     - match: ^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\?
 *       name: 哔哩哔哩 Cookie
 *       type: request
 *       require-body: false
 * script-providers:
 *   哔哩哔哩签到:
 *     url: https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
 *     interval: 86400
 */

const $ = new Env("哔哩哔哩");

const SCRIPT_VERSION = "2026-07-18.r2"; // 改一次 +1，确认拉到最新版
$.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}`);

const CK_KEY = "bilibili_data";
const APPKEY = "27eb53fc9058f8c3";
const APPSECRET = "c2ed53a74eeefe3cf99fbd01d8c9c375";
const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/621.1.15.10.7 (KHTML, like Gecko) Mobile/22E252 BiliApp/84400100 os/ios mobi_app/iphone build/84400100";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function parseCookie(str) {
    const obj = {};
    (str || "").split(";").forEach((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return;
        obj[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
    });
    return obj;
}

function safeJsonParse(text, fallback = null) {
    try {
        return JSON.parse(text);
    } catch (e) {
        return fallback;
    }
}

function extractAccessKey(url) {
    return url?.match(/[?&]access_key=([^&]*)/)?.[1] || "";
}

// 把对象按 key 排序后拼成 key=value&key=value（用于 app 签名）
function queryStr(obj) {
    return Object.keys(obj)
        .sort()
        .map((k) => `${k}=${obj[k]}`)
        .join("&");
}

// B站 App 签名：md5(排序后的 queryStr + appsecret)
function generateSign(params) {
    return md5(queryStr(params) + APPSECRET);
}

function ts() {
    return Math.floor(Date.now() / 1000);
}

function loadConfig() {
    return safeJsonParse($.getdata(CK_KEY) || "{}", {});
}

function saveConfig(cfg) {
    $.setdata(JSON.stringify(cfg), CK_KEY);
}

// ─── 抓 Cookie（http-request 触发）────────────────────────────────────────────
function getCookie() {
    const cookieStr =
        (typeof $request !== "undefined" &&
            ($request.headers?.Cookie || $request.headers?.cookie)) ||
        "";
    if (!cookieStr || !/SESSDATA=/.test(cookieStr)) {
        $.log("未获取到有效 Cookie（缺 SESSDATA），跳过");
        return;
    }
    const fields = parseCookie(cookieStr);
    if (!fields.DedeUserID) {
        $.log("Cookie 缺少 DedeUserID，可能未登录");
        return;
    }
    // 从请求 URL 提取 access_key（App 端鉴权用）
    const access_key = extractAccessKey($request?.url);

    const cfg = loadConfig();
    const oldCookie = cfg.cookie;
    const oldAccessKey = cfg.access_key || "";
    // cookie 和 access_key 都未变更则跳过（避免频繁打扰）
    if (
        oldCookie &&
        oldCookie === cookieStr &&
        (!access_key || oldAccessKey === access_key)
    ) {
        $.log("- cookie 未变更，无需更新");
        return;
    }
    cfg.cookie = cookieStr;
    cfg.fields = fields;
    if (access_key) cfg.access_key = access_key;
    saveConfig(cfg);
    $.msg(
        $.name,
        oldCookie ? "检测到 cookie 已更新" : "首次获取 cookie",
        "🎉 cookie 存储成功"
    );
}

// ─── 用户信息 ─────────────────────────────────────────────────────────────────
async function me(cfg) {
    $.log("#### 用户信息");
    const res = await $.get({
        url: "https://api.bilibili.com/x/web-interface/nav",
        headers: { Cookie: cfg.cookie, "User-Agent": UA },
    });
    try {
        const body = safeJsonParse(res.body || "{}", {});
        if (body.code) {
            $.log("- ❌ 获取用户信息失败（请更新 cookie）");
            return false;
        }
        $.log("- 🎉 cookie 有效，任务即将开始 🎉");
        cfg.user = body.data;
        saveConfig(cfg);
        return true;
    } catch (e) {
        $.log("- 解析用户信息失败: " + e.message);
        return false;
    }
}

// ─── 任务状态查询 ──────────────────────────────────────────────────────────────
async function queryStatus(cfg) {
    $.log("#### 检查任务进行状况");
    const res = await $.get({
        url: "https://api.bilibili.com/x/member/web/exp/reward",
        headers: { Cookie: cfg.cookie, "User-Agent": UA },
    });
    try {
        const body = safeJsonParse(res.body || "{}", {});
        if (body.code !== 0) {
            $.log("- 查询失败: " + (body.message || ""));
            return { login: false, watch: false, coins: 0, share: false };
        }
        const d = body.data;
        cfg.status = d;
        saveConfig(cfg);
        $.log(
            `- 登录:${d.login ? "✓" : "✗"} 观看:${d.watch ? "✓" : "✗"} 分享:${d.share ? "✓" : "✗"
            } 已投币:${d.coins}`
        );
        return d;
    } catch (e) {
        $.log("- 解析任务状态失败: " + e.message);
        return { login: false, watch: false, coins: 0, share: false };
    }
}

// ─── 获取动态视频（用于观看/分享）──────────────────────────────────────────────
async function getVideo(cfg) {
    const headers = { Cookie: cfg.cookie, "User-Agent": UA };

    async function resolveCid(video) {
        if (video.cid) return video;
        const url = video.aid
            ? `https://api.bilibili.com/x/web-interface/view?aid=${video.aid}`
            : video.bvid
              ? `https://api.bilibili.com/x/web-interface/view?bvid=${video.bvid}`
              : "";
        if (!url) return video;
        const res = await $.get({ url, headers });
        const body = safeJsonParse(res.body || "{}", {});
        const cid = body?.data?.pages?.[0]?.cid;
        return cid ? { ...video, cid } : video;
    }

    function pushCard(list, card) {
        if (!card) return;
        const detail = safeJsonParse(card.card, {});
        const aid = card.desc?.rid || detail?.aid || "";
        const bvid = card.desc?.bvid || detail?.bvid || "";
        const cid =
            detail?.cid ||
            detail?.page?.cid ||
            detail?.pages?.[0]?.cid ||
            "";
        if (aid || bvid) {
            list.push({ aid, bvid, cid });
        }
    }

    const candidates = [];

    const dynRes = await $.get({
        url: `https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new?uid=${cfg.fields.DedeUserID}&type_list=8`,
        headers,
    });
    const dynBody = safeJsonParse(dynRes.body || "{}", {});
    const cards = dynBody?.data?.cards;
    if (Array.isArray(cards) && cards.length) {
        cards.forEach((card) => pushCard(candidates, card));
    }

    if (!candidates.length) {
        const popRes = await $.get({
            url: "https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1",
            headers,
        });
        const popBody = safeJsonParse(popRes.body || "{}", {});
        const list = popBody?.data?.list;
        if (Array.isArray(list) && list.length) {
            list.forEach((item) =>
                candidates.push({
                    aid: item?.aid || "",
                    bvid: item?.bvid || "",
                    cid: item?.cid || "",
                })
            );
        }
    }

    if (!candidates.length) {
        $.log("- 获取动态视频失败");
        return null;
    }

    const video = candidates[Math.floor(Math.random() * candidates.length)];
    const resolved = await resolveCid(video);
    if (!resolved.cid) {
        $.log("- 视频缺少 cid，跳过");
        return null;
    }
    return resolved;
}

async function getVideoLegacy(cfg) {
    const res = await $.get({
        url: `https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new?uid=${cfg.fields.DedeUserID}&type_list=8`,
        headers: { Cookie: cfg.cookie, "User-Agent": UA },
    });
    try {
        const body = JSON.parse(res.body || "{}");
        const cards = body?.data?.cards;
        if (!cards || !cards.length) {
            $.log("- 获取动态视频失败");
            return null;
        }
        const card = cards[Math.floor(Math.random() * cards.length)];
        const detail = JSON.parse(card.card);
        return {
            aid: card.desc.rid,
            bvid: card.desc.bvid,
            cid: detail.cid,
        };
    } catch (e) {
        $.log("- 解析动态失败: " + e.message);
        return null;
    }
}

// ─── 观看（登录）任务 ──────────────────────────────────────────────────────────
async function watch(cfg, video) {
    $.log("1️⃣ 观看任务");
    const body = {
        aid: video.aid,
        cid: video.cid,
        bvid: video.bvid,
        mid: cfg.fields.DedeUserID,
        csrf: cfg.fields.bili_jct,
        played_time: 1,
        real_played_time: 1,
        realtime: 1,
        start_ts: ts(),
        type: 3,
        dt: 2,
        play_type: 0,
        auto_continued_play: 0,
        spmid: 0,
        from_spmid: 0,
        refer_url: "https%3A%2F%2Ft.bilibili.com%2F",
        bsource: "",
        csrf_token: cfg.fields.bili_jct,
    };
    const res = await $.post({
        url: "https://api.bilibili.com/x/click-interface/web/heartbeat",
        headers: {
            Cookie: cfg.cookie,
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: queryStr(body),
    });
    try {
        const r = JSON.parse(res.body || "{}");
        $.log(r.code === 0 ? "- 观看成功" : "- 观看失败: " + (r.message || ""));
    } catch (e) {
        $.log("- 观看异常: " + e.message);
    }
}

// ─── 分享任务（需 app 签名）────────────────────────────────────────────────────
async function share(cfg, video) {
    $.log("2️⃣ 分享任务");
    const params = {
        access_key: cfg.access_key || "",
        actionKey: "appkey",
        appkey: APPKEY,
        build: "72700100",
        c_locale: "zh-Hans_CN",
        device: "phone",
        disable_rcmd: 0,
        mobi_app: "iphone",
        oid: video.aid,
        platform: "ios",
        s_locale: "zh-Hans_CN",
        share_channel: "WEIXIN",
        share_id: "main.ugc-video-detail.0.0.pv",
        share_origin: "vinfo_share",
        sid: video.cid,
        spm_id: "main.ugc-video-detail.0.0",
        csrf: cfg.fields.bili_jct,
        csrf_token: cfg.fields.bili_jct,
        statistics:
            '%7B%22appId%22%3A1%2C%22version%22%3A%228.44.0%22%2C%22abtest%22%3A%22%22%2C%22platform%22%3A1%7D',
        success: 1,
        ts: ts(),
    };
    params.sign = generateSign(params);
    const res = await $.post({
        url: "https://api.bilibili.com/x/share/finish",
        headers: {
            Cookie: cfg.cookie,
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: queryStr(params),
    });
    try {
        const r = JSON.parse(res.body || "{}");
        $.log(r.code === 0 ? "- 分享成功" : "- 分享失败: " + (r.message || ""));
    } catch (e) {
        $.log("- 分享异常: " + e.message);
    }
}

// ─── 投币任务（需 access_key）──────────────────────────────────────────────────
async function coin(cfg, aid) {
    const params = {
        access_key: cfg.access_key || "",
        aid,
        multiply: 1,
        select_like: 0,
        csrf: cfg.fields.bili_jct,
        csrf_token: cfg.fields.bili_jct,
    };
    const res = await $.post({
        url: "https://app.bilibili.com/x/v2/view/coin/add",
        headers: {
            Cookie: cfg.cookie,
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: queryStr(params),
    });
    try {
        const r = JSON.parse(res.body || "{}");
        if (r.code === 0) {
            $.log("- 投币成功");
            return true;
        }
        $.log("- 投币失败: " + (r.message || ""));
        return false;
    } catch (e) {
        $.log("- 投币异常: " + e.message);
        return false;
    }
}

// ─── 银瓜子兑换硬币 ───────────────────────────────────────────────────────────
async function silver2coin(cfg) {
    $.log("#### 银瓜子兑换硬币");
    const body = {
        csrf: cfg.fields.bili_jct,
        csrf_token: cfg.fields.bili_jct,
    };
    const res = await $.post({
        url: "https://api.live.bilibili.com/xlive/revenue/v1/wallet/silver2coin",
        headers: {
            Cookie: cfg.cookie,
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: queryStr(body),
    });
    try {
        const r = JSON.parse(res.body || "{}");
        if (r.code === 0) {
            $.log(`- 兑换成功: 获得 ${r.data.coin} 个硬币`);
        } else if (r.code === 34005) {
            $.log("- 今日银瓜子已兑换或不足");
        } else {
            $.log("- 兑换失败: " + (r.message || ""));
        }
    } catch (e) {
        $.log("- 兑换异常: " + e.message);
    }
}

// ─── 签到主流程 ────────────────────────────────────────────────────────────────
async function main() {
    const cfg = loadConfig();
    if (!cfg.cookie) {
        $.msg($.name, "❌ 未获取到 Cookie", "请先抓取");
        return;
    }

    if (!cfg.access_key) {
        $.log("- 未捕获到 access_key，分享/投币任务可能失败");
    }

    if (!(await me(cfg))) {
        $.msg($.name, "❌ 任务失败", "🤒 cookie 已失效，请更新");
        return;
    }

    const status = await queryStatus(cfg);
    const userInfo = cfg.user;
    const needCoins = Math.max(0, 5 - (status.coins || 0));

    // 登录/观看/分享：未完成则取动态视频执行
    if (!status.watch || !status.share) {
        const video = await getVideo(cfg);
        if (video) {
            if (!status.watch) await watch(cfg, video);
            if (!status.share) await share(cfg, video);
        }
    } else {
        $.log("- 今日观看/分享已完成");
    }

    // 投币：补满 5 次（需要硬币 ≥ 1）
    if (needCoins > 0) {
        $.log(`3️⃣ 投币任务（还需 ${needCoins} 次）`);
        const money = Math.floor(userInfo.money || 0);
        if (money < 1) {
            $.log("- 硬币不足，跳过投币");
        } else {
            for (let i = 0; i < needCoins && money - i > 0; i++) {
                // 简化：从关注动态取视频投币，复用 getVideo
                const v = await getVideo(cfg);
                if (v) {
                    const ok = await coin(cfg, v.aid);
                    if (!ok) break;
                    await $.wait(800);
                } else {
                    break;
                }
            }
        }
    } else {
        $.log("- 今日投币已完成");
    }

    // 银瓜子兑换
    await silver2coin(cfg);

    // 汇总通知
    const lv = userInfo.level_info || {};
    $.msg(
        `${$.name} [${userInfo.uname}]`,
        "✅ 每日等级任务已执行",
        `等级 ${lv.current_level} 级 · 经验 ${lv.current_exp}/${lv.next_exp} · 硬币 ${Math.floor(
            userInfo.money || 0
        )}`
    );
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

// ─── md5（标准实现，RFC 1321，非冲突命名）──────────────────────────────────────
// prettier-ignore
function md5(input) {
    function rl(x, n) { return (x << n) | (x >>> (32 - n)); }
    function au(x, y) {
        var x8 = x & 0x80000000, y8 = y & 0x80000000;
        var x4 = x & 0x40000000, y4 = y & 0x40000000;
        var r = (x & 0x3fffffff) + (y & 0x3fffffff);
        if (x4 & y4) return r ^ 0x80000000 ^ x8 ^ y8;
        if (x4 | y4) return r & 0x40000000 ? r ^ 0xc0000000 ^ x8 ^ y8 : r ^ 0x40000000 ^ x8 ^ y8;
        return r ^ x8 ^ y8;
    }
    function F(x, y, z) { return (x & y) | (~x & z); }
    function G(x, y, z) { return (x & z) | (y & ~z); }
    function H(x, y, z) { return x ^ y ^ z; }
    function I(x, y, z) { return y ^ (x | ~z); }
    function FF(a, b, c, d, x, s, t) { return au(rl(au(a, au(au(F(b, c, d), x), t)), s), b); }
    function GG(a, b, c, d, x, s, t) { return au(rl(au(a, au(au(G(b, c, d), x), t)), s), b); }
    function HH(a, b, c, d, x, s, t) { return au(rl(au(a, au(au(H(b, c, d), x), t)), s), b); }
    function II(a, b, c, d, x, s, t) { return au(rl(au(a, au(au(I(b, c, d), x), t)), s), b); }
    function toWords(s) {
        var len = s.length, nwt = len + 8, nw = ((nwt - nwt % 64) / 64 + 1) * 16, w = Array(nw - 1), bp, bc = 0, wc;
        while (bc < len) { wc = (bc - bc % 4) / 4; bp = (bc % 4) * 8; w[wc] = (w[wc] || 0) | (s.charCodeAt(bc) << bp); bc++; }
        wc = (bc - bc % 4) / 4; bp = (bc % 4) * 8; w[wc] = (w[wc] || 0) | (0x80 << bp); w[nw - 2] = len << 3; w[nw - 1] = len >>> 29; return w;
    }
    function toHex(v) {
        var out = "", tmp, i, b;
        for (i = 0; i <= 3; i++) { b = (v >>> (i * 8)) & 255; tmp = "0" + b.toString(16); out += tmp.substr(tmp.length - 2, 2); }
        return out;
    }
    function utf8(s) {
        s = s.replace(/\r\n/g, "\n");
        var out = "";
        for (var n = 0; n < s.length; n++) {
            var c = s.charCodeAt(n);
            if (c < 128) out += String.fromCharCode(c);
            else if (c > 127 && c < 2048) { out += String.fromCharCode((c >> 6) | 192); out += String.fromCharCode((c & 63) | 128); }
            else { out += String.fromCharCode((c >> 12) | 224); out += String.fromCharCode(((c >> 6) & 63) | 128); out += String.fromCharCode((c & 63) | 128); }
        }
        return out;
    }
    var x, k, A1, B1, C1, D1, a, b, c, d;
    var S11 = 7, S12 = 12, S13 = 17, S14 = 22, S21 = 5, S22 = 9, S23 = 14, S24 = 20;
    var S31 = 4, S32 = 11, S33 = 16, S34 = 23, S41 = 6, S42 = 10, S43 = 15, S44 = 21;
    x = toWords(utf8(input));
    a = 0x67452301; b = 0xefcdab89; c = 0x98badcfe; d = 0x10325476;
    for (k = 0; k < x.length; k += 16) {
        A1 = a; B1 = b; C1 = c; D1 = d;
        a = FF(a, b, c, d, x[k + 0], S11, 0xd76aa478); d = FF(d, a, b, c, x[k + 1], S12, 0xe8c7b756);
        c = FF(c, d, a, b, x[k + 2], S13, 0x242070db); b = FF(b, c, d, a, x[k + 3], S14, 0xc1bdceee);
        a = FF(a, b, c, d, x[k + 4], S11, 0xf57c0faf); d = FF(d, a, b, c, x[k + 5], S12, 0x4787c62a);
        c = FF(c, d, a, b, x[k + 6], S13, 0xa8304613); b = FF(b, c, d, a, x[k + 7], S14, 0xfd469501);
        a = FF(a, b, c, d, x[k + 8], S11, 0x698098d8); d = FF(d, a, b, c, x[k + 9], S12, 0x8b44f7af);
        c = FF(c, d, a, b, x[k + 10], S13, 0xffff5bb1); b = FF(b, c, d, a, x[k + 11], S14, 0x895cd7be);
        a = FF(a, b, c, d, x[k + 12], S11, 0x6b901122); d = FF(d, a, b, c, x[k + 13], S12, 0xfd987193);
        c = FF(c, d, a, b, x[k + 14], S13, 0xa679438e); b = FF(b, c, d, a, x[k + 15], S14, 0x49b40821);
        a = GG(a, b, c, d, x[k + 1], S21, 0xf61e2562); d = GG(d, a, b, c, x[k + 6], S22, 0xc040b340);
        c = GG(c, d, a, b, x[k + 11], S23, 0x265e5a51); b = GG(b, c, d, a, x[k + 0], S24, 0xe9b6c7aa);
        a = GG(a, b, c, d, x[k + 5], S21, 0xd62f105d); d = GG(d, a, b, c, x[k + 10], S22, 0x2441453);
        c = GG(c, d, a, b, x[k + 15], S23, 0xd8a1e681); b = GG(b, c, d, a, x[k + 4], S24, 0xe7d3fbc8);
        a = GG(a, b, c, d, x[k + 9], S21, 0x21e1cde6); d = GG(d, a, b, c, x[k + 14], S22, 0xc33707d6);
        c = GG(c, d, a, b, x[k + 3], S23, 0xf4d50d87); b = GG(b, c, d, a, x[k + 8], S24, 0x455a14ed);
        a = GG(a, b, c, d, x[k + 13], S21, 0xa9e3e905); d = GG(d, a, b, c, x[k + 2], S22, 0xfcefa3f8);
        c = GG(c, d, a, b, x[k + 7], S23, 0x676f02d9); b = GG(b, c, d, a, x[k + 12], S24, 0x8d2a4c8a);
        a = HH(a, b, c, d, x[k + 5], S31, 0xfffa3942); d = HH(d, a, b, c, x[k + 8], S32, 0x8771f681);
        c = HH(c, d, a, b, x[k + 11], S33, 0x6d9d6122); b = HH(b, c, d, a, x[k + 14], S34, 0xfde5380c);
        a = HH(a, b, c, d, x[k + 1], S31, 0xa4beea44); d = HH(d, a, b, c, x[k + 4], S32, 0x4bdecfa9);
        c = HH(c, d, a, b, x[k + 7], S33, 0xf6bb4b60); b = HH(b, c, d, a, x[k + 10], S34, 0xbebfbc70);
        a = HH(a, b, c, d, x[k + 13], S31, 0x289b7ec6); d = HH(d, a, b, c, x[k + 0], S32, 0xeaa127fa);
        c = HH(c, d, a, b, x[k + 3], S33, 0xd4ef3085); b = HH(b, c, d, a, x[k + 6], S34, 0x4881d05d);
        a = HH(a, b, c, d, x[k + 9], S31, 0xd9d4d039); d = HH(d, a, b, c, x[k + 14], S32, 0xe6db99e5);
        c = HH(c, d, a, b, x[k + 3], S33, 0x1fa27cf8); b = HH(b, c, d, a, x[k + 12], S34, 0xc4ac5665);
        a = II(a, b, c, d, x[k + 0], S41, 0xf4292244); d = II(d, a, b, c, x[k + 7], S42, 0x432aff97);
        c = II(c, d, a, b, x[k + 14], S43, 0xab9423a7); b = II(b, c, d, a, x[k + 5], S44, 0xfc93a039);
        a = II(a, b, c, d, x[k + 12], S41, 0x655b59c3); d = II(d, a, b, c, x[k + 3], S42, 0x8f0ccc92);
        c = II(c, d, a, b, x[k + 10], S43, 0xffeff47d); b = II(b, c, d, a, x[k + 1], S44, 0x85845dd1);
        a = II(a, b, c, d, x[k + 8], S41, 0x6fa87e4f); d = II(d, a, b, c, x[k + 15], S42, 0xfe2ce6e0);
        c = II(c, d, a, b, x[k + 6], S43, 0xa3014314); b = II(b, c, d, a, x[k + 13], S44, 0x4e0811a1);
        a = II(a, b, c, d, x[k + 4], S41, 0xf7537e82); d = II(d, a, b, c, x[k + 11], S42, 0xbd3af235);
        c = II(c, d, a, b, x[k + 2], S43, 0x2ad7d2bb); b = II(b, c, d, a, x[k + 9], S44, 0xeb86d391);
        a = au(a, A1); b = au(b, B1); c = au(c, C1); d = au(d, D1);
    }
    return (toHex(a) + toHex(b) + toHex(c) + toHex(d)).toLowerCase();
}

// ─── Env 类（内联，兼容 Loon / Surge / Stash / Quantumult X / Node）──────────
// prettier-ignore
function Env(t) { return new class { constructor(t) { this.name = t, this.startTime = new Date().getTime(), this.logSeparator = "\n", this.logs = [], this.isMute = !1, this.encoding = "utf-8", this.isNode() ? (this.fs = require("fs"), this.path = require("path"), this.dataFile = this.path.resolve(process.cwd(), "boxjs.json"), this.fs.existsSync(this.dataFile) || this.fs.writeFileSync(this.dataFile, "{}"), this.data = this.loadData()) : this.data = {} } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } isStash() { return "undefined" != typeof $environment && $environment["stash-version"] } loadData() { if (this.isNode()) { try { return JSON.parse(this.fs.readFileSync(this.dataFile)) } catch (e) { return {} } } return {} } getdata(t) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.read(t); if (this.isQuanX()) return $prefs.valueForKey(t); if (this.isNode()) return this.data[t] || "" } setdata(t, e) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.write(t, e); if (this.isQuanX()) return $prefs.setValueForKey(t, e); if (this.isNode()) return this.data[e] = t, this.fs.writeFileSync(this.dataFile, JSON.stringify(this.data)), !0 } get(t) { return this.send(t, "GET") } post(t) { return this.send(t, "POST") } send(t, e) { return new Promise((s, i) => { if (this.isSurge() || this.isLoon() || this.isStash()) { "GET" === e ? $httpClient.get(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) : $httpClient.post(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) } else if (this.isQuanX()) { t.method = e, $task.fetch(t).then(t => s({ status: t.statusCode, headers: t.headers, body: t.body }), t => i(t)) } else if (this.isNode()) { const o = require(t.url.startsWith("https:") ? "https" : "http"), r = new URL(t.url), n = { method: e, hostname: r.hostname, port: r.port || (r.protocol === "https:" ? 443 : 80), path: r.pathname + r.search, headers: t.headers || {} }; const req = o.request(n, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => s({ status: res.statusCode, headers: res.headers, body: d })) }); req.on("error", i); if (t.body) req.write(t.body); req.end() } }) } msg(t, e, s) { if (this.isMute) return; if (this.isSurge() || this.isLoon() || this.isStash()) $notification.post(t, e || "", s || ""); else if (this.isQuanX()) $notify(t, e || "", s || ""); else if (this.isNode()) console.log(`\n${t}\n${e || ""}\n${s || ""}`) } log(...t) { this.logs.push(t.join(this.logSeparator)), console.log(t.join(this.logSeparator)) } logErr(t) { this.log(`❌ ${t.message || t}`) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { if (this.isQuanX()) $done(t); else if (this.isSurge() || this.isLoon() || this.isStash()) $done(t) } }(t) }

/**
 * 腾讯视频 · VIP 每日签到(V力值) · App 直抓版
 *
 * 抓取:直接在「腾讯视频」App 里进会员中心即可,不需要浏览器/小程序
 * 签到:cron 自动续期后签到
 *
 * @Author: @WowYiJiu
 * @Modifier: MaYIHEI <https://github.com/MaYIHEI/paperclip>
 * @Updated: 2026-11-23  (App 直抓 + Cookie 合并 + 续期双通道)
 *
 * ===== 相对 2026-10-28.r3 的改动 =====
 * 1) App 直抓:抓取正则从「只认 pbaccess」放宽到 vip / pbaccess / access / film。
 *    App 的会员中心是 WebView,签到任务列表走 vip.video.qq.com/.../ReadTaskList,
 *    这正是 WowYiJiu 原版的抓点 —— 之前的版本把它过滤掉了,所以只能靠小程序。
 * 2) 增量合并:不再整串覆盖。某次请求只带 vusession 时,不会再把已有的
 *    refresh_token 冲掉(这是「抓到了但 cron 说缺 refresh_token」的元凶)。
 * 3) 字段别名:QQ 登录(vqq_*)与微信登录(不带前缀)两套字段名都识别,
 *    写回时只写原本存在的那个名字,不凭空塞不存在的字段。
 * 4) 续期双通道:App 的 Account/Refresh 失败时,回放网页 NewRefresh 的 body 兜底。
 * 5) 续期收割:App 自己调续期接口时,把滚动后的 vusession / vurefresh / Set-Cookie 收下来。
 * 6) 通知降噪:只有登录身份(vuid + refresh_token)变了才弹「已更新」,vusession 轮换静默。
 *
 * ===== Loon =====
 * [MITM]
 * hostname = vip.video.qq.com, pbaccess.video.qq.com, access.video.qq.com, film.video.qq.com
 * [Script]
 * request  if ${url} ~= /^https:\/\/(vip|pbaccess|access|film)\.video\.qq\.com\//i then script("https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/tenvideo/tenvideo.js") with tag="腾讯视频 Cookie", img_url="https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/tenvideo.png", requires_body=true
 * response if ${url} ~= /^https:\/\/pbaccess\.video\.qq\.com\/(trpc\.anywhere_door\.account\.Account\/Refresh|trpc\.video_account_login\.web_login_trpc\.WebLoginTrpc\/NewRefresh)/i then script("https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/tenvideo/tenvideo.js") with tag="腾讯视频 续期收割", requires_body=true
 * cron "10 0 * * *" then script("https://raw.githubusercontent.com/MaYIHEI/paperclip/refs/heads/main/app/tenvideo/tenvideo.js") with tag="腾讯视频签到", img_url="https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/tenvideo.png"
 */

const $ = new Env("腾讯视频");

// 插件参数(Loon 的 $argument 是对象;也兼容持久化的同名键,方便 BoxJS 侧开关)
const ARG = typeof $argument === "object" && $argument ? $argument : {};
const argOn = (v, key) => v === true || v === "true" || $.getdata(key) === "true";

// 四个开关:抓取 / 签到 / 抽奖 / 领券。不传参数时默认都开,老配置不改也能直接跑。
const CAPTURE_ON = ARG.capture === undefined ? true : argOn(ARG.capture, "tenvideo_capture");
const CHECKIN_ON = ARG.checkin === undefined ? true : argOn(ARG.checkin, "tenvideo_checkin");
const LOTTERY_ON = ARG.lottery === undefined ? true : argOn(ARG.lottery, "tenvideo_lottery");
const COUPON_ON = ARG.coupon === undefined ? true : argOn(ARG.coupon, "tenvideo_coupon");

// 补签入口:请求 http://1.1.1.1/checkin/tenvideo 时现跑一次签到,跑完把本脚本的签到状态作为响应返回
const CHECKIN_RUN = typeof $request !== "undefined" && /^http:\/\/1\.1\.1\.1\/checkin\//.test($request.url);
if (CHECKIN_RUN) {
    const end = $.done.bind($);
    $.done = () => end({ response: { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" }, body: $.getdata("tenvideo_status") || "{}" } });
}

const SCRIPT_VERSION = "2026-11-26.r4";
$.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}  抓取=${CAPTURE_ON ? "开" : "关"} 签到=${CHECKIN_ON ? "开" : "关"}`);

// ---------- 存储键 ----------
const K = {
    cookie: "tenvideo_cookie", // 合并后的完整 cookie(含滚动后的续期令牌)
    status: "tenvideo_status", // 签到体检结果(签到合集协议 v1)
    webCookie: "tenvideo_refresh_cookie", // 网页 NewRefresh 的 cookie(续期兜底)
    webBody: "tenvideo_refresh_body", // 网页 NewRefresh 的 body(续期兜底)
    renewTs: "tenvideo_renew_ts", // 上次续期成功时间
    renewVia: "tenvideo_renew_via", // 上次续期走的通道
    capVia: "tenvideo_cap_via", // 上次抓取来源(排障用)
    lotteryPool: "tenvideo_lottery_pool", // 上次抽中的奖池,下次优先试
    lotteryStatus: "tenvideo_lottery_status", // 最近一次抽奖结果
};

// ---------- 接口 ----------
// App 账号网关:用 vuid + vusession + vurefresh 换新 vusession(vusession 只有 2 小时)
const REFRESH_APP = "https://pbaccess.video.qq.com/trpc.anywhere_door.account.Account/Refresh?vplatform=5";
// 网页登录网关:兜底通道,回放抓到的 body
const REFRESH_WEB = "https://pbaccess.video.qq.com/trpc.video_account_login.web_login_trpc.WebLoginTrpc/NewRefresh";
const CHECKIN_URL = "https://vip.video.qq.com/rpc/trpc.new_task_system.task_system.TaskSystem/CheckIn?rpc_data=%7B%7D";
const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

// App / 会员中心 WebView 带登录态的请求都在这些域上
const CAP_HOST_RE = /^https:\/\/(vip|pbaccess|access|film|m)\.video\.qq\.com\//i;
const RENEW_RE = /^https:\/\/pbaccess\.video\.qq\.com\/(trpc\.anywhere_door\.account\.Account\/Refresh|trpc\.video_account_login\.web_login_trpc\.WebLoginTrpc\/NewRefresh)/i;

// ---------- 抽奖 / 领券 ----------
// activity.video.qq.com/fcgi-bin/asyn_activity
//   抽奖  type=100143 option=100  → { lotter_result:1, prize_list:[{lotter_name,cdkey,lotter_url_h5}] }
//   查资格 type=100143 option=104  → ret=0 success / ret=-904 无资格
//   领券  type=100160 option=100  → { receive_result, msg }
//   券状态 type=100160 option=101  → { data:{has_right,left_times,status} }
const ACT_API = "https://activity.video.qq.com/fcgi-bin/asyn_activity";
const LOTTERY_ACT = "trr69dwle61dwisptr12gj12ja"; // 新积分抽奖
const LOTTERY_POOLS = ["43kwa67scker73ia85gjq8ch11", "xh94kpfpi2xoiljhxiu3epss4g"];
const COUPONS = [
    { act: "tr607p8587ii7zp53eog20y565", module: "gopzyc36eow5c4a7ed8z8szll9", name: "嘿影电影票福利" },
    { act: "z4lpthi9h219lifagkksheez25", module: "zjp5wau2y18riskxwek98fdcqg", name: "138元美团券包" },
];
const ACT_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A465 QQLiveBrowser/9.04.75 AppType/UN WebKitCore/WKWebView iOS cellPhone/iPhone 16e AppBuild/25247";

$.messages = [];

// 三套字段命名并存:
//   QQ 登录    → vqq_vuserid  / vqq_vusession  / vqq_refresh_token
//   微信登录   → vuserid      / vusession      / refresh_token  (或 v_t_*)
//   手机号登录 → v_vuserid    / v_vusession    / v_vurefresh    ★ 之前漏了这行
// 手机号登录的续期令牌叫 v_vurefresh 而不是 *_refresh_token,这是「有 cookie 却续不了期」的根因。
const ALIAS = {
    vuid: ["vqq_vuserid", "v_vuserid", "vuserid"],
    vusession: ["vqq_vusession", "v_vusession", "vusession"],
    refresh: ["vqq_refresh_token", "v_vurefresh", "vurefresh", "refresh_token", "v_t_refresh_token"],
    login: ["main_login", "v_main_login"],
};

// ============ Cookie 工具 ============

function normalizeCookie(raw) {
    if (!raw) return "";
    if (Array.isArray(raw)) raw = raw.join("; ");
    return String(raw)
        .split(/;|\r?\n/)
        .map((p) => p.replace(/^cookie\s*:\s*/i, "").trim())
        .filter(Boolean)
        .join("; ");
}

// 解析成 Map,保留原始顺序,便于原样回写
function parseCookie(str) {
    const map = new Map();
    for (const part of String(str || "").split(";")) {
        const i = part.indexOf("=");
        if (i <= 0) continue;
        const k = part.slice(0, i).trim();
        const v = part.slice(i + 1).trim();
        if (k) map.set(k, v);
    }
    return map;
}

function serializeCookie(map) {
    const out = [];
    for (const [k, v] of map) if (k) out.push(`${k}=${v}`);
    return out.join("; ");
}

// 精确匹配字段名,避免 "vusession" 命中 "vqq_vusession"
function getCookieVal(cookie, name) {
    const m = new RegExp(`(?:^|;)\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`).exec(String(cookie || ""));
    return m ? m[1] : "";
}

function setCookieVal(cookie, name, value) {
    const map = parseCookie(cookie);
    map.set(name, value);
    return serializeCookie(map);
}

// 按别名表取字段,返回 { field, value };field 用来写回原位
function pick(cookie, kind) {
    for (const name of ALIAS[kind]) {
        const v = getCookieVal(cookie, name);
        if (v) return { field: name, value: v };
    }
    return { field: "", value: "" };
}

// 增量合并:旧值打底,新值覆盖非空字段。绝不因为新请求缺某字段就把它删掉。
function mergeCookie(oldCookie, newCookie) {
    const map = parseCookie(oldCookie);
    for (const [k, v] of parseCookie(newCookie)) if (v) map.set(k, v);
    return serializeCookie(map);
}

// 至少有一个登录凭证才算「有效抓取」,否则不许覆盖旧 cookie
function hasAuth(cookie) {
    return !!(pick(cookie, "refresh").value || pick(cookie, "vusession").value);
}

// 身份指纹:vuid + refresh_token。只有它变了才值得弹通知。
function identityOf(cookie) {
    if (!cookie) return ""; // 空 cookie 必须返回空串,否则首次抓取会误判成"已存在"
    return pick(cookie, "vuid").value + "|" + pick(cookie, "refresh").value;
}

// 把响应的 Set-Cookie 合并进 cookie
function mergeSetCookie(cookie, headers) {
    try {
        const sc = lowerKeys(headers)["set-cookie"];
        if (!sc) return cookie;
        const list = Array.isArray(sc) ? sc : String(sc).split(/\n/);
        const map = parseCookie(cookie);
        for (const line of list) {
            const m = /^\s*([^=;\s]+)=([^;]*)/.exec(String(line).replace(/^set-cookie:\s*/i, ""));
            if (!m || !m[1] || !m[2]) continue;
            if (/^(expires|domain|path|max-age|priority|samesite|secure|httponly|version|comment)$/i.test(m[1])) continue;
            map.set(m[1], m[2]);
        }
        return serializeCookie(map);
    } catch (e) {
        $.log(`[WARN] 合并 Set-Cookie 失败: ${e}`);
        return cookie;
    }
}

function lowerKeys(obj) {
    if (!obj) return {};
    const out = {};
    for (const k of Object.keys(obj)) out[k.toLowerCase()] = obj[k];
    return out;
}

function hostOf(url) {
    const m = /^https?:\/\/([^/?#]+)/i.exec(String(url || ""));
    return m ? m[1] : "?";
}

// ============ 抓取(request 阶段)============

function captureFromRequest() {
    try {
        if (!CAPTURE_ON) return;
        if ($request.method === "OPTIONS") return;
        const url = $request.url || "";
        if (!CAP_HOST_RE.test(url)) return;

        const incoming = normalizeCookie(lowerKeys($request.headers)["cookie"]);
        if (!incoming) return;

        // 网页刷新接口的 cookie + body 留一份,续期兜底时回放
        if (/web_login_trpc\.WebLoginTrpc\/NewRefresh/i.test(url) && $request.body && hasAuth(incoming)) {
            $.setdata(incoming, K.webCookie);
            $.setdata(String($request.body), K.webBody);
        }

        if (!hasAuth(incoming)) return;

        const old = $.getdata(K.cookie) || "";
        const merged = mergeCookie(old, incoming);
        if (merged === old) return; // 没变化:不写盘、不弹通知

        $.setdata(merged, K.cookie);
        const rtNow = !!pick(merged, "refresh").value;
        $.setdata(`App·${hostOf(url)}·${rtNow ? "有RT" : "仅会话"}`, K.capVia);

        const idBefore = identityOf(old);
        const idAfter = identityOf(merged);
        $.log(`[capture] ${hostOf(url)} len=${merged.length} refresh_token=${rtNow ? "有" : "无"} 身份变化=${idBefore !== idAfter}`);

        if (!idBefore) {
            $.setdata("", K.status); // 全新 cookie,旧体检结果作废
            notify("✅ 腾讯视频 Cookie 获取成功", rtNow ? "已含续期令牌,自动签到已可用" : "只有会话令牌,建议再进一次会员中心");
        } else if (idBefore !== idAfter) {
            $.setdata("", K.status);
            notify("✅ 腾讯视频 Cookie 已更新", "登录账号或续期令牌变了");
        } else {
            $.log("[capture] 仅会话轮换,已静默更新");
        }
    } catch (e) {
        $.log(`[ERROR] 抓取异常: ${e}`);
    }
}

// ============ 续期收割(response 阶段)============

function captureFromResponse() {
    try {
        if (!CAPTURE_ON) return;
        const url = ($request && $request.url) || "";
        if (!RENEW_RE.test(url)) return;

        const reqCookie = normalizeCookie(lowerKeys(($request && $request.headers) || {})["cookie"]);
        const old = $.getdata(K.cookie) || "";
        let merged = mergeSetCookie(mergeCookie(old, reqCookie), $response.headers);

        const body = $response.body;
        if (typeof body === "string" && body) {
            const o = safeJSON(body);
            const d = (o && (o.data || o)) || null;
            const sess = d && d.vusession;
            const ref = d && (d.vurefresh || d.refresh_token);
            if (sess) {
                const f = pick(merged, "vusession").field;
                if (f) merged = setCookieVal(merged, f, sess);
            }
            if (ref) {
                const f = pick(merged, "refresh").field || "vqq_refresh_token";
                merged = setCookieVal(merged, f, ref);
                $.log("[harvest] 收到滚动后的 refresh_token,已落库");
            }
        }

        if (hasAuth(merged) && merged !== old) {
            $.setdata(merged, K.cookie);
            $.log(`[harvest] 续期响应已收割 ${old.length}→${merged.length}`);
        }
    } catch (e) {
        $.log(`[ERROR] 响应收割异常: ${e}`);
    }
}

// ============ 续期(cron 阶段)============

// 返回 { cookie, via } 或 null
async function renewSession(cookie) {
    const vuid = pick(cookie, "vuid").value;
    const sess = pick(cookie, "vusession").value;
    const rt = pick(cookie, "refresh").value;
    $.log(`[检测] 版本=${SCRIPT_VERSION} vuid=${vuid || "空"} vusession=${sess ? "有" : "无"} refresh_token=${rt ? "有" : "无"} 登录=${pick(cookie, "login").value || "?"}`);
    // 没有 refresh_token 时,把实际存在的字段名打出来,便于定位是哪种登录方式
    if (!rt) {
        const names = [...parseCookie(cookie).keys()];
        const interesting = names.filter((n) => /session|refresh|token|userid|openid|login|vuser/i.test(n));
        $.log(`[字段] 共 ${names.length} 个,与登录相关的: ${interesting.join(", ") || "无"}`);
    }

    // 通道 A:App 账号网关
    if (rt) {
        const body = JSON.stringify({ vuid: Number(vuid) || vuid, vusession: sess, vurefresh: rt });
        const rf = await req("POST", REFRESH_APP, cookie, body);
        debug(rf, "Account/Refresh");
        const d = (rf && (rf.data || rf)) || {};
        if (rf && d.vusession) {
            const out = applyRenew(cookie, rf, d.vusession, d.vurefresh || d.refresh_token);
            $.log(`[续期A] 成功 vusession 长度=${String(d.vusession).length} 令牌滚动=${d.vurefresh || d.refresh_token ? "是" : "否"}`);
            return { cookie: out, via: "app", rolled: !!(d.vurefresh || d.refresh_token) };
        }
        $.log(`[续期A] 失败: ${rf ? briefOf(rf) : "无响应"}`);
    } else {
        $.log("[续期A] 跳过:没有 refresh_token");
    }

    // 通道 B:回放网页 NewRefresh 的 body
    const webBody = $.getdata(K.webBody);
    const webCookie = $.getdata(K.webCookie);
    if (webBody && webCookie) {
        $.log("[续期B] 回放网页 NewRefresh");
        const rf = await req("POST", REFRESH_WEB, webCookie, webBody);
        debug(rf, "NewRefresh");
        const d = (rf && (rf.data || rf)) || {};
        if (rf && d.vusession) {
            const out = applyRenew(mergeCookie(webCookie, cookie), rf, d.vusession, d.refresh_token);
            $.log(`[续期B] 成功 vusession 长度=${String(d.vusession).length}`);
            return { cookie: out, via: "web", rolled: !!d.refresh_token };
        }
        $.log(`[续期B] 失败: ${rf ? briefOf(rf) : "无响应"}`);
    } else {
        $.log("[续期B] 跳过:没有网页刷新凭据(只从 App 抓的话属正常)");
    }

    return null;
}

// 先吃 Set-Cookie,再用 body 覆盖 —— 顺序反了会被响应头里的旧值压回去
function applyRenew(cookie, resp, newSess, newRefresh) {
    let out = mergeSetCookie(cookie, resp && resp.headers);
    const sf = pick(out, "vusession").field;
    if (sf && newSess) out = setCookieVal(out, sf, newSess);
    if (newRefresh) {
        const rf = pick(out, "refresh").field || "vqq_refresh_token";
        out = setCookieVal(out, rf, newRefresh);
    }
    return out;
}

// ============ 签到 ============

// 15~30 秒随机延迟:避免每天同一秒打同一接口,降低风控特征
function randomDelay() {
    const sec = 15 + Math.floor(Math.random() * 16); // 15..30
    $.log(`[防风控] 随机延迟 ${sec} 秒后开始`);
    return new Promise((r) => setTimeout(r, sec * 1000));
}

// ---------- 活动接口(抽奖/领券共用) ----------

function actReq(url, act, cookie) {
    return new Promise((resolve) => {
        $.get(
            {
                url,
                headers: {
                    Cookie: cookie,
                    accept: "application/json, text/plain, */*",
                    "accept-language": "zh-CN,zh;q=0.9",
                    origin: "https://film.video.qq.com",
                    referer: `https://film.video.qq.com/magic-act/${act}/index_index.html`,
                    "User-Agent": ACT_UA,
                },
            },
            (err, resp, data) => {
                if (err) {
                    $.log(`[ERROR] 活动接口: ${$.toStr(err)}`);
                    return resolve(null);
                }
                try {
                    resolve(typeof data === "string" ? JSON.parse(data) : data);
                } catch {
                    $.log(`[ERROR] 活动接口解析失败: ${String(data).slice(0, 120)}`);
                    resolve(null);
                }
            }
        );
    });
}

function actUrl({ act, type, option, module, ptag, aid }) {
    const q = [
        "platform=7",
        `type=${type}`,
        `option=${option}`,
        `act_id=${act}`,
        `module_id=${module}`,
        `ptag=${ptag || ""}`,
        "is_prepublish=",
        `aid=${aid || "V0%2524%25248%253A900027"}`,
        "otype=xjson",
        `_ts=${Date.now()}`,
    ];
    return `${ACT_API}?${q.join("&")}`;
}

function poolOrder() {
    const last = $.getdata(K.lotteryPool);
    const list = LOTTERY_POOLS.slice();
    if (last && list.includes(last)) list.splice(list.indexOf(last), 1);
    return last ? [last].concat(list) : list;
}

// 抽奖。返回 { ok, text } —— ok=true 表示中奖，text 是通知正文
async function doLottery(cookie) {
    let authFail = false;
    for (const pool of poolOrder()) {
        const chk = await actReq(actUrl({ act: LOTTERY_ACT, type: 100143, option: 104, module: pool }), LOTTERY_ACT, cookie);
        if (!chk || chk.ret !== 0 || chk.msg !== "success") {
            const m = (chk && chk.msg) || "";
            $.log(`[抽奖资格] ${pool.slice(0, 10)}… ${chk ? chk.ret + " " + m : "无响应"}`);
            // 同领券：活动域返回未登录时不能当成"今天抽完"
            if ((chk && chk.ret === -102) || /未登录|not\s*login|请登录/i.test(m)) authFail = true;
            continue;
        }

        const res = await actReq(actUrl({ act: LOTTERY_ACT, type: 100143, option: 100, module: pool }), LOTTERY_ACT, cookie);
        if (res && res.lotter_result === 1) {
            const p = (res.prize_list && res.prize_list[0]) || {};
            $.setdata(pool, K.lotteryPool);
            $.setdata(JSON.stringify({ ok: true, prize: p.lotter_name || "", cdkey: p.cdkey || "", t: Date.now() }), K.lotteryStatus);
            const lines = [`🎉 抽奖中奖：${p.lotter_name || res.lotter_ext || "奖品"}`];
            if (p.cdkey) lines.push(`   CDKey：${p.cdkey}`);
            if (p.lotter_url_h5) lines.push(`   兑换：${p.lotter_url_h5}`);
            return { ok: true, text: lines.join("\n") };
        }
        $.log(`[抽奖] ${pool.slice(0, 10)}… ${res ? res.ret + " " + (res.msg || "") : "无响应"}`);
        // -904 = 该池今天没资格了，换下一个；其它错误也继续试
    }
    if (authFail) {
        return {
            ok: false,
            authFail: true,
            text: "❌ 抽奖：活动接口不认登录态（用户未登录）\n   👉 进腾讯视频会员中心重新抓一次 Cookie",
        };
    }
    return { ok: false, text: "🎲 抽奖：今日已抽完" };
}

// 领券。返回 { got: 成功条数, text, authFail?: true }
async function doCoupons(cookie) {
    const got = [];
    let authFail = false;
    const reasons = []; // 每张券没领到的真实原因，拼进通知
    for (const c of COUPONS) {
        // 1) 先查状态，没货就不浪费一次领取请求
        const st = await actReq(actUrl({ act: c.act, type: 100160, option: 101, module: c.module, ptag: "channel.rightmodule", aid: "V0%2524%25248%253A2003" }), c.act, cookie);
        const d = (st && st.data) || {};
        const stMsg = (st && st.msg) || "";
        $.log(`[券状态] ${c.name} has_right=${d.has_right} left=${d.left_times} status=${d.status} msg=${stMsg}`);

        // 活动接口不认 Cookie 时要单独标出来。ret=-102 / "用户未登录" 是典型值，
        // 只出现在活动域（activity.video.qq.com）上，签到域正常。
        if ((st && st.ret === -102) || /未登录|not\s*login|请登录/i.test(stMsg)) {
            authFail = true;
        }
        if (!st || st.ret !== 0 || !d.has_right) {
            // 区分三种「没领到」：
            //   已领完 / 总量领完 → 库存被抢光，明天早来或换券
            //   has_right=0 且无库存文案 → 账号今天没资格（可能已领过）
            //   其它 → 原样带出服务端文案，别丢信息
            if (/领完|领光了|已被领完|总量/.test(stMsg)) reasons.push(`${c.name}：已被抢光`);
            else if (d.has_right === 0 && !stMsg) reasons.push(`${c.name}：今日无资格`);
            else if (stMsg && !/success/i.test(stMsg)) reasons.push(`${c.name}：${stMsg}`);
            continue;
        }

        // 2) 有资格才领
        const res = await actReq(actUrl({ act: c.act, type: 100160, option: 100, module: c.module, ptag: "channel.rightmodule", aid: "V0%2524%25248%253A2003" }), c.act, cookie);
        const msg = (res && res.msg) || "";
        // ⚠️ 没抓到过成功样本，所以不硬卡 receive_result 的具体值：
        //    ret=0 且 msg 不含失败关键词，就算领到；同时把原始响应写进日志便于核对。
        const failed = /不满足|无领取资格|已领完|领完|失败|错误|不存在|未开始|已结束/.test(msg);
        const okReceive = res && res.ret === 0 && !failed;
        $.log(`[领取] ${c.name} ret=${res && res.ret} receive_result=${res && res.receive_result} msg=${msg}`);
        if (!okReceive) $.log(`[领取原始] ${res ? JSON.stringify(res).slice(0, 300) : "无响应"}`);

        if (okReceive) {
            got.push(`🎫 领券：${c.name} 成功`);
            // 券码/券名：字段名不确定，把 result 里能找到的都试一遍
            const list = (res.receive_list && res.receive_list.length ? res.receive_list : res.receive_result_list) || [];
            for (const it of list) {
                const code = it.cdkey || it.code || it.property_code || "";
                const nm = it.property_name || it.name || it.title || "";
                if (nm) got.push(`   ${nm}`);
                if (code) got.push(`   券码：${code}`);
            }
            if (!list.length) got.push(`   （详见 Loon 日志「领取」一行）`);
        } else if (/已领完|领完|总量/.test(msg)) {
            $.log(`[领取] ${c.name} 已被领完，明天再试`);
        }
    }
    if (authFail && !got.length) {
        return {
            got: 0,
            authFail: true,
            text: "❌ 领券：活动接口不认登录态（用户未登录）\n   签到域正常，仅 activity.video.qq.com 拒绝\n   👉 进腾讯视频会员中心重新抓一次 Cookie",
        };
    }
    if (!got.length) {
        // 没领到也要说清楚为什么，否则「今日无券可领」等于什么都没讲。
        // 领完 / 抢光是最常见情况，提示用户早点来而不是以为脚本坏了。
        const detail = reasons.length ? "\n   " + reasons.join("\n   ") : "";
        return { got: 0, text: `🎫 领券：今日无券可领${detail}` };
    }
    return { got: got.length, text: got.join("\n") };
}

async function checkin() {
    let cookie = $.getdata(K.cookie);
    if (!cookie) {
        saveStatus("none", "未抓取 Cookie");
        throw new Error(`[${SCRIPT_VERSION}] 未配置 Cookie,进腾讯视频 App 会员中心抓一次`);
    }

    // 1) 先续期
    const renewed = await renewSession(cookie);
    let renewMsg = "";
    if (renewed) {
        cookie = renewed.cookie;
        $.setdata(cookie, K.cookie);
        $.setdata(String(Date.now()), K.renewTs);
        $.setdata(renewed.via, K.renewVia);
        // 续期结果要出现在通知里 —— 这是判断"还能撑多久"的唯一依据
        renewMsg = renewed.rolled ? `🔑 续期成功（${renewed.via === "app" ? "App" : "网页"}通道，令牌已滚动）` : `🔑 续期成功（${renewed.via === "app" ? "App" : "网页"}通道，令牌未滚动）`;
    } else if (!pick(cookie, "vusession").value) {
        saveStatus("cookie", "续期失败且无可用会话");
        throw new Error(`[${SCRIPT_VERSION}] 续期失败,且 cookie 里没有 vusession\n👉 进腾讯视频 App 会员中心重新抓一次`);
    } else if (!pick(cookie, "refresh").value) {
        // 没有续期令牌的账号,本来就没什么可续的,直接用抓到的会话签到
        $.log("[续期] 该账号无续期令牌,直接用现有 vusession 签到");
        renewMsg = "⚠️ 无续期令牌，用现有会话签到（过期需重抓）";
    } else {
        renewMsg = "⚠️ 续期失败，用旧会话试签到";
    }

    // 2) CheckIn
    const res = await req("GET", CHECKIN_URL, cookie, null);
    $.log(`[响应] ${res ? JSON.stringify(res).slice(0, 200) : "无响应"}`);
    const tag = `[${SCRIPT_VERSION}]`;
    if (res && res.ret === 0 && res.check_in_score != null) {
        saveStatus("ok", `签到成功 +${res.check_in_score} V力值`);
        return { ok: true, text: renewMsg, line: `✅ 签到成功，获得 ${res.check_in_score} V力值` };
    }
    if (res && (res.ret === -2002 || /已签|already|has check in/i.test(res.err_msg || ""))) {
        saveStatus("ok", "今日已签到");
        return { ok: true, text: renewMsg, line: "✨ 今日已签到（之前签过了）" };
    }
    if (res && /not login|登录|token|auth|-1009|-10001/i.test(JSON.stringify(res))) {
        saveStatus("cookie", "签到鉴权失败");
        return { ok: false, text: renewMsg, line: `❌ 签到鉴权失败: ${JSON.stringify(res).slice(0, 160)}` };
    }
    saveStatus("fail", `签到失败: ${res ? JSON.stringify(res) : "无响应"}`);
    return { ok: false, text: renewMsg, line: `❌ 签到失败: ${res ? JSON.stringify(res).slice(0, 160) : "无响应"}` };
}

// ============ 请求 ============

function req(method, url, cookie, body) {
    return new Promise((resolve) => {
        const headers = {
            Cookie: cookie,
            accept: "application/json, text/plain, */*",
            "accept-language": "zh-CN,zh;q=0.9",
            origin: "https://film.video.qq.com",
            referer: "https://film.video.qq.com/",
            "User-Agent": UA,
        };
        const opts = { url, headers };
        if (method === "POST") {
            headers["content-type"] = "application/json";
            opts.body = body || "{}";
        }
        const fn = method === "POST" ? $.post : $.get;
        fn.call($, opts, (err, resp, data) => {
            if (err) {
                $.log(`[ERROR] ${method} ${String(url).split("?")[0]}: ${$.toStr(err)}`);
                return resolve(null);
            }
            const out = typeof data === "string" ? safeJSON(data) : data;
            if (out && resp) out.headers = resp.headers;
            resolve(out);
        });
    });
}

function safeJSON(s) {
    try {
        return JSON.parse(s);
    } catch {
        $.log(`[ERROR] 响应解析失败: ${String(s || "").slice(0, 200)}`);
        return null;
    }
}

// 续期响应里有 vusession / vurefresh 明文,日志一律只打摘要,不落完整令牌
function briefOf(o) {
    if (!o) return "无响应";
    const d = o.data || o;
    const parts = [];
    const code = o.ret !== undefined ? o.ret : o.errcode;
    if (code !== undefined) parts.push("ret=" + code);
    if (o.err_msg) parts.push("err=" + String(o.err_msg).slice(0, 60));
    if (d && d.vusession) parts.push("vusession=***" + String(d.vusession).slice(-4));
    if (d && (d.vurefresh || d.refresh_token)) parts.push("令牌已滚动");
    if (d && d.nick) parts.push("nick=" + String(d.nick).slice(0, 20));
    if (!parts.length) parts.push("keys=" + Object.keys(o).slice(0, 6).join(","));
    return parts.join(" ");
}

function debug(content, title = "debug") {
    if (!content) return;
    const o = typeof content === "string" ? safeJSON(content) : content;
    $.log(`[debug:${title}] ${briefOf(o)}`);
}

// 通知统一出口
function notify(subtitle, body) {
    $.log(`[通知] ${subtitle}${body ? " · " + body : ""}`);
    $.msg($.name, subtitle, body || "");
}

// ============ 入口 ============

if (typeof $request !== "undefined" && !CHECKIN_RUN) {
    // 重写阶段:抓取开关关掉时直接放行原报文
    if (typeof $response !== "undefined") captureFromResponse();
    else captureFromRequest();
    $.done();
} else {
    (async () => {
        // 所有开关都关掉：什么都不做，也不弹通知
        if (!CHECKIN_ON && !LOTTERY_ON && !COUPON_ON) {
            $.log("[全部] 签到/抽奖/领券开关都关闭，跳过");
            return;
        }

        // 随机延迟只做一次，三个任务共用（避免每个任务各延迟一遍）
        await randomDelay();

        // 依次跑完三个任务，结果先攒着，最后合并成一条通知
        const done = []; // 成功项（一行一条）
        const fails = []; // 失败项
        let head = ""; // 续期状态，放在通知首行

        if (CHECKIN_ON) {
            const r = await checkin();
            head = r.text || "";
            if (r.ok) done.push(r.line);
            else fails.push(r.line);
        }

        if (LOTTERY_ON) {
            const cookie = $.getdata(K.cookie);
            if (!cookie) {
                fails.push("❌ 抽奖：未配置 Cookie");
            } else {
                // 中奖和"今日已抽完"都算正常结果，不算失败；
                // 但活动域未登录必须报出来，否则会被误当成"今天抽完了"
                const r = await doLottery(cookie);
                if (r.authFail) fails.push(r.text);
                else done.push(r.text);
            }
        }

        if (COUPON_ON) {
            const cookie = $.getdata(K.cookie);
            if (!cookie) {
                fails.push("❌ 领券：未配置 Cookie");
            } else {
                const r = await doCoupons(cookie);
                // 三种结果都必须进通知，否则用户只能看到"任务完成"却不知道券没领到。
                //   got  > 0        → 真领到了
                //   authFail        → 活动接口不认登录态（必须报出来，这是需要人工处理的）
                //   其它            → 今天确实没券，也算正常
                if (r.got) done.push(r.text);
                else if (r.authFail) fails.push(r.text);
                else done.push("🎫 领券：今日无券可领");
            }
        }

        // 输出策略（按需求）：全部成功才合并成一条；有失败就单独发失败
        if (fails.length) {
            // 有失败：标题简明，正文按"失败在前、成功在后"排列
            const title = fails.length === 1 ? "❌ 腾讯视频 · 有任务失败" : `❌ 腾讯视频 · ${fails.length} 项失败`;
            notify(title, fails.concat(done).join("\n"));
        } else if (done.length) {
            // 全部成功：一条通知，首行是续期状态，其余逐项列出
            const body = (head ? [head] : []).concat(done).join("\n");
            notify("✅ 腾讯视频 · 每日任务完成", body);
        } else {
            $.log("[全部] 三个任务都没有可汇报的内容");
        }
    })()
        .catch((e) => {
            $.logErr(e);
            notify("❌ 腾讯视频任务异常", e.message || String(e));
        })
        .finally(() => $.done());
}

// 记录本次结果,供「签到汇总」:ok 正常 / cookie 需重新抓取 / fail 其他失败 / none 未使用
function saveStatus(s, msg) {
    msg = String(msg).slice(0, 100);
    if (s === "fail" && /过期|重新登录|未登录|请登录|登录失效|登录已失效|token\s*(失效|过期|无效)|not\s*login/i.test(msg)) s = "cookie";
    // 同一天已有带奖励的成功记录时,再次运行得到的「今日已签」不覆盖它的奖励文字
    let keep = null;
    if (s === "ok" && /^今日已/.test(msg)) {
        const day = (t) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
        let old = null;
        try { old = JSON.parse($.getdata(K.status) || "null"); } catch (e) {}
        if (old && old.s === "ok" && !/^今日已/.test(old.msg) && day(old.t) === day(Date.now())) keep = old;
    }
    checkinReport(K.status, keep ? keepReward(keep, { s, msg }) : { s, msg }, { name: "腾讯视频", author: "MaYIHEI", run: "http://1.1.1.1/checkin/tenvideo", open: "https://apps.apple.com/app/id458318329" });
}

// 保留当天带奖励的旧记录
function keepReward(old, rec) {
    const out = { s: old.s, msg: old.msg, t: old.t, asset: old.asset, exp: old.exp };
    for (const k in rec) if (rec[k] !== undefined && k !== "s" && k !== "msg") out[k] = rec[k];
    return out;
}

// 签到状态协议 v1
function checkinReport(key, rec, info) {
    const read = (k) => (typeof $prefs !== "undefined" ? $prefs.valueForKey(k) : $persistentStore.read(k));
    const write = (v, k) => (typeof $prefs !== "undefined" ? $prefs.setValueForKey(v, k) : $persistentStore.write(v, k));
    const registry = () => { try { return JSON.parse(read("checkin_registry") || "{}") || {}; } catch (e) { return {}; } };
    write(JSON.stringify(Object.assign({ v: 1, t: Date.now(), name: info.name, author: info.author }, rec)), key);
    const reg = registry();
    if (JSON.stringify(reg[key]) === JSON.stringify(info)) return;
    reg[key] = info;
    write(JSON.stringify(reg), "checkin_registry");
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,a)=>{s.call(this,t,(t,s,r)=>{t?a(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const a=this.getdata(t);if(a)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,a)=>e(a))})}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e);if(!s&&!a)return{};{const a=s?t:e;try{return JSON.parse(this.fs.readFileSync(a))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):a?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}getdata(t){return this.getval(t)}setdata(t,e){return this.setval(t,e)}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:a,statusCode:r,headers:i,rawBody:o}=t,n=s.decode(o,this.encoding);e(null,{status:a,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:a,response:r}=t;e(a,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let a=require("iconv-lite");this.initGotEnv(t);const{url:r,...i}=t;this.got[s](r,i).then(t=>{const{statusCode:s,statusCode:r,headers:i,rawBody:o}=t,n=a.decode(o,this.encoding);e(null,{status:s,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:s,response:r}=t;e(s,r,r&&a.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let a={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in a)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?a[e]:("00"+a[e]).substr((""+a[e]).length)));return t}queryStr(t){let e="";for(const s in t){let a=t[s];null!=a&&""!==a&&("object"==typeof a&&(a=JSON.stringify(a)),e+=`${s}=${a}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",a="",r){const i=t=>{switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{let e=t.url||t.openUrl||t["open-url"];return{url:e}}case"Loon":{let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}case"Quantumult X":{let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,a=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":a}}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,a,i(r));break;case"Quantumult X":$notify(e,s,a,i(r));break;case"Node.js":}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),a&&t.push(a),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t.stack)}}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}

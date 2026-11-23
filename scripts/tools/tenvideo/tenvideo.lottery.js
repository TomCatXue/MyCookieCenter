/**
 * 腾讯视频 · 每日抽奖 + 领券
 *
 * 依据 2026-11-23 真机 HAR 逆向（activity.video.qq.com/fcgi-bin/asyn_activity）
 *
 *   抽奖  type=100143  option=100  → { lotter_result:1, prize_list:[{lotter_name,cdkey,lotter_url_h5}] }
 *   查资格 type=100143  option=104  → ret=0 success / ret=-904 无资格
 *
 *   领券  type=100160  option=100  → { receive_result, msg }（领）
 *         type=100160  option=101  → { data:{has_right,left_times,status}, msg }（查状态）
 *
 * @Maintainer: TomCatXue <https://github.com/TomCatXue/MyCookieCenter>
 */

const $ = new Env("腾讯视频抽奖");

const ARG = typeof $argument === "object" && $argument ? $argument : {};
const argOn = (v, key) => v === true || v === "true" || $.getdata(key) === "true";

const LOTTERY_ON = ARG.lottery === undefined ? true : argOn(ARG.lottery, "tenvideo_lottery");
const COUPON_ON = ARG.coupon === undefined ? true : argOn(ARG.coupon, "tenvideo_coupon");

const K = {
    cookie: "tenvideo_cookie",
    status: "tenvideo_lottery_status",
    pool: "tenvideo_lottery_pool",
};

const API = "https://activity.video.qq.com/fcgi-bin/asyn_activity";
const UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A465 QQLiveBrowser/9.04.75 AppType/UN WebKitCore/WKWebView iOS cellPhone/iPhone 16e AppBuild/25247";
const AID = "V0%2524%25248%253A900027";

// 抽奖活动及其奖池
const LOTTERY_ACT = "trr69dwle61dwisptr12gj12ja";
const LOTTERY_POOLS = ["43kwa67scker73ia85gjq8ch11", "xh94kpfpi2xoiljhxiu3epss4g"];

// 领券活动：每天试一次，有货就领
const COUPONS = [
    { act: "tr607p8587ii7zp53eog20y565", module: "gopzyc36eow5c4a7ed8z8szll9", name: "嘿影电影票福利" },
    { act: "z4lpthi9h219lifagkksheez25", module: "zjp5wau2y18riskxwek98fdcqg", name: "138元美团券包" },
];

const ALIAS = { vusession: ["vqq_vusession", "v_vusession", "vusession"] };

$.messages = [];

function parseCookie(str) {
    const map = new Map();
    for (const part of String(str || "").split(";")) {
        const i = part.indexOf("=");
        if (i <= 0) continue;
        const k = part.slice(0, i).trim();
        if (k) map.set(k, part.slice(i + 1).trim());
    }
    return map;
}

function getVal(cookie, kind) {
    const map = parseCookie(cookie);
    for (const n of ALIAS[kind]) if (map.get(n)) return map.get(n);
    return "";
}

// 15~30 秒随机延迟：避免每天同一秒打同一接口
function randomDelay() {
    const sec = 15 + Math.floor(Math.random() * 16); // 15..30
    $.log(`[防风控] 随机延迟 ${sec} 秒后开始`);
    return new Promise((r) => setTimeout(r, sec * 1000));
}

function req(url, act, cookie) {
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
                    "User-Agent": UA,
                },
            },
            (err, resp, data) => {
                if (err) {
                    $.log(`[ERROR] ${$.toStr(err)}`);
                    return resolve(null);
                }
                try {
                    resolve(typeof data === "string" ? JSON.parse(data) : data);
                } catch {
                    $.log(`[ERROR] 解析失败: ${String(data).slice(0, 120)}`);
                    resolve(null);
                }
            }
        );
    });
}

function buildUrl({ act, type, option, module, ptag, aid }) {
    const q = [
        "platform=7",
        `type=${type}`,
        `option=${option}`,
        `act_id=${act}`,
        `module_id=${module}`,
        `ptag=${ptag || ""}`,
        "is_prepublish=",
        `aid=${aid || AID}`,
        "otype=xjson",
        `_ts=${Date.now()}`,
    ];
    return `${API}?${q.join("&")}`;
}

function poolOrder() {
    const last = $.getdata(K.pool);
    const list = LOTTERY_POOLS.slice();
    if (last && list.includes(last)) list.splice(list.indexOf(last), 1);
    return last ? [last].concat(list) : list;
}

// ---------- 抽奖 ----------

async function doLottery(cookie) {
    for (const pool of poolOrder()) {
        const chk = await req(buildUrl({ act: LOTTERY_ACT, type: 100143, option: 104, module: pool }), LOTTERY_ACT, cookie);
        if (!chk || chk.ret !== 0 || chk.msg !== "success") {
            $.log(`[抽奖资格] ${pool.slice(0, 10)}… ${chk ? chk.ret + " " + (chk.msg || "") : "无响应"}`);
            continue;
        }

        const res = await req(buildUrl({ act: LOTTERY_ACT, type: 100143, option: 100, module: pool }), LOTTERY_ACT, cookie);
        if (res && res.lotter_result === 1) {
            const p = (res.prize_list && res.prize_list[0]) || {};
            $.setdata(pool, K.pool);
            const lines = [`🎉 ${p.lotter_name || res.lotter_ext || "中奖"}`];
            if (p.cdkey) lines.push(`CDKey：${p.cdkey}`);
            if (p.lotter_url_h5) lines.push(`兑换：${p.lotter_url_h5}`);
            $.setdata(JSON.stringify({ ok: true, prize: p.lotter_name || "", cdkey: p.cdkey || "", t: Date.now() }), K.status);
            return lines.join("\n");
        }
        $.log(`[抽奖] ${pool.slice(0, 10)}… ${res ? res.ret + " " + (res.msg || "") : "无响应"}`);
        // -904 = 该池今天没资格了，换下一个；其它错误也继续试
    }
    return "";
}

// ---------- 领券 ----------

async function doCoupons(cookie) {
    const got = [];
    for (const c of COUPONS) {
        // 1) 先查状态，没货就不浪费一次领取请求
        const st = await req(buildUrl({ act: c.act, type: 100160, option: 101, module: c.module, ptag: "channel.rightmodule", aid: "V0%2524%25248%253A2003" }), c.act, cookie);
        const d = (st && st.data) || {};
        $.log(`[券状态] ${c.name} has_right=${d.has_right} left=${d.left_times} status=${d.status} msg=${(st && st.msg) || ""}`);

        if (!st || st.ret !== 0 || !d.has_right) continue;

        // 2) 有资格才领
        const res = await req(buildUrl({ act: c.act, type: 100160, option: 100, module: c.module, ptag: "channel.rightmodule", aid: "V0%2524%25248%253A2003" }), c.act, cookie);
        const msg = (res && res.msg) || "";
        // ⚠️ 没抓到过成功样本，所以不硬卡 receive_result 的具体值：
        //    ret=0 且 msg 不含失败关键词，就算领到；同时把原始响应写进日志便于核对。
        const failed = /不满足|无领取资格|已领完|领完|失败|错误|不存在|未开始|已结束/.test(msg);
        const okReceive = res && res.ret === 0 && !failed;
        $.log(`[领取] ${c.name} ret=${res && res.ret} receive_result=${res && res.receive_result} msg=${msg}`);
        if (!okReceive) $.log(`[领取原始] ${res ? JSON.stringify(res).slice(0, 300) : "无响应"}`);

        if (okReceive) {
            got.push(`🎫 ${c.name} 领取成功`);
            // 券码/券名：字段名不确定，把 result 里能找到的都试一遍
            const list = (res.receive_list && res.receive_list.length ? res.receive_list : res.receive_result_list) || [];
            for (const it of list) {
                const code = it.cdkey || it.code || it.property_code || "";
                const nm = it.property_name || it.name || it.title || "";
                if (nm) got.push(`  ${nm}`);
                if (code) got.push(`  券码：${code}`);
            }
            if (!list.length) got.push(`  （详见 Loon 日志「领取」一行）`);
        } else if (/已领完|领完|总量/.test(msg)) {
            $.log(`[领取] ${c.name} 已被领完，明天再试`);
        }
    }
    return got.join("\n");
}

// ---------- 主流程 ----------

async function run() {
    if (!LOTTERY_ON && !COUPON_ON) {
        $.log("[全部] 抽奖与领券开关都关闭，跳过");
        return;
    }
    const cookie = $.getdata(K.cookie);
    if (!cookie) throw new Error("未配置 Cookie，先进腾讯视频 App 会员中心抓一次");
    if (!getVal(cookie, "vusession")) throw new Error("Cookie 缺 vusession，重抓");

    await randomDelay();

    if (LOTTERY_ON) {
        const r = await doLottery(cookie);
        if (r) $.messages.push(r);
        else $.messages.push("今日抽奖已用完");
    }
    if (COUPON_ON) {
        const r = await doCoupons(cookie);
        if (r) $.messages.push(r);
    }
}

if (typeof $request !== "undefined") {
    $.done();
} else {
    (async () => {
        await run();
    })()
        .catch((e) => {
            $.messages.push(e.message || String(e));
            $.logErr(e);
        })
        .finally(() => {
            if ($.messages.length) $.msg($.name, $.messages[0], $.messages.slice(1).join("\n"));
            $.done();
        });
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,a)=>{s.call(this,t,(t,s,r)=>{t?a(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}getEnv(){return"undefined"!=typeof $environment&&$environment["surge-version"]?"Surge":"undefined"!=typeof $environment&&$environment["stash-version"]?"Stash":"undefined"!=typeof module&&module.exports?"Node.js":"undefined"!=typeof $task?"Quantumult X":"undefined"!=typeof $loon?"Loon":"undefined"!=typeof $rocket?"Shadowrocket":void 0}isNode(){return"Node.js"===this.getEnv()}isQuanX(){return"Quantumult X"===this.getEnv()}isSurge(){return"Surge"===this.getEnv()}isLoon(){return"Loon"===this.getEnv()}isShadowrocket(){return"Shadowrocket"===this.getEnv()}isStash(){return"Stash"===this.getEnv()}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const a=this.getdata(t);if(a)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,a)=>e(a))})}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e);if(!s&&!a)return{};{const a=s?t:e;try{return JSON.parse(this.fs.readFileSync(a))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),a=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):a?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}getdata(t){return this.getval(t)}setdata(t,e){return this.setval(t,e)}getval(t){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.read(t);case"Quantumult X":return $prefs.valueForKey(t);case"Node.js":return this.data=this.loaddata(),this.data[t];default:return this.data&&this.data[t]||null}}setval(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":return $persistentStore.write(t,e);case"Quantumult X":return $prefs.setValueForKey(t,e);case"Node.js":return this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0;default:return this.data&&this.data[e]||null}}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){switch(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"],delete t.headers["content-type"],delete t.headers["content-length"]),t.params&&(t.url+="?"+this.queryStr(t.params)),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:a,statusCode:r,headers:i,rawBody:o}=t,n=s.decode(o,this.encoding);e(null,{status:a,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:a,response:r}=t;e(a,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";switch(t.body&&t.headers&&!t.headers["Content-Type"]&&!t.headers["content-type"]&&(t.headers["content-type"]="application/x-www-form-urlencoded"),t.headers&&(delete t.headers["Content-Length"],delete t.headers["content-length"]),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,a)=>{!t&&s&&(s.body=a,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,a)});break;case"Quantumult X":t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:a,headers:r,body:i,bodyBytes:o}=t;e(null,{status:s,statusCode:a,headers:r,body:i,bodyBytes:o},i,o)},t=>e(t&&t.error||"UndefinedError"));break;case"Node.js":let a=require("iconv-lite");this.initGotEnv(t);const{url:r,...i}=t;this.got[s](r,i).then(t=>{const{statusCode:s,statusCode:r,headers:i,rawBody:o}=t,n=a.decode(o,this.encoding);e(null,{status:s,statusCode:r,headers:i,rawBody:o,body:n},n)},t=>{const{message:s,response:r}=t;e(s,r,r&&a.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let a={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in a)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?a[e]:("00"+a[e]).substr((""+a[e]).length)));return t}queryStr(t){let e="";for(const s in t){let a=t[s];null!=a&&""!==a&&("object"==typeof a&&(a=JSON.stringify(a)),e+=`${s}=${a}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",a="",r){const i=t=>{switch(typeof t){case void 0:return t;case"string":switch(this.getEnv()){case"Surge":case"Stash":default:return{url:t};case"Loon":case"Shadowrocket":return t;case"Quantumult X":return{"open-url":t};case"Node.js":return}case"object":switch(this.getEnv()){case"Surge":case"Stash":case"Shadowrocket":default:{let e=t.url||t.openUrl||t["open-url"];return{url:e}}case"Loon":{let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}case"Quantumult X":{let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,a=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":a}}case"Node.js":return}default:return}};if(!this.isMute)switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":default:$notification.post(e,s,a,i(r));break;case"Quantumult X":$notify(e,s,a,i(r));break;case"Node.js":}if(!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),a&&t.push(a),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){switch(this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:this.log("",`❗️${this.name}, 错误!`,t);break;case"Node.js":this.log("",`❗️${this.name}, 错误!`,t.stack)}}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;switch(this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),this.getEnv()){case"Surge":case"Loon":case"Stash":case"Shadowrocket":case"Quantumult X":default:$done(t);break;case"Node.js":process.exit(1)}}}(t,e)}

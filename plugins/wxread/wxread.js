/*
------------------------------------------
@Description: 轻触订阅人数或在读人数，好书即刻入架 · 微信读书优雅收录
@Author: TomCatXue (重构整合)
@OriginalAuthor: 水君
@Fixed: 
  1. 修复 i.weread.qq.com 传输层强制 Base64 编码导致入架失败的问题
  2. 扩展触发支持现代微信读书的「在读人数/阅读统计」接口 (/book/readingStat)
  3. 增加请求头 App 凭证自动透传与 30 秒防抖防重复机制
------------------------------------------
触发：在微信读书中，点击任意书籍的「在读人数」或「订阅人数」
流程：提取 bookId → 校验防抖 → 查书籍信息 → 校验上架 → Base64编码请求加入书架 → 推送通知
用法：安装插件，进入微信读书点按即用
*/

console.log("\u2705 [微信读书·优雅收录] 脚本已加载，等待触发...");

const $ = new Env("微信读书·优雅收录");
const CACHE_KEY = "weread_shelf_last_added";

// =================== 工具函数 ===================

function getQueries(url) {
    const [, qs] = (url || "").split("?");
    return qs
        ? qs.split("&").reduce((acc, pair) => {
            const [k, v] = pair.split("=");
            return (acc[k] = decodeURIComponent(v || "")), acc;
        }, {})
        : {};
}

function b64encode(str) {
    if (typeof $base64 !== "undefined") return $base64.encode(str);
    try {
        if (typeof Buffer !== "undefined") return Buffer.from(str).toString("base64");
    } catch (e) { }
    return str;
}

function b64decode(str) {
    if (!str) return str;
    try {
        if (typeof $base64 !== "undefined") return $base64.decode(str);
        if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8");
    } catch (e) { }
    return str;
}

// 构建请求头：优先复用当前 App 请求的 vid/skey，备用本地缓存
function buildHeaders() {
    let orig = (typeof $request !== "undefined" && $request.headers) ? $request.headers : {};
    let auth = {};
    try {
        let raw = $.getdata("weread_auth_v2");
        if (raw) auth = JSON.parse(raw);
    } catch (e) { }

    let headers = {
        "Content-Type": "application/json",
        "Accept": "*/*",
        "User-Agent": orig["User-Agent"] || orig["user-agent"] || auth.ua || "WeRead/10.2.1",
        "channelid": orig["channelid"] || auth.channelid || "AppStore",
        "basever": orig["basever"] || auth.basever || "10.2.1",
        "v": orig["v"] || auth.basever || "10.2.1",
        "vid": orig["vid"] || auth.vid || ""
    };
    if (orig["skey"] || auth.skey) {
        headers["skey"] = orig["skey"] || auth.skey;
    }
    return headers;
}

// =================== 业务逻辑 ===================

async function getBookInfo(bookId) {
    try {
        const opts = {
            url: `https://i.weread.qq.com/book/info?bookId=${bookId}`,
            type: "get",
            headers: buildHeaders(),
        };
        $.log(`[INFO] 正在查询书籍[${bookId}]的基础信息...`);
        const res = await Request(opts);
        const data = res?.bookInfo || res;
        const title = data?.title || "";
        const author = data?.author || "";

        if (data && data.totalWords === 0) {
            $.log(`[INFO] 书籍[${bookId}](${title})的 totalWords 为 0，说明该书籍暂无排版内容。`);
            return { available: false, title, author };
        }

        $.log(`[INFO] 书籍[${bookId}](${title})信息正常，准备加入书架。`);
        return { available: true, title, author };
    } catch (e) {
        $.log(`[WARN] 查询书籍信息异常，默认尝试添加书架: ${e}`);
        return { available: true, title: "", author: "" };
    }
}

async function isBookOnShelf(bookId) {
    try {
        const opts = {
            url: `https://i.weread.qq.com/shelf/get?bookIds=${bookId}`,
            type: "get",
            headers: buildHeaders(),
        };
        const res = await Request(opts);
        if (res && res.data && Array.isArray(res.data) && res.data.length > 0) {
            return res.data[0].onShelf === 1;
        }
        return false;
    } catch {
        return false;
    }
}

async function addBook(bookId) {
    const bookList = [String(bookId)];

    try {
        const opts = {
            url: "https://i.weread.qq.com/shelf/add",
            type: "post",
            dataType: "json",
            headers: buildHeaders(),
            body: { bookIds: bookList },
        };

        $.log(`[INFO] 发起加书架请求，bookId: ${bookId}`);
        const res = await Request(opts);
        $.log(`[INFO] 服务器响应: ${JSON.stringify(res)}\n`);

        if (res && (res.succ === 1 || res.succ === true || res.errcode === -2449)) {
            return { succ: true };
        }

        return res || { succ: false };
    } catch (e) {
        $.logErr(e);
        return { succ: false, error: e };
    }
}

// =================== 主程序入口 ===================

(async () => {
    try {
        if (typeof $request === "undefined") return;

        const queries = getQueries($request.url);
        const bookId = queries?.bookId;
        if (!bookId) {
            return;
        }

        // 30 秒防抖去重：避免同一个页面多次触发连续加书架与通知
        let lastCache = $.getdata(CACHE_KEY);
        if (lastCache) {
            try {
                let parsed = JSON.parse(lastCache);
                if (parsed.bookId === String(bookId) && (Date.now() - parsed.time < 30000)) {
                    $.log(`[INFO] 书籍[${bookId}]在 30 秒内已处理，跳过重复触发`);
                    return;
                }
            } catch (e) { }
        }
        $.setdata(JSON.stringify({ bookId: String(bookId), time: Date.now() }), CACHE_KEY);

        const info = await getBookInfo(bookId);
        const label = info.title ? `《${info.title}》` : `ID: ${bookId}`;

        if (!info.available) {
            $.msg($.name, "📕 暂未上架", `${label}（暂无正版排版数据）`);
            return;
        }

        const onShelf = await isBookOnShelf(bookId);
        if (onShelf) {
            $.log(`[INFO] 书籍[${bookId}]已在书架中，无需重复添加`);
            return;
        }

        const res = await addBook(bookId);

        if (res && res.succ) {
            const authorPart = info.author ? ` / ${info.author}` : "";
            $.msg($.name, "📖 已加入书架", `${label}${authorPart}`);
        } else {
            $.log(`[WARN] 书籍[${bookId}]添加未返回成功标志: ${JSON.stringify(res)}`);
        }
    } catch (e) {
        $.logErr(e);
    }
})()
    .catch((e) => {
        $.logErr(e);
    })
    .finally(() => {
        $done({});
    });

// =================== 通用框架：Request + Env ===================

async function Request(t) {
    "string" == typeof t && (t = { url: t });
    try {
        if (!t?.url) throw new Error("[URL][ERROR] 缺少 url 参数");
        let {
            url: o,
            type: e,
            headers: r = {},
            body: s,
            params: a,
            dataType: n = "form",
            resultType: u = "data",
        } = t;
        const p = e ? e.toLowerCase() : "body" in t ? "post" : "get";
        const c = o.concat("post" === p && a ? "?" + $.queryStr(a) : "");
        const i = t.timeout ? (t.timeout > 1000 ? t.timeout : t.timeout * 1000) : 10000;

        "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8");

        let y = "string" == typeof s ? s : s && "form" == n ? $.queryStr(s) : $.toStr(s);

        if (p === "post" && o.indexOf("i.weread.qq.com") !== -1 && y) {
            y = b64encode(y);
        }

        const l = {
            url: c,
            headers: r,
            ...("post" === p && { body: y }),
            timeout: i,
        };

        const m = $.http[p.toLowerCase()](l).then((t) => {
            let rawBody = t && typeof t.body !== "undefined" ? t.body : t;
            if (typeof rawBody === "string") {
                let trimmed = rawBody.trim();
                if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
                    let decoded = b64decode(trimmed);
                    if (decoded && (decoded.trim().startsWith("{") || decoded.trim().startsWith("["))) {
                        rawBody = decoded;
                    }
                }
            }
            return "data" == u ? ($.toObj(rawBody) || rawBody) : $.toObj(t) || t;
        });

        return Promise.race([
            new Promise((_, reject) => setTimeout(() => reject("当前请求已超时"), i)),
            m,
        ]);
    } catch (t) {
        console.log(`[${p?.toUpperCase() || "REQ"}][ERROR] ${t}\n`);
    }
}

function Env(t, e) {
    class s {
        constructor(t) {
            this.env = t;
        }
        send(t, e = "GET") {
            t = "string" == typeof t ? { url: t } : t;
            const method = e.toLowerCase();
            return new Promise((resolve, reject) => {
                if (typeof $httpClient !== "undefined") {
                    $httpClient[method](t, (err, resp, data) => {
                        if (err) return reject(err);
                        resolve(resp && typeof resp.body !== "undefined" ? resp : { body: data || "" });
                    });
                } else if (typeof $task !== "undefined") {
                    $task.fetch(t).then(
                        (resp) => resolve({ statusCode: resp.status, headers: resp.headers, body: resp.body }),
                        reject
                    );
                } else {
                    reject("unsupported environment");
                }
            });
        }
        get(t) { return this.send(t, "GET"); }
        post(t) { return this.send(t, "POST"); }
    }

    return new class {
        constructor(t, e) {
            this.name = t;
            this.http = new s(this);
            this.notifyMsg = [];
            this.startTime = new Date().getTime();
            this.log("\n\uD83D\uDD14", `${this.name}, 开始`);
        }
        getEnv() {
            if (typeof $environment !== "undefined") {
                if ($environment["surge-version"]) return "Surge";
                if ($environment["stash-version"]) return "Stash";
            }
            if (typeof module !== "undefined" && module.exports) return "Node.js";
            if (typeof $task !== "undefined") return "Quantumult X";
            if (typeof $loon !== "undefined") return "Loon";
            if (typeof $rocket !== "undefined") return "Shadowrocket";
            return void 0;
        }
        toObj(t, e = null) { try { return JSON.parse(t); } catch { return e; } }
        toStr(t, e = null) { try { return JSON.stringify(t); } catch { return e; } }
        queryStr(t) {
            let s = "";
            for (const k in t) {
                let v = t[k];
                if (null != v && "" !== v) {
                    "object" == typeof v && (v = JSON.stringify(v));
                    s += `${k}=${v}&`;
                }
            }
            return s.substring(0, s.length - 1);
        }
        getdata(k) {
            if (typeof $persistentStore !== "undefined") return $persistentStore.read(k);
            if (typeof $prefs !== "undefined") return $prefs.valueForKey(k);
            return null;
        }
        setdata(v, k) {
            if (typeof $persistentStore !== "undefined") return $persistentStore.write(v, k);
            if (typeof $prefs !== "undefined") return $prefs.setValueForKey(v, k);
            return false;
        }
        msg(title = this.name, subtitle = "", body = "", options = {}) {
            const payload = () => { return options; };
            if (typeof $notification !== "undefined") {
                $notification.post(title, subtitle, body, payload());
            } else if (typeof $notify !== "undefined") {
                $notify(title, subtitle, body, payload());
            }
            this.log("", `\uD83D\uDCE3 ${title}\n${subtitle}\n${body}`);
        }
        log(...args) { console.log(args.map((a) => a ?? "").join("\n")); }
        logErr(e) { this.log("", `\u2757\ufe0f ${this.name}, 错误!`, e.message || e, e.stack || ""); }
        done(data) {
            const elapsed = ((new Date()).getTime() - this.startTime) / 1000;
            this.log("", `\uD83D\uDD14 ${this.name}, 结束! \uD83D\uDD5B ${elapsed.toFixed(2)} 秒\n`);
            if (data !== undefined) { $done(data); } else { $done(); }
        }
    }(t, e);
}

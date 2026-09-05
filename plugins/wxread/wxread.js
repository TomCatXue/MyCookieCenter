/*
------------------------------------------
@Description: 微信读书·优雅收录（下架好书一键入架）
@Author: TomCatXue (重构优化)
@OriginalAuthor: 水君
@Fixed: 
  1. 修复 i.weread.qq.com 传输层强制 Base64 编码与解码
  2. 修复下架书籍 (soldout=1) 专有 490081 辅助书批处理入架机制
  3. 移除产生 404 报错的无效 /shelf/get 请求，改用 getProgress / 幂等入架
  4. 智能识别：仅对无“加入书架”按钮的下架/受限书籍执行强制收录，正常在售图书不滥用弹窗
------------------------------------------
触发：在微信读书中，打开任意下架好书详情页，或点击「订阅人数」
流程：校验书籍状态 → 针对下架书执行辅助书入架 → 自动清理辅助书 → 发送收录通知
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
        $.log(`[INFO] 正在查询书籍[${bookId}]基础信息...`);
        const res = await Request(opts);
        const data = res?.bookInfo || res;
        const title = data?.title || "";
        const author = data?.author || "";
        const soldout = data?.soldout === 1 || data?.soldout === true;
        const totalWords = typeof data?.totalWords !== "undefined" ? data.totalWords : -1;

        if (totalWords === 0) {
            $.log(`[INFO] 书籍[${bookId}](${title}) totalWords=0，暂无排版内容`);
            return { available: false, title, author, soldout, totalWords };
        }

        $.log(`[INFO] 书籍[${bookId}](${title}) 信息查询成功，soldout=${soldout}`);
        return { available: true, title, author, soldout, totalWords };
    } catch (e) {
        $.log(`[WARN] 查询书籍信息异常: ${e}`);
        return { available: true, title: "", author: "", soldout: true, totalWords: -1 };
    }
}

async function isBookOnShelf(bookId) {
    try {
        const opts = {
            url: `https://i.weread.qq.com/book/getProgress?bookId=${bookId}`,
            type: "get",
            headers: buildHeaders(),
        };
        const res = await Request(opts);
        if (res && res.book && res.book.isStartReading === 1) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function cleanBuiltinBook() {
    const builtinBookId = "490081";
    try {
        const opts = {
            url: "https://i.weread.qq.com/shelf/delete",
            type: "post",
            dataType: "json",
            headers: buildHeaders(),
            body: { bookIds: [builtinBookId] },
        };
        await Request(opts);
        $.log(`[INFO] 辅助书籍[${builtinBookId}]已成功清理`);
    } catch (e) {
        $.log(`[WARN] 清理辅助书籍异常(可忽略): ${e}`);
    }
}

async function addBook(bookId, isSoldout) {
    const builtinBookId = "490081";
    // 下架书籍必须通过包含辅助书(490081)的批处理才能成功入架
    const bookList = isSoldout ? [builtinBookId, String(bookId)] : [String(bookId)];

    try {
        const opts = {
            url: "https://i.weread.qq.com/shelf/add",
            type: "post",
            dataType: "json",
            headers: buildHeaders(),
            body: { bookIds: bookList },
        };

        $.log(`[INFO] 正在将书籍加入书架: ${bookId} (下架书籍模式=${isSoldout})`);
        const res = await Request(opts);
        $.log(`[INFO] 服务器入架响应: ${JSON.stringify(res)}\n`);

        if (res && (res.succ === 1 || res.succ === true || res.errcode === -2449)) {
            if (isSoldout) {
                // 异步清理临时占位的辅助书
                await cleanBuiltinBook();
            }
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

        // 30 秒防抖去重：避免同一本书在页面切换时多次触发
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

        const info = await getBookInfo(bookId);
        const label = info.title ? `《${info.title}》` : `ID: ${bookId}`;

        if (!info.available) {
            $.msg($.name, "📕 无法收录", `${label}（该书暂无正版排版数据）`);
            return;
        }

        const isFromSubscription = ($request.url || "").includes("subscription");
        const isSoldout = info.soldout === true;

        // 关键逻辑：正常在售图书在 App 内自带“加入书架”按钮，不予打扰
        // 仅当下架图书（soldout=1，无加书架按钮）或用户从订阅入口进入时，才执行优雅收录
        if (!isSoldout && !isFromSubscription) {
            $.log(`[INFO] 书籍[${bookId}](${label})为正常在售书籍，App原生已有加书架入口，不进行静默干预`);
            return;
        }

        $.setdata(JSON.stringify({ bookId: String(bookId), time: Date.now() }), CACHE_KEY);

        const onShelf = await isBookOnShelf(bookId);
        if (onShelf) {
            $.log(`[INFO] 书籍[${bookId}]已经在书架中，跳过添加`);
            return;
        }

        const res = await addBook(bookId, isSoldout);

        if (res && res.succ) {
            const authorPart = info.author ? ` / ${info.author}` : "";
            const prefix = isSoldout ? "📕 已收录下架好书" : "📖 已加入书架";
            $.msg($.name, prefix, `${label}${authorPart}`);
        } else {
            $.log(`[WARN] 书籍[${bookId}]入架失败: ${JSON.stringify(res)}`);
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

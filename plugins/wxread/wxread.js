/*
------------------------------------------
@Description: 轻触订阅人数，好书即刻入架 · 微信读书优雅收录
@Author: TomCatXue (重构整合)
@Fixed:  修复 Env 类 HTTP 封装 bug + Cookie 覆盖问题 + 请求头污染
------------------------------------------
触发：在微信读书中，点击任意书籍的「订阅人数」
流程：查书籍信息 → 校验上架 → 加入书架 → 清理辅助书
用法：开启插件开关，进入微信读书，点按即用
*/

// 如果 Loon 日志里连这行都没有，说明脚本没从 GitHub 下载成功
console.log("\u2705 [微信读书] 脚本已加载，等待触发...");

const $ = new Env("微信读书");

// =================== 工具函数 ===================

// 解析请求 URL 中的查询参数
function getQueries(url) {
    const [, qs] = (url || "").split("?");
    return qs
        ? qs.split("&").reduce((acc, pair) => {
            const [k, v] = pair.split("=");
            return (acc[k] = v), acc;
        }, {})
        : {};
}

// 从 $request 中安全提取 cookie（兼容大小写）
function getRequestCookie() {
    if (typeof $request === "undefined") return "";
    const h = $request.headers || {};
    return h["Cookie"] || h["cookie"] || h["COOKIE"] || "";
}

// 从 $request 中安全提取 user-agent（兼容大小写）
function getRequestUA() {
    if (typeof $request === "undefined") return "";
    const h = $request.headers || {};
    return h["User-Agent"] || h["user-agent"] || h["USER-AGENT"] || "";
}

// 构建安全的请求头：只传递必要的 header，避免污染
function buildHeaders() {
    const cookie = getRequestCookie();
    // 如果原始 cookie 已包含 wr_logined 则保持不变，否则追加
    const finalCookie = cookie.includes("wr_logined") ? cookie : (cookie ? cookie + "; wr_logined=1" : "wr_logined=1");
    return {
        "User-Agent": getRequestUA() || "WeRead/1.0",
        "Cookie": finalCookie,
        "Referer": "https://weread.qq.com/",
    };
}

// =================== 业务逻辑 ===================

// 查询书籍信息，判断是否从未上架（totalWords === 0 说明未上架）
async function getBookInfo(bookId) {
    try {
        const opts = {
            url: `https://i.weread.qq.com/book/info?bookId=${bookId}`,
            type: "get",
            headers: buildHeaders(),
        };
        $.log(`\n[INFO] 正在查询书籍[${bookId}]的基础信息...`);
        const res = await Request(opts);
        const title = res?.title || "";
        const author = res?.author || "";

        if (res && res.totalWords === 0) {
            $.log(`[INFO] 书籍[${bookId}](${title})的 totalWords 为 0，说明该书籍从未上架。`);
            return { available: false, title, author };
        }

        $.log(`[INFO] 书籍[${bookId}](${title})正常，允许加入书架。`);
        return { available: true, title, author };
    } catch (e) {
        $.log(`[ERROR] 查询书籍信息失败，将默认尝试添加书架: ${e}`);
        return { available: true, title: "", author: "" };
    }
}

// 查询某本书原本是否在书架上
async function isBookOnShelf(bookId) {
    try {
        const opts = {
            url: `https://weread.qq.com/web/shelf/bookIds?bookIds=${bookId}`,
            type: "get",
            headers: buildHeaders(),
        };
        const res = await Request(opts);
        if (res && res.data && res.data.length > 0) {
            // { bookId: "490081", onShelf: 1 }  → onShelf=1 表示在书架上
            return res.data[0].onShelf === 1;
        }
        return false;
    } catch {
        return false;
    }
}

// 静默移除内置辅助书籍（无日志、无通知）
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
    } catch {
        // 静默失败
    }
}

// 加入书架
async function addBook(bookId, shouldCleanBuiltin) {
    const builtinBookId = "490081";
    const bookList = [builtinBookId];

    // 如果获取到的 ID 有效且不同于内置 ID，则加入
    if (bookId && bookId.toString() !== builtinBookId) {
        bookList.push(bookId.toString());
    }

    try {
        const opts = {
            url: "https://i.weread.qq.com/shelf/add",
            type: "post",
            dataType: "json",
            headers: buildHeaders(),
            body: { bookIds: bookList },
        };

        $.log(`[INFO] 正在将书籍加入书架: ${bookId}`);
        const res = await Request(opts);
        $.log(`[INFO] 服务器返回结果: ${JSON.stringify(res)}\n`);

        // 添加成功后，如果辅助书原本不在书架上，则清理掉它
        if (res && res.succ && shouldCleanBuiltin) {
            await cleanBuiltinBook();
        }

        return res;
    } catch (e) {
        $.logErr(e);
    }
}

// =================== 主程序入口 ===================

(async () => {
    try {
        if (typeof $request === "undefined") return;

        const bookId = getQueries($request.url)?.bookId;
        if (!bookId) {
            $.msg($.name, "\u274c 解析失败", "未从请求 URL 中找到 bookId");
            return;
        }

        // 1. 先查询书籍信息，验证是否从未上架
        const info = await getBookInfo(bookId);
        if (!info.available) {
            const label = info.title ? `\u300a${info.title}\u300b` : `ID: ${bookId}`;
            $.msg($.name, "\ud83d\udcd5 暂未上架", `${label}\uff08字数 0，从未上架\uff09`);
            return;
        }

        // 2. 查询辅助凑数的书 (490081) 原本是否在书架上
        const builtinBookId = "490081";
        const builtinOnShelf = await isBookOnShelf(builtinBookId);
        const shouldCleanBuiltin = !builtinOnShelf;

        // 3. 加入书架
        const res = await addBook(bookId, shouldCleanBuiltin);

        if (res && res.succ) {
            const label = info.title ? `\u300a${info.title}\u300b` : `ID: ${bookId}`;
            const authorPart = info.author ? ` / ${info.author}` : "";
            $.msg($.name, "\ud83d\udcd6 已加入书架", `${label}${authorPart}`);
        } else {
            $.msg($.name, "\u274c 添加失败", `请尝试其它书籍\n${JSON.stringify(res)}`);
        }
    } catch (e) {
        $.logErr(e);
        $.msg($.name, "\u26a0\ufe0f 脚本错误", e.message || e);
    }
})()
    .catch((e) => {
        $.logErr(e);
        $.msg($.name, "\u26a0\ufe0f 脚本错误", e.message || e);
    })
    .finally(() => {
        // Loon: $done() 无参 = 放行原始请求（与 QX script-request-header 行为一致）
        $done();
    });

// =================== 通用框架：Request + Env ===================

// HTTP 请求封装
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
        const y =
            "string" == typeof s ? s : s && "form" == n ? $.queryStr(s) : $.toStr(s);

        const l = {
            url: c,
            headers: r,
            ...("post" === p && { body: y }),
            timeout: i,
        };

        const m = $.http[p.toLowerCase()](l).then((t) => {
            const rawBody = t && typeof t.body !== "undefined" ? t.body : t;
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

// 环境判断与工具类
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
                    // Loon / Surge / Stash — 兼容 resp.body 与 data 两种返回值
                    $httpClient[method](t, (err, resp, data) => {
                        if (err) return reject(err);
                        // resp.body 可能缺失，用 data 兜底
                        resolve(resp && typeof resp.body !== "undefined" ? resp : { body: data || "" });
                    });
                } else if (typeof $task !== "undefined") {
                    // Quantumult X
                    $task.fetch(t).then(
                        (resp) => resolve({ statusCode: resp.status, headers: resp.headers, body: resp.body }),
                        reject
                    );
                } else {
                    reject("unsupported environment");
                }
            });
        }
        get(t) {
            return this.send(t, "GET");
        }
        post(t) {
            return this.send(t, "POST");
        }
    }

    return new class {
        constructor(t, e) {
            this.name = t;
            this.http = new s(this);
            this.notifyMsg = [];
            this.startTime = new Date().getTime();
            this.log("\n\uD83D\uDD14", `${this.name}, 开始!`);
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
        isLoon() {
            return "Loon" === this.getEnv();
        }
        isQuanX() {
            return "Quantumult X" === this.getEnv();
        }
        isSurge() {
            return "Surge" === this.getEnv();
        }

        toObj(t, e = null) {
            try {
                return JSON.parse(t);
            } catch {
                return e;
            }
        }
        toStr(t, e = null) {
            try {
                return JSON.stringify(t);
            } catch {
                return e;
            }
        }
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

        msg(title = this.name, subtitle = "", body = "", options = {}) {
            const payload = () => {
                switch (this.getEnv()) {
                    case "Loon":
                    case "Quantumult X":
                    case "Surge":
                    default:
                        return options;
                }
            };
            if (typeof $notification !== "undefined") {
                $notification.post(title, subtitle, body, payload());
            } else if (typeof $notify !== "undefined") {
                $notify(title, subtitle, body, payload());
            }
            this.log("", `\uD83D\uDCE3 ${title}\n${subtitle}\n${body}`);
        }

        log(...args) {
            console.log(args.map((a) => a ?? "").join("\n"));
        }
        logErr(e) {
            this.log("", `\u2757\ufe0f ${this.name}, 错误!`, e.message || e, e.stack || "");
        }

        done(data) {
            const elapsed = ((new Date()).getTime() - this.startTime) / 1000;
            this.log("", `\uD83D\uDD14 ${this.name}, 结束! \uD83D\uDD5B ${elapsed.toFixed(2)} 秒\n`);
            // Loon / QX: $done() 无参表示放行原始请求
            if (data !== undefined) {
                $done(data);
            } else {
                $done();
            }
        }
    }(t, e);
}

/*
------------------------------------------
@Description: 微信读书 App — 点击订阅人数自动获取 bookId 并加入书架
@Author: TomCatXue (基于社区脚本重构，已整合至本项目仓库)
------------------------------------------
触发条件：点击微信读书中的订阅人数，App 请求 subscription/users?bookId=xxx
脚本自动：查询书籍信息 → 判断是否上架 → 加入书架 → 清理辅助书籍
使用方式：打开插件开关，进入微信读书 App，点击任意书籍的订阅人数即可触发。
*/

const $ = new Env("微信读书获取书籍");

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

// =================== 业务逻辑 ===================

// 查询书籍信息，判断是否从未上架（totalWords === 0 说明未上架）
async function checkBookInfo(bookId) {
  try {
    const opts = {
      url: `https://i.weread.qq.com/book/info?bookId=${bookId}`,
      type: "get",
      headers: {
        ...$request.headers,
        cookie: "wr_logined=1",
      },
    };
    $.log(`\n[INFO] 正在查询书籍[${bookId}]的基础信息...`);
    const res = await Request(opts);

    if (res && res.totalWords === 0) {
      $.log(`[INFO] 书籍[${bookId}]的 totalWords 为 0，说明该书籍从未上架。`);
      return false;
    }

    $.log(`[INFO] 书籍[${bookId}]正常，允许加入书架。`);
    return true;
  } catch (e) {
    $.log(`[ERROR] 查询书籍信息失败，将默认尝试添加书架: ${e}`);
    return true;
  }
}

// 查询某本书原本是否在书架上
async function isBookOnShelf(bookId) {
  try {
    const opts = {
      url: `https://weread.qq.com/web/shelf/bookIds?bookIds=${bookId}`,
      type: "get",
      headers: {
        ...$request.headers,
        cookie: "wr_logined=1",
      },
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
      headers: {
        ...$request.headers,
        cookie: "wr_logined=1",
      },
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
      headers: {
        ...$request.headers,
        cookie: "wr_logined=1",
      },
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
      $.msg($.name, "❌ 获取书籍ID失败", "未能从请求的 URL 中解析到 bookId");
      return;
    }

    // 1. 先查询书籍信息，验证是否从未上架
    const canAdd = await checkBookInfo(bookId);
    if (!canAdd) {
      $.msg($.name, "⚠️ 跳过解锁", `该书籍[${bookId}]从未上架（字数为 0），不进行添加书架操作。`);
      return;
    }

    // 2. 查询辅助凑数的书 (490081) 原本是否在书架上
    const builtinBookId = "490081";
    const builtinOnShelf = await isBookOnShelf(builtinBookId);
    const shouldCleanBuiltin = !builtinOnShelf;

    // 3. 加入书架
    const res = await addBook(bookId, shouldCleanBuiltin);

    if (res && res.succ) {
      $.msg($.name, "🎉 添加书籍成功", `成功添加书籍 ID: ${bookId}，切换页面即可食用！`);
    } else {
      $.msg($.name, "❌ 添加书籍失败", `请尝试其它书籍！\n错误信息: ${JSON.stringify(res)}`);
    }
  } catch (e) {
    $.logErr(e);
    $.msg($.name, "⛔️ 脚本运行错误", e.message || e);
  }
})()
  .catch((e) => {
    $.logErr(e);
    $.msg($.name, "⛔️ 脚本运行错误", e.message || e);
  })
  .finally(() => {
    $.done({ ok: 1 });
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
    const c = o.concat("post" === p ? "?" + $.queryStr(a) : "");
    const i = t.timeout ? (t.timeout > 1000 ? t.timeout : t.timeout * 1000) : 10000;

    "json" === n && (r["Content-Type"] = "application/json;charset=UTF-8");
    const y =
      "string" == typeof s ? s : s && "form" == n ? $.queryStr(s) : $.toStr(s);

    const l = {
      ...t,
      ...t?.opts ? t.opts : {},
      url: c,
      headers: r,
      ...("post" === p && { body: y }),
      ...("get" === p && a && { params: a }),
      timeout: i,
    };

    const m = $.http[p.toLowerCase()](l).then((t) =>
      "data" == u ? $.toObj(t.body) || t.body : $.toObj(t) || t
    );

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
      let s = this.get;
      "POST" === e && (s = this.post);
      return new Promise((resolve, reject) => {
        s.call(this, t, (err, resp, data) => {
          err ? reject(err) : resolve(resp);
        });
      });
    }
    get(t) {
      return this.send.call(this.env, t);
    }
    post(t) {
      return this.send.call(this.env, t, "POST");
    }
  }

  return new class {
    constructor(t, e) {
      this.name = t;
      this.http = new s(this);
      this.notifyMsg = [];
      this.startTime = new Date().getTime();
      this.log("\n🔔", `${this.name}, 开始!`);
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
            console.log(JSON.stringify(options));
            return options;
          case "Quantumult X":
            console.log(JSON.stringify(options));
            return options;
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
      this.log("", `📣 ${title}\n${subtitle}\n${body}`);
    }

    log(...args) {
      console.log(args.map((a) => a ?? "").join("\n"));
    }
    logErr(e) {
      this.log("", `❗️ ${this.name}, 错误!`, e.message || e, e.stack || "");
    }

    done(data = {}) {
      const elapsed = ((new Date()).getTime() - this.startTime) / 1000;
      this.log("", `🔔 ${this.name}, 结束! 🕛 ${elapsed.toFixed(2)} 秒\n`);
      $done(data);
    }
  }(t, e);
}

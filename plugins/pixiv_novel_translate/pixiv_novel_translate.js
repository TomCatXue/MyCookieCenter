/*
------------------------------------------
@Name: Pixiv 小说翻译
@Version: 1.4.0
@Desc: 在 Pixiv 小说阅读页注入翻译按钮，支持 Google 免费接口 / 微软翻译 / 百度翻译 / DeepSeek AI
@Author: TomCatXue
@Date: 2026-08-28

===== Loon =====
[MITM]
hostname = app-api.pixiv.net

[Script]
# 页面注入
http-response ^https://app-api\.pixiv\.net/webview/v2/novel script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/pixiv_novel_translate/pixiv_novel_translate.js, requires-body=true, timeout=30
# 翻译中转：用 http-request 直接拦截，不经过上游，避免上游非 JSON 响应导致 Loon 报
# “JSON Parse error: Unrecognized token '<'”（http-response 会在脚本执行前解析响应体）
http-request ^https://app-api\.pixiv\.net/pxtrans script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/pixiv_novel_translate/pixiv_novel_translate.js, requires-body=true, timeout=60
------------------------------------------
*/

// ─── Env 类（内联，兼容 Loon / Surge / Stash / Quantumult X / Node）──────────
// prettier-ignore
function Env(t) { return new class { constructor(t) { this.name = t, this.startTime = new Date().getTime(), this.logSeparator = "\n", this.logs = [], this.isMute = !1, this.encoding = "utf-8", this.isNode() ? (this.fs = require("fs"), this.path = require("path"), this.dataFile = this.path.resolve(process.cwd(), "boxjs.json"), this.fs.existsSync(this.dataFile) || this.fs.writeFileSync(this.dataFile, "{}"), this.data = this.loadData()) : this.data = {} } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } isStash() { return "undefined" != typeof $environment && $environment["stash-version"] } loadData() { if (this.isNode()) { try { return JSON.parse(this.fs.readFileSync(this.dataFile)) } catch (e) { return {} } } return {} } getdata(t) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.read(t); if (this.isQuanX()) return $prefs.valueForKey(t); if (this.isNode()) return this.data[t] || "" } setdata(t, e) { if (this.isSurge() || this.isLoon() || this.isStash()) return $persistentStore.write(t, e); if (this.isQuanX()) return $prefs.setValueForKey(t, e); if (this.isNode()) return this.data[e] = t, this.fs.writeFileSync(this.dataFile, JSON.stringify(this.data)), !0 } get(t) { return this.send(t, "GET") } post(t) { return this.send(t, "POST") } send(t, e) { return new Promise((s, i) => { if (this.isSurge() || this.isLoon() || this.isStash()) { "GET" === e ? $httpClient.get(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) : $httpClient.post(t, (t, e, o) => { t ? i(t) : s({ status: e.statusCode, headers: e.headers, body: o }) }) } else if (this.isQuanX()) { t.method = e, $task.fetch(t).then(t => s({ status: t.statusCode, headers: t.headers, body: t.body }), t => i(t)) } else if (this.isNode()) { const o = require(t.url.startsWith("https:") ? "https" : "http"), r = new URL(t.url), n = { method: e, hostname: r.hostname, port: r.port || (r.protocol === "https:" ? 443 : 80), path: r.pathname + r.search, headers: t.headers || {} }; const req = o.request(n, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => s({ status: res.statusCode, headers: res.headers, body: d })) }); req.on("error", i); if (t.body) req.write(t.body); req.end() } }) } msg(t, e, s) { if (this.isMute) return; if (this.isSurge() || this.isLoon() || this.isStash()) $notification.post(t, e || "", s || ""); else if (this.isQuanX()) $notify(t, e || "", s || ""); else if (this.isNode()) console.log(`\n${t}\n${e || ""}\n${s || ""}`) } log(...t) { this.logs.push(t.join(this.logSeparator)), console.log(t.join(this.logSeparator)) } logErr(t) { this.log(`❌ ${t.message || t}`) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { if (this.isQuanX()) $done(t); else if (this.isSurge() || this.isLoon() || this.isStash()) $done(t) } }(t) }

const $ = new Env("Pixiv 小说翻译");

// Loon/Surge/Stash 的 $httpClient 请求超时默认只有 5 秒，而 DeepSeek 等 AI 接口
// 单次响应常要 5~10 秒，导致页面报 "Request timeout"。这里给所有出站请求显式加
// timeout=60000（毫秒 = 60 秒）。同时用 Promise.race 兜底：某些版本不识别
// $httpClient 的 timeout 参数，由 setTimeout 强制 60 秒超时。
{
  const PXTC_REQ_TIMEOUT = 60000;
  const pxtcSend = $.send.bind($);
  $.send = function (opts, method) {
    if (opts && typeof opts === "object" && opts.timeout == null) {
      opts = Object.assign({}, opts, { timeout: PXTC_REQ_TIMEOUT });
    }
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        // 加前缀标记真正的 60s 超时，供 handleProxy 区分“响应太慢”与“连接失败”
        reject(new Error("__PXTC_TIMEOUT__请求超时（" + (PXTC_REQ_TIMEOUT / 1000) + "s）"));
      }, PXTC_REQ_TIMEOUT);
      pxtcSend(opts, method).then(function (res) {
        clearTimeout(timer);
        resolve(res);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  };
}

const SCRIPT_VERSION = "20260828-r15";

const PXTC_LANG_MAP = {
  "zh-CN": { google: "zh-CN", microsoft: "zh-Hans", baidu: "zh", deepseek: "Simplified Chinese" },
  "zh-TW": { google: "zh-TW", microsoft: "zh-Hant", baidu: "cht", deepseek: "Traditional Chinese" },
  "en": { google: "en", microsoft: "en", baidu: "en", deepseek: "English" },
  "ja": { google: "ja", microsoft: "ja", baidu: "jp", deepseek: "Japanese" },
  "ko": { google: "ko", microsoft: "ko", baidu: "kor", deepseek: "Korean" }
};

// google 默认分块从 1500 降到 400：块更小更贴合小说段落节奏，边翻边显示更顺滑、
// 阅读体验更好（代价是请求次数增多，配合 googleapis.com 优先 + 限流窗口 + 本地缓存兜底）。
// 可在 Loon 参数里用 chunk=xxx 调整分块大小（100~3000）。
// 每请求默认字符上限：google/baidu 支持一次请求带多段（多 q），因此比原来提高；
// deepseek 默认 3000：LLM 有固定请求开销，大批量更高效（批数减半，总耗时下降）；
// 串行/低并发下 RPM 不是瓶颈，不会触发限流。
const PXTC_CHUNK_LIMITS = { google: 2000, microsoft: 4500, baidu: 2000, deepseek: 3000 };

function parseArgument() {
  const out = {};
  // Loon 新版可能把 argument=[{...}] 替换后的 $argument 传成对象，两种形态都支持
  if (typeof $argument === "object" && $argument !== null) {
    const keys = Object.keys($argument);
    for (let i = 0; i < keys.length; i++) {
      const v = $argument[keys[i]];
      out[keys[i]] = v === undefined || v === null ? "" : String(v);
    }
    return out;
  }
  const arg = typeof $argument === "string" ? $argument : "";
  if (!arg) return out;
  // 兼容以 JSON 字符串传入的 $argument（某些平台/版本形态）
  const trimmed = arg.trim();
  if (trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[") {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object") {
        const keys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
          const v = obj[keys[i]];
          out[keys[i]] = v === undefined || v === null ? "" : String(v);
        }
        return out;
      }
    } catch (e) { /* 不是 JSON，按 query 字符串继续解析 */ }
  }
  const pairs = arg.split("&");
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx === -1) {
      out[pair.trim()] = "true";
      continue;
    }
    let key = pair.substring(0, idx).trim();
    let value = pair.substring(idx + 1).trim();
    try { value = decodeURIComponent(value); } catch (e) { }
    out[key] = value;
  }
  return out;
}

// Loon 插件 [Argument] 段的值由 Loon 写入 $persistentStore（key = 参数名），
// 而 $argument 只包含规则行 argument="..." 的静态内容（未写 argument= 时为空）。
// 因此统一先看 $argument、再回退 $persistentStore，兼容 Loon 各版本及其它平台。
function pxtcArg(args, key) {
  let v = args[key];
  if (v === undefined || v === "") {
    try { v = $.getdata(key); } catch (e) { }
  }
  v = v === undefined || v === null ? "" : String(v);
  return v.trim();
}

function parseQuery(url) {
  const out = {};
  const idx = String(url).indexOf("?");
  if (idx === -1) return out;
  const pairs = String(url).substring(idx + 1).split("&");
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      out[pair] = "";
      continue;
    }
    let key = pair.substring(0, eq);
    let value = pair.substring(eq + 1);
    try { key = decodeURIComponent(key); } catch (e) { }
    try { value = decodeURIComponent(value); } catch (e) { }
    out[key] = value;
  }
  return out;
}

function getConfig() {
  const args = parseArgument();
  let translator = String(pxtcArg(args, "translator") || "google").toLowerCase();
  let target = String(pxtcArg(args, "target") || "zh-CN");
  if (!PXTC_LANG_MAP[target]) target = "zh-CN";
  if (translator !== "microsoft" && translator !== "baidu" && translator !== "deepseek") translator = "google";
  // 分块大小：0 = 客户端按各翻译源默认；可在参数里用 chunk=300 全局覆盖（100~3000）
  let chunk = parseInt(pxtcArg(args, "chunk"), 10);
  if (Number.isFinite(chunk) && chunk >= 100) chunk = Math.min(chunk, 3000);
  else chunk = 0;
  return {
    translator: translator,
    target: target,
    chunk: chunk,
    hasMs: !!(pxtcArg(args, "ms_key")),
    hasBaidu: !!(pxtcArg(args, "baidu_appid") && pxtcArg(args, "baidu_secret")),
    hasDeepSeek: !!(pxtcArg(args, "deepseek_api_key"))
  };
}

function md5(str) {
  function rl(n, s) { return (n << s) | (n >>> (32 - s)); }
  function au(x, y) { return (x + y) >>> 0; }
  function F(x, y, z) { return (x & y) | (~x & z); }
  function G(x, y, z) { return (x & z) | (y & ~z); }
  function H(x, y, z) { return x ^ y ^ z; }
  function I(x, y, z) { return y ^ (x | ~z); }
  function FF(a, b, c, d, x, s, ac) { a = au(a, au(au(F(b, c, d), x), ac)); return au(rl(a, s), b); }
  function GG(a, b, c, d, x, s, ac) { a = au(a, au(au(G(b, c, d), x), ac)); return au(rl(a, s), b); }
  function HH(a, b, c, d, x, s, ac) { a = au(a, au(au(H(b, c, d), x), ac)); return au(rl(a, s), b); }
  function II(a, b, c, d, x, s, ac) { a = au(a, au(au(I(b, c, d), x), ac)); return au(rl(a, s), b); }
  function utf8(s) {
    s = s.replace(/\r\n/g, "\n");
    let u = "";
    for (let n = 0; n < s.length; n++) {
      const c = s.charCodeAt(n);
      if (c < 128) u += String.fromCharCode(c);
      else if (c < 2048) { u += String.fromCharCode((c >> 6) | 192); u += String.fromCharCode((c & 63) | 128); }
      else { u += String.fromCharCode((c >> 12) | 224); u += String.fromCharCode(((c >> 6) & 63) | 128); u += String.fromCharCode((c & 63) | 128); }
    }
    return u;
  }
  function toWords(s) {
    const nBytes = s.length;
    const nWords = (((nBytes + 8) >> 6) + 1) * 16;
    const w = [];
    for (let i = 0; i < nWords; i++) w[i] = 0;
    let i = 0;
    for (i = 0; i < nBytes; i++) w[i >> 2] |= s.charCodeAt(i) << ((i % 4) * 8);
    w[i >> 2] |= 0x80 << ((i % 4) * 8);
    w[nWords - 2] = nBytes << 3;
    w[nWords - 1] = nBytes >>> 29;
    return w;
  }
  function toHex(num) {
    let h = "";
    for (let j = 0; j <= 3; j++) {
      const b = (num >>> (j * 8)) & 255;
      const t = "0" + b.toString(16);
      h += t.substr(t.length - 2, 2);
    }
    return h;
  }
  str = utf8(str);
  const x = toWords(str);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let k = 0; k < x.length; k += 16) {
    const aa = a, bb = b, cc = c, dd = d;
    a = FF(a, b, c, d, x[k + 0], 7, 0xd76aa478); d = FF(d, a, b, c, x[k + 1], 12, 0xe8c7b756);
    c = FF(c, d, a, b, x[k + 2], 17, 0x242070db); b = FF(b, c, d, a, x[k + 3], 22, 0xc1bdceee);
    a = FF(a, b, c, d, x[k + 4], 7, 0xf57c0faf); d = FF(d, a, b, c, x[k + 5], 12, 0x4787c62a);
    c = FF(c, d, a, b, x[k + 6], 17, 0xa8304613); b = FF(b, c, d, a, x[k + 7], 22, 0xfd469501);
    a = FF(a, b, c, d, x[k + 8], 7, 0x698098d8); d = FF(d, a, b, c, x[k + 9], 12, 0x8b44f7af);
    c = FF(c, d, a, b, x[k + 10], 17, 0xffff5bb1); b = FF(b, c, d, a, x[k + 11], 22, 0x895cd7be);
    a = FF(a, b, c, d, x[k + 12], 7, 0x6b901122); d = FF(d, a, b, c, x[k + 13], 12, 0xfd987193);
    c = FF(c, d, a, b, x[k + 14], 17, 0xa679438e); b = FF(b, c, d, a, x[k + 15], 22, 0x49b40821);
    a = GG(a, b, c, d, x[k + 1], 5, 0xf61e2562); d = GG(d, a, b, c, x[k + 6], 9, 0xc040b340);
    c = GG(c, d, a, b, x[k + 11], 14, 0x265e5a51); b = GG(b, c, d, a, x[k + 0], 20, 0xe9b6c7aa);
    a = GG(a, b, c, d, x[k + 5], 5, 0xd62f105d); d = GG(d, a, b, c, x[k + 10], 9, 0x02441453);
    c = GG(c, d, a, b, x[k + 15], 14, 0xd8a1e681); b = GG(b, c, d, a, x[k + 4], 20, 0xe7d3fbc8);
    a = GG(a, b, c, d, x[k + 9], 5, 0x21e1cde6); d = GG(d, a, b, c, x[k + 14], 9, 0xc33707d6);
    c = GG(c, d, a, b, x[k + 3], 14, 0xf4d50d87); b = GG(b, c, d, a, x[k + 8], 20, 0x455a14ed);
    a = GG(a, b, c, d, x[k + 13], 5, 0xa9e3e905); d = GG(d, a, b, c, x[k + 2], 9, 0xfcefa3f8);
    c = GG(c, d, a, b, x[k + 7], 14, 0x676f02d9); b = GG(b, c, d, a, x[k + 12], 20, 0x8d2a4c8a);
    a = HH(a, b, c, d, x[k + 5], 4, 0xfffa3942); d = HH(d, a, b, c, x[k + 8], 11, 0x8771f681);
    c = HH(c, d, a, b, x[k + 11], 16, 0x6d9d6122); b = HH(b, c, d, a, x[k + 14], 23, 0xfde5380c);
    a = HH(a, b, c, d, x[k + 1], 4, 0xa4beea44); d = HH(d, a, b, c, x[k + 4], 11, 0x4bdecfa9);
    c = HH(c, d, a, b, x[k + 7], 16, 0xf6bb4b60); b = HH(b, c, d, a, x[k + 10], 23, 0xbebfbc70);
    a = HH(a, b, c, d, x[k + 13], 4, 0x289b7ec6); d = HH(d, a, b, c, x[k + 0], 11, 0xeaa127fa);
    c = HH(c, d, a, b, x[k + 3], 16, 0xd4ef3085); b = HH(b, c, d, a, x[k + 6], 23, 0x04881d05);
    a = HH(a, b, c, d, x[k + 9], 4, 0xd9d4d039); d = HH(d, a, b, c, x[k + 12], 11, 0xe6db99e5);
    c = HH(c, d, a, b, x[k + 15], 16, 0x1fa27cf8); b = HH(b, c, d, a, x[k + 2], 23, 0xc4ac5665);
    a = II(a, b, c, d, x[k + 0], 6, 0xf4292244); d = II(d, a, b, c, x[k + 7], 10, 0x432aff97);
    c = II(c, d, a, b, x[k + 14], 15, 0xab9423a7); b = II(b, c, d, a, x[k + 5], 21, 0xfc93a039);
    a = II(a, b, c, d, x[k + 12], 6, 0x655b59c3); d = II(d, a, b, c, x[k + 3], 10, 0x8f0ccc92);
    c = II(c, d, a, b, x[k + 10], 15, 0xffeff47d); b = II(b, c, d, a, x[k + 1], 21, 0x85845dd1);
    a = II(a, b, c, d, x[k + 8], 6, 0x6fa87e4f); d = II(d, a, b, c, x[k + 15], 10, 0xfe2ce6e0);
    c = II(c, d, a, b, x[k + 6], 15, 0xa3014314); b = II(b, c, d, a, x[k + 13], 21, 0x4e0811a1);
    a = II(a, b, c, d, x[k + 4], 6, 0xf7537e82); d = II(d, a, b, c, x[k + 11], 10, 0xbd3af235);
    c = II(c, d, a, b, x[k + 2], 15, 0x2ad7d2bb); b = II(b, c, d, a, x[k + 9], 21, 0xeb86d391);
    a = au(a, aa); b = au(b, bb); c = au(c, cc); d = au(d, dd);
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// Google 免费接口限流露出 429 + HTML（body 以 < 开头），Loon 的 $httpClient 会尝试
// JSON.parse 该 HTML 并报 “JSON Parse error: Unrecognized token '<'”。防御三层：
// 1) 限流窗口写入 $persistentStore（跨 Loon 脚本调用保留），窗口内快速失败；
// 2) 识别 status=429 / HTML 响应，自动进入 60 秒限流窗口；
// 3) 把 Loon 层 JSON 解析错误归一化为可读文案。
let _pxtcRateLimitUntil = 0;

function pxtcIsRateLimited() {
  if (_pxtcRateLimitUntil > Date.now()) return true;
  const saved = $.getdata("pxtc_grl_until");
  const until = saved ? parseInt(saved, 10) : 0;
  if (until > Date.now()) { _pxtcRateLimitUntil = until; return true; }
  return false;
}

function pxtcSetRateLimit(ms) {
  const until = Date.now() + ms;
  _pxtcRateLimitUntil = until;
  try { $.setdata(String(until), "pxtc_grl_until"); } catch (e) { }
}

// 判断是否为 Google 限流响应：HTTP 429，或返回的是 HTML（reCAPTCHA 风控页，body 以 < 开头）
function pxtcIsRateLimitResponse(status, raw) {
  if (status === 429) return true;
  if (typeof raw === "string" && /^\s*</.test(raw)) return true;
  if (typeof raw === "string" && /unusual traffic|异常流量|automated requests|自动程序/i.test(raw)) return true;
  return false;
}

// Worker 代理配置（在 handleProxy 中设置，googleTranslateBatch 中读取）。
// 配置后 Google 翻译请求不再直连 Google，而是走 Cloudflare Worker 代理，
// 把限流压力从设备 IP 转移到 Worker IP，并享受服务端 KV 缓存。
let _pxtcGoogleProxy = null;

// 通过 Worker 代理翻译：把 {texts:[...]} 发给 Worker，Worker 调 Google 并返回结果。
async function googleTranslateViaProxy(texts, target, proxy) {
  const arr = texts.map(String);
  if (!arr.length) return [];
  // 自动补全 /translate 路径：允许用户填裸域名（https://xxx.workers.dev）
  // 或带路径（https://xxx.workers.dev/translate），避免请求落到根路径返回 not found。
  let base = String(proxy.url || "").replace(/\/+$/, "");
  if (!/\/translate$/.test(base)) base += "/translate";
  const headers = { "Content-Type": "application/json" };
  if (proxy.token) headers["x-worker-token"] = proxy.token;
  const res = await $.post({
    url: base + "?t=google&l=" + encodeURIComponent(target),
    headers: headers,
    body: JSON.stringify({ texts: arr })
  });
  const raw = res && res.body;
  let data;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (e) {
      throw new Error("Worker 代理返回非 JSON（" + (res.status || res.statusCode) + "）");
    }
  } else if (raw && typeof raw === "object") {
    data = raw;
  } else {
    throw new Error("Worker 代理返回空响应");
  }
  if (!data || !data.ok) {
    throw new Error((data && data.error) || "Worker 代理翻译失败");
  }
  // Worker 批量返回 translations 数组
  if (Array.isArray(data.translations) && data.translations.length === arr.length) {
    return data.translations;
  }
  // 兼容单段返回
  if (data.translation !== undefined && arr.length === 1) return [data.translation];
  // 多段请求但 Worker 只回了单段 translation：通常是部署了旧版 worker.js
  // （只支持裸文本单段，会把整个 {texts:[...]} JSON 当一段文本翻译）。
  throw new Error("Worker 代理返回段数不匹配：请重新部署当前仓库最新 worker.js（支持 {texts:[...]} 批量协议，见 worker/README.md）");
}

// Google 免费接口批量翻译：一次请求带多个 q（POST form 编码），实测
// translate.googleapis.com / google.com / google.hk 的 /translate_a/t 都支持，
// 返回与 q 一一对应的 [[译文, 源语言], ...]，一次可翻几十段，请求次数大幅减少，
// 是避免 429 最有效的办法。
async function googleTranslateBatch(texts, target) {
  // 配置了 Worker 代理时走代理，不直连 Google
  if (_pxtcGoogleProxy) {
    return googleTranslateViaProxy(texts, target, _pxtcGoogleProxy);
  }
  // 限流窗口内快速失败，避免继续打 Google 加剧限流
  if (pxtcIsRateLimited()) {
    throw new Error("Google 限流中，请稍后再试（已自动暂停约 60 秒）");
  }
  const arr = texts.map(String);
  if (!arr.length) return [];
  const params = "client=gtx&dt=t&sl=auto&tl=" + encodeURIComponent(target);
  const body = arr.map(function (t) { return "q=" + encodeURIComponent(t); }).join("&");
  // 实测 googleapis.com 比 google.hk 更不易被 429（hk 经常返回 reCAPTCHA 页），放最前
  const hosts = [
    "https://translate.googleapis.com/translate_a/t",
    "https://translate.google.com/translate_a/t",
    "https://translate.google.hk/translate_a/t"
  ];
  let lastError = null;
  let sawRateLimit = false;
  for (let i = 0; i < hosts.length; i++) {
    try {
      const res = await $.post({
        url: hosts[i] + "?" + params,
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: body
      });
      const status = res && (res.status || res.statusCode);
      const raw = res && res.body;
      // 单个域名 429 不代表全部域名都限流：先标记、继续试下一个域名，
      // 避免“hk 429 却把仍可用的 googleapis.com 一起挡掉”（实测 hk 429 时 googleapis.com 仍 200）
      if (pxtcIsRateLimitResponse(status, raw)) {
        sawRateLimit = true;
        lastError = new Error("Google 限流（429）");
        continue;
      }
      // Loon 的 $httpClient 可能已把合法 JSON 响应 parse 成对象，两种形态都要兼容
      let data;
      if (typeof raw === "string") {
        try { data = JSON.parse(raw); } catch (e) {
          throw new Error("Google 接口异常（返回非 JSON），请稍后重试");
        }
      } else if (raw && typeof raw === "object") {
        data = raw;
      } else {
        throw new Error("Google 返回空响应");
      }
      if (!Array.isArray(data) || data.length !== arr.length) {
        // 段数对不上：多段时退回逐个翻译，单段直接报格式异常
        if (arr.length === 1) throw new Error("Google 返回格式异常");
        const fallback = [];
        for (let k = 0; k < arr.length; k++) fallback.push(await googleTranslateSingle(arr[k], target));
        return fallback;
      }
      const out = [];
      for (let j = 0; j < arr.length; j++) {
        const item = data[j];
        if (Array.isArray(item) && typeof item[0] === "string") out.push(item[0]);
        else throw new Error("Google 返回段数不匹配");
      }
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  // 只有全部域名都失败才进入 60 秒限流窗口，避免误伤仍可用的域名
  if (sawRateLimit) {
    pxtcSetRateLimit(60000);
    throw new Error("Google 全部接口均限流（429），已自动暂停约 60 秒，请稍后再试");
  }
  throw lastError || new Error("Google 翻译失败");
}

async function googleTranslateSingle(text, target) {
  const r = await googleTranslateBatch([text], target);
  return r[0] || "";
}

async function googleTranslate(text, target) {
  return googleTranslateSingle(text, target);
}

// 微软翻译本身支持一次请求翻译一个数组，批量翻译一次 HTTP 调用即可
async function msTranslateBatch(texts, target, key) {
  const arr = texts.map(String);
  if (!arr.length) return [];
  const res = await $.post({
    url: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=" + encodeURIComponent(target),
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key
    },
    body: JSON.stringify(arr.map(function (t) { return { Text: t }; }))
  });
  const raw = res && res.body;
  let data;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (e) { throw new Error("微软翻译返回非 JSON"); }
  } else if (raw && typeof raw === "object") {
    data = raw;
  } else {
    throw new Error("微软翻译返回空响应");
  }
  if (!Array.isArray(data) || data.length !== arr.length) throw new Error("微软翻译返回格式异常");
  const out = [];
  for (let i = 0; i < data.length; i++) {
    if (!data[i] || !data[i].translations || !data[i].translations[0]) throw new Error("微软翻译返回格式异常");
    out.push(data[i].translations[0].text);
  }
  return out;
}

async function msTranslate(text, target, key) {
  const r = await msTranslateBatch([text], target, key);
  return r[0] || "";
}

async function baiduTranslate(text, target, appid, secret) {
  const salt = String(Date.now());
  const sign = md5(appid + text + salt + secret);
  const url = "https://fanyi-api.baidu.com/api/trans/vip/translate?q=" + encodeURIComponent(text) +
    "&from=auto&to=" + encodeURIComponent(target) +
    "&appid=" + encodeURIComponent(appid) +
    "&salt=" + salt + "&sign=" + sign;
  const res = await $.get({
    url: url,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const raw = res && res.body;
  let data;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (e) { throw new Error("百度翻译返回非 JSON"); }
  } else if (raw && typeof raw === "object") {
    data = raw;
  } else {
    throw new Error("百度翻译返回空响应");
  }
  if (data && data.error_code) throw new Error("百度翻译 " + data.error_code + " " + (data.error_msg || ""));
  if (!data || !Array.isArray(data.trans_result)) throw new Error("百度翻译返回格式异常");
  let out = "";
  for (let i = 0; i < data.trans_result.length; i++) {
    if (data.trans_result[i] && data.trans_result[i].dst) out += data.trans_result[i].dst;
  }
  return out;
}

// 百度批量：逐个调用单段接口（签名与多 q 拼接规则不确定，不冒险合并）
async function baiduTranslateBatch(texts, target, appid, secret) {
  const arr = texts.map(String);
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(await baiduTranslate(arr[i], target, appid, secret));
  }
  return out;
}

// DeepSeek（兼容 OpenAI 格式）AI 翻译。沉浸式翻译风格的系统提示，保证文学性 + 保留格式。
async function deepseekTranslate(text, targetLangName, apiUrl, apiKey, model) {
  const systemPrompt =
    "You are a professional literary translator. Translate the following text into " +
    targetLangName +
    ". Preserve all formatting, line breaks, and paragraph breaks exactly. " +
    "Translate naturally and fluently with literary quality. " +
    "Output ONLY the translated text, no explanations, no quotes around the output.";
  const res = await $.post({
    url: apiUrl,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: model || "deepseek-v4-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0.3,
      stream: false
    })
  });
  const raw = res && res.body;
  let data;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (e) {
      throw new Error("DeepSeek 返回非 JSON（" + (res.status || res.statusCode) + "）");
    }
  } else if (raw && typeof raw === "object") {
    data = raw;
  } else {
    throw new Error("DeepSeek 返回空响应");
  }
  if (data && data.error) {
    const errMsg = data.error.message || data.error.code || JSON.stringify(data.error);
    throw new Error("DeepSeek 错误：" + errMsg);
  }
  if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("DeepSeek 返回格式异常");
  }
  return data.choices[0].message.content || "";
}

// DeepSeek 批量：把多段打包成 JSON segments 一次请求让模型翻完（沉浸式翻译同思路），
// 返回按 id 对齐；模型没按 JSON 格式返回时逐个翻译兜底。
async function deepseekTranslateBatch(texts, targetLangName, apiUrl, apiKey, model) {
  const arr = texts.map(String);
  if (!arr.length) return [];
  if (arr.length === 1) return [await deepseekTranslate(arr[0], targetLangName, apiUrl, apiKey, model)];
  const systemPrompt =
    "You are a professional literary translator. You will receive a JSON array of segments, " +
    "each segment has an \"id\" and a \"text\". Translate every segment's text into " + targetLangName + ". " +
    "Keep line breaks inside each translation. " +
    "Respond with ONLY a JSON array of objects, each with \"id\" and \"translation\" (the translated text for that id), " +
    "one object per segment, in the same order. No explanations, no markdown code fences, no extra text.";
  const res = await $.post({
    url: apiUrl,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: model || "deepseek-v4-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(arr.map(function (t, i) { return { id: i, text: t }; })) }
      ],
      temperature: 0.3,
      stream: false
    })
  });
  const raw = res && res.body;
  let data;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch (e) {
      throw new Error("DeepSeek 返回非 JSON（" + (res.status || res.statusCode) + "）");
    }
  } else if (raw && typeof raw === "object") {
    data = raw;
  } else {
    throw new Error("DeepSeek 返回空响应");
  }
  if (data && data.error) {
    const errMsg = data.error.message || data.error.code || JSON.stringify(data.error);
    throw new Error("DeepSeek 错误：" + errMsg);
  }
  if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("DeepSeek 返回格式异常");
  }
  let content = String(data.choices[0].message.content || "").trim();
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  let parsed = null;
  try { parsed = JSON.parse(content); } catch (e) { parsed = null; }
  if (Array.isArray(parsed)) {
    const map = {};
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (item && item.id !== undefined) {
        map[item.id] = item.translation !== undefined ? item.translation : (item.translatedText !== undefined ? item.translatedText : "");
      }
    }
    const out = [];
    let ok = true;
    for (let i = 0; i < arr.length; i++) {
      if (map[i] === undefined) { ok = false; break; }
      out.push(map[i]);
    }
    if (ok) return out;
  }
  // JSON 协议失效（模型没按格式返回）时逐个翻译兜底
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(await deepseekTranslate(arr[i], targetLangName, apiUrl, apiKey, model));
  }
  return out;
}

const PXTC_CSS = "#pxtc-fab{position:fixed;right:10px;bottom:150px;z-index:2147483647;width:48px;height:48px;border-radius:50%;border:0;background:#0096fa;color:#fff;font-size:16px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;}" +
  "#pxtc-panel{position:fixed;right:10px;bottom:200px;z-index:2147483646;width:320px;max-width:calc(100vw - 32px);max-height:70vh;overflow:auto;background:#fff;color:#1a1a1a;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.35);font:14px/1.6 -apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;padding:12px 14px;box-sizing:border-box;}" +
  "#pxtc-panel .pxtc-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:8px;}" +
  "#pxtc-panel .pxtc-close{width:26px;height:26px;border:0;border-radius:50%;background:#eee;color:#333;font-size:16px;line-height:1;cursor:pointer;}" +
  "#pxtc-panel .pxtc-row{display:block;margin:8px 0;}" +
  "#pxtc-panel .pxtc-select{display:block;width:100%;margin-top:4px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#1a1a1a;}" +
  "#pxtc-panel .pxtc-actions{display:flex;gap:8px;margin-top:10px;}" +
  "#pxtc-panel .pxtc-btn{flex:1;padding:8px 0;border:1px solid #d0d0d0;border-radius:6px;background:#f6f6f6;color:#1a1a1a;font-size:14px;cursor:pointer;}" +
  "#pxtc-panel .pxtc-primary{background:#0096fa;border-color:#0096fa;color:#fff;}" +
  "#pxtc-panel .pxtc-status{margin-top:10px;min-height:20px;color:#555;word-break:break-all;}" +
  ".pxtc-reader{max-width:720px;margin:0 auto;padding:20px 16px 110px;background:transparent;color:inherit;}" +
  ".pxtc-chunk{margin-bottom:22px;padding-bottom:16px;border-bottom:1px solid rgba(127,127,127,.35);}" +
  ".pxtc-orig p{margin:4px 0;color:inherit;opacity:.55;line-height:1.8;}" +
  ".pxtc-trans p{margin:4px 0;color:inherit;line-height:1.8;}" +
  ".pxtc-error{margin-top:6px;color:#c0392b;font-size:13px;word-break:break-all;}";

function __pxtc_client() {
  (function () {
    var cfg = window.__PXTC_CONFIG || { translator: "google", target: "zh-CN", hasMs: false, hasBaidu: false, hasDeepSeek: false };
    var root = null;
    var reader = null;
    var originalDisplay = "";
    var busy = false;
    var panel = null;
    var statusEl = null;
    var selT = null;
    var selL = null;

    function createEl(tag, className, html) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (html !== undefined) node.innerHTML = html;
      return node;
    }

    function esc(value) {
      return String(value).replace(/[&<>"']/g, function (ch) {
        if (ch === "&") return "&amp;";
        if (ch === "<") return "&lt;";
        if (ch === ">") return "&gt;";
        if (ch === '"') return "&quot;";
        return "&#39;";
      });
    }

    function setStatus(text, color) {
      if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color || "";
      }
    }

    function normalizeText(text) {
      return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }

    function splitParagraphs(text) {
      text = normalizeText(text).replace(/^\n+|\n+$/g, "");
      if (!text) return [];
      return text.split(/\n{2,}/);
    }

    function splitLongParagraph(paragraph, max) {
      var lines = paragraph.split("\n");
      var out = [];
      var buffer = "";
      function pushPiece(piece) {
        while (piece.length > max) {
          out.push(piece.substring(0, max));
          piece = piece.substring(max);
        }
        if (piece) out.push(piece);
      }
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.length > max) {
          if (buffer) { out.push(buffer); buffer = ""; }
          pushPiece(line);
        } else {
          var next = buffer ? buffer + "\n" + line : line;
          if (next.length > max && buffer) {
            out.push(buffer);
            buffer = line;
          } else {
            buffer = next;
          }
        }
      }
      if (buffer) out.push(buffer);
      return out;
    }

    // 每批上限：chars=单请求最大字符数（可用插件参数 chunk 覆盖），segs=单请求最多段落数。
    // Google/Bing 一次请求可带很多段，AI 一次请求不宜太多段（生成时间随段数增长）。
    var PXTC_BATCH_LIMITS = {
      google: { chars: 2000, segs: 20 },
      microsoft: { chars: 4500, segs: 50 },
      baidu: { chars: 2000, segs: 10 },
      deepseek: { chars: 3000, segs: 12 }
    };

    function buildBatches(paragraphs, limits) {
      var batches = [];
      var current = [];
      var currentLen = 0;
      function pushCurrent() {
        if (current.length) {
          batches.push(current);
          current = [];
          currentLen = 0;
        }
      }
      for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        if (p.length > limits.chars) {
          pushCurrent();
          var pieces = splitLongParagraph(p, limits.chars);
          for (var j = 0; j < pieces.length; j++) {
            if (current.length && (current.length >= limits.segs || currentLen + pieces[j].length > limits.chars)) pushCurrent();
            current.push(pieces[j]);
            currentLen += pieces[j].length;
          }
        } else {
          if (current.length && (current.length >= limits.segs || currentLen + p.length > limits.chars)) pushCurrent();
          current.push(p);
          currentLen += p.length;
        }
      }
      pushCurrent();
      return batches;
    }

    function renderParagraphs(text) {
      var paras = String(text || "").split(/\n{2,}/);
      var html = "";
      for (var i = 0; i < paras.length; i++) {
        html += '<p>' + esc(paras[i]).replace(/\n/g, "<br>") + "</p>";
      }
      return html;
    }

    function pxtcCacheKey(text) {
      return cfg.translator + ":" + cfg.target + ":" + text.length + ":" + text.slice(0, 48);
    }
    function pxtcCacheRead(key) {
      try {
        var all = localStorage.getItem("pxtc-cache-v2");
        var map = all ? JSON.parse(all) : {};
        if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
      } catch (e) { }
      return undefined;
    }
    function pxtcCacheWrite(key, value) {
      try {
        var all = localStorage.getItem("pxtc-cache-v2");
        var map = all ? JSON.parse(all) : {};
        map[key] = value;
        var keys = Object.keys(map);
        // 只保留最近 300 条，防止 localStorage 无限增长
        if (keys.length > 300) {
          var keep = keys.slice(keys.length - 300);
          var m = {};
          for (var i = 0; i < keep.length; i++) m[keep[i]] = map[keep[i]];
          map = m;
        }
        localStorage.setItem("pxtc-cache-v2", JSON.stringify(map));
      } catch (e) { }
    }

    // 批量翻译：先查缓存命中段落，未命中的一次 POST 发给服务端批量翻译
    function translateBatch(texts) {
      var results = new Array(texts.length);
      var need = [];
      var needIdx = [];
      for (var i = 0; i < texts.length; i++) {
        var key = pxtcCacheKey(texts[i]);
        var cached = pxtcCacheRead(key);
        if (cached !== undefined) {
          results[i] = cached;
        } else {
          need.push(texts[i]);
          needIdx.push(i);
        }
      }
      if (!need.length) return Promise.resolve(results);
      var url = "/pxtrans?t=" + encodeURIComponent(cfg.translator) + "&l=" + encodeURIComponent(cfg.target);
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: need })
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || "翻译失败");
          var trans = data.translations;
          if (!Array.isArray(trans) || trans.length !== need.length) {
            // 兼容旧版服务端单段返回
            if (data.translation !== undefined && need.length === 1) trans = [data.translation];
            else throw new Error("翻译返回段数不匹配");
          }
          for (var j = 0; j < need.length; j++) {
            var v = trans[j] || "";
            results[needIdx[j]] = v;
            pxtcCacheWrite(pxtcCacheKey(need[j]), v);
          }
          return results;
        });
    }

    function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    // 并发翻译：最多 3 批同时在途，每批内部可含多段；完成一批渲染一批（增量显示）。
    // google 保留一个批次间隔，配合“一批多段”把请求频率压下来，降低 429。
    // 并发翻译：Google/微软/百度可并发 3 批；DeepSeek 等 AI 接口有严格 RPM 限制，
    // 并发会触发 "rpm exhausted"，降到串行（1 批），每批之间天然有时间间隔。
    // 遇限流时自动重试一次（等 20s），而非直接放弃整篇翻译。
    async function runTranslate(batches) {
      var sections = [];
      for (var i = 0; i < batches.length; i++) {
        var section = createEl("section", "pxtc-chunk", '<div class="pxtc-orig">' + renderParagraphs(batches[i].join("\n\n")) + "</div>");
        reader.appendChild(section);
        sections.push(section);
      }
      var done = 0;
      var failed = 0;
      var stopped = false;
      var next = 0;
      function fill(section, texts, trans) {
        section.innerHTML = '<div class="pxtc-orig">' + renderParagraphs(texts.join("\n\n")) +
          '</div><div class="pxtc-trans">' + renderParagraphs(trans.join("\n\n")) + "</div>";
      }
      async function worker() {
        while (next < batches.length && !stopped) {
          var idx = next++;
          try {
            var texts = batches[idx];
            var trans = await translateBatch(texts);
            fill(sections[idx], texts, trans);
            done++;
          } catch (e) {
            var errMsg = String((e && e.message) || e);
            // 遇到限流（Google 429 / DeepSeek rpm exhausted）：等 20s 重试一次，
            // 而非直接放弃——RPM 限制通常 1 分钟内恢复，重试大概率成功
            if (/限流|429|rpm|rate.?limit/i.test(errMsg) && !stopped) {
              setStatus("翻译源限流，等待 15 秒后重试…", "#c0392b");
              await sleep(15000);
              if (stopped) break;
              try {
                var texts2 = batches[idx];
                var trans2 = await translateBatch(texts2);
                fill(sections[idx], texts2, trans2);
                done++;
                // 重试成功后如果还是限流类翻译源，降速继续
              } catch (e2) {
                var errMsg2 = String((e2 && e2.message) || e2);
                failed++;
                sections[idx].innerHTML = '<div class="pxtc-orig">' + renderParagraphs(batches[idx].join("\n\n")) +
                  '</div><div class="pxtc-error">' + esc(errMsg2) + "</div>";
                // 重试仍失败，停止整篇翻译
                if (/限流|429|rpm|rate.?limit/i.test(errMsg2)) {
                  stopped = true;
                  setStatus("翻译源持续限流，已停止，请稍后再试", "#c0392b");
                  if (panel) panel.style.display = "none";
                }
              }
            } else {
              failed++;
              sections[idx].innerHTML = '<div class="pxtc-orig">' + renderParagraphs(batches[idx].join("\n\n")) +
                '</div><div class="pxtc-error">' + esc(errMsg) + "</div>";
            }
          }
          setStatus("翻译中 " + (done + failed) + "/" + batches.length, "");
          // google 留一点间隔，避免瞬时请求过密触发 429
          if (cfg.translator === "google") await sleep(450);
        }
      }
      var workers = [];
      // AI 翻译源（deepseek）并发 2（错开 3 秒避免同时触发 RPM）；其他翻译源可并发 3 批
      var CONCURRENCY = (cfg.translator === "deepseek") ? 2 : 3;
      var count = Math.min(CONCURRENCY, batches.length);
      for (var w = 0; w < count; w++) { if (w > 0) await sleep(3000); workers.push(worker()); }
      await Promise.all(workers);
      if (stopped) return; // 限流提示已在上面显示，不再覆盖
      if (failed) setStatus("完成，失败 " + failed + " 批", "#c0392b");
      else setStatus("翻译完成 " + done + "/" + batches.length, "#1e8449");
      // 翻译完成后自动关闭面板
      if (panel) panel.style.display = "none";
    }

    function buildReader() {
      root = document.getElementById("root");
      if (!root) return false;
      originalDisplay = root.style.display || "";
      reader = createEl("div", "pxtc-reader");
      var rootStyle = window.getComputedStyle(root);
      var pageBg = rootStyle.backgroundColor;
      if (!pageBg || pageBg === "transparent" || pageBg.indexOf("rgba(0, 0, 0, 0)") === 0) {
        pageBg = window.getComputedStyle(document.body).backgroundColor;
      }
      if (pageBg && pageBg !== "transparent" && pageBg.indexOf("rgba(0, 0, 0, 0)") !== 0) {
        reader.style.background = pageBg;
      }
      reader.style.color = rootStyle.color;
      root.parentNode.insertBefore(reader, root.nextSibling);
      root.style.display = "none";
      return true;
    }

    function restore() {
      if (reader && reader.parentNode) reader.parentNode.removeChild(reader);
      reader = null;
      if (root) root.style.display = originalDisplay;
      setStatus("已恢复原文", "#555");
    }

    async function doTranslate() {
      if (busy) return;
      busy = true;
      setStatus("准备中…", "");
      var text = "";
      try {
        text = window.pixiv && window.pixiv.novel ? window.pixiv.novel.text : "";
      } catch (e) {
        text = "";
      }
      if (!text) {
        setStatus("未找到小说正文", "#c0392b");
        busy = false;
        return;
      }
      if (selT) cfg.translator = selT.value;
      if (selL) cfg.target = selL.value;
      if (cfg.translator === "microsoft" && !cfg.hasMs) {
        setStatus("微软翻译未配置：请到 Loon 插件参数填写「微软翻译Key」，填写后重新导入插件并刷新页面", "#c0392b");
        busy = false;
        return;
      }
      if (cfg.translator === "baidu" && !cfg.hasBaidu) {
        setStatus("百度翻译未配置：请到 Loon 插件参数填写「百度AppID」和「百度密钥」，填写后重新导入插件并刷新页面", "#c0392b");
        busy = false;
        return;
      }
      if (cfg.translator === "deepseek" && !cfg.hasDeepSeek) {
        setStatus("DeepSeek 未配置：请到 Loon 插件参数填写「DeepSeek API Key」，填写后重新导入插件并刷新页面", "#c0392b");
        busy = false;
        return;
      }
      if (!buildReader()) {
        setStatus("未找到小说正文容器", "#c0392b");
        busy = false;
        return;
      }
      var paragraphs = splitParagraphs(text);
      // 每批上限：默认按翻译源（google/baidu 一批可带多段），插件参数 chunk=xxx 可覆盖
      // 每请求最大字符数（100~3000）
      var limits = PXTC_BATCH_LIMITS[cfg.translator] || PXTC_BATCH_LIMITS.google;
      if (cfg.chunk && cfg.chunk >= 100) limits = { chars: Math.min(cfg.chunk, 3000), segs: limits.segs };
      var batches = buildBatches(paragraphs, limits);
      if (!batches.length) {
        restore();
        setStatus("没有可翻译的正文", "#c0392b");
        busy = false;
        return;
      }
      try {
        await runTranslate(batches);
      } catch (e) {
        setStatus("翻译失败：" + ((e && e.message) || e), "#c0392b");
      }
      busy = false;
    }

    function ensureUI() {
      if (document.getElementById("pxtc-fab")) return;
      var fab = createEl("button", "pxtc-fab", "译");
      fab.id = "pxtc-fab";
      fab.title = "小说翻译（单点翻译 / 长按设置）";
      // 单点 → 直接翻译；长按（500ms）→ 展开管理面板
      var pressTimer = null;
      function startPress() {
        pressTimer = setTimeout(function () {
          pressTimer = null;
          panel = document.getElementById("pxtc-panel");
          if (panel) panel.style.display = "block";
        }, 500);
      }
      function endPress() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
          doTranslate();
        }
      }
      function cancelPress() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }
      fab.addEventListener("mousedown", startPress);
      fab.addEventListener("mouseup", endPress);
      fab.addEventListener("mouseleave", cancelPress);
      fab.addEventListener("touchstart", startPress);
      fab.addEventListener("touchend", endPress);
      fab.addEventListener("touchcancel", cancelPress);
      document.body.appendChild(fab);

      panel = createEl("div", "pxtc-panel");
      panel.id = "pxtc-panel";
      panel.style.display = "none";
      var translatorOptions =
        '<option value="google">Google 免费</option>' +
        '<option value="microsoft">微软翻译' + (cfg.hasMs ? "" : "（未配置）") + "</option>" +
        '<option value="baidu">百度翻译' + (cfg.hasBaidu ? "" : "（未配置）") + "</option>" +
        '<option value="deepseek">DeepSeek AI' + (cfg.hasDeepSeek ? "" : "（未配置）") + "</option>";
      var targetOptions =
        '<option value="zh-CN">简体中文</option>' +
        '<option value="zh-TW">繁體中文</option>' +
        '<option value="en">English</option>' +
        '<option value="ja">日本語</option>' +
        '<option value="ko">한국어</option>';
      panel.innerHTML =
        '<div class="pxtc-head">小说翻译<button type="button" class="pxtc-close">×</button></div>' +
        '<label class="pxtc-row">翻译源<select class="pxtc-select">' + translatorOptions + "</select></label>" +
        '<label class="pxtc-row">目标语言<select class="pxtc-select">' + targetOptions + "</select></label>" +
        '<div class="pxtc-actions"><button type="button" class="pxtc-btn pxtc-primary">翻译全文</button><button type="button" class="pxtc-btn">恢复原文</button></div>' +
        '<div class="pxtc-status"></div>';
      selT = panel.querySelectorAll("select")[0];
      selL = panel.querySelectorAll("select")[1];
      selT.value = cfg.translator;
      selL.value = cfg.target;
      statusEl = panel.querySelector(".pxtc-status");
      panel.querySelector(".pxtc-close").addEventListener("click", function () { panel.style.display = "none"; });
      panel.querySelector(".pxtc-primary").addEventListener("click", function () { panel.style.display = "none"; doTranslate(); });
      panel.querySelectorAll(".pxtc-btn")[1].addEventListener("click", restore);
      document.body.appendChild(panel);
    }

    function boot() {
      function check() {
        if (window.pixiv && window.pixiv.novel && window.pixiv.novel.text) {
          ensureUI();
          return true;
        }
        return false;
      }
      if (check()) return;
      var tries = 0;
      var timer = setInterval(function () {
        tries++;
        if (check() || tries >= 60) clearInterval(timer);
      }, 200);
    }

    boot();
  })();
}

// Loon / Surge / Stash 的 http-request 脚本中，$done({status,headers,body}) 会被当作
// “修改请求”下发到上游；要直接返回响应（mock），必须包一层 response：$done({response:{...}})。
// Quantumult X 的 response.status 需要字符串形式的起始行（如 "HTTP/1.1 200"）。
function doneWithResponse(status, headers, body) {
  const payload = { status: status, headers: headers || {}, body: body };
  if (typeof $task !== "undefined") {
    $done({ response: { status: "HTTP/1.1 " + status, headers: payload.headers, body: payload.body } });
  } else {
    $done({ response: payload });
  }
}

async function handleProxy() {
  const args = parseArgument();
  const query = parseQuery($request.url);
  const msKey = pxtcArg(args, "ms_key");
  const baiduAppid = pxtcArg(args, "baidu_appid");
  const baiduSecret = pxtcArg(args, "baidu_secret");
  const deepseekKey = pxtcArg(args, "deepseek_api_key");
  const deepseekApiUrl = pxtcArg(args, "deepseek_api_url") || "https://api.deepseek.com/v1/chat/completions";
  const deepseekModel = pxtcArg(args, "deepseek_model") || "deepseek-v4-flash";
  // Google Worker 代理（可选）：配置后 Google 翻译走 Worker，不直连 Google
  const googleProxyUrl = pxtcArg(args, "google_proxy_url");
  const googleProxyToken = pxtcArg(args, "google_proxy_token");
  if (googleProxyUrl) _pxtcGoogleProxy = { url: googleProxyUrl, token: googleProxyToken };
  else _pxtcGoogleProxy = null;
  let translator = String(query.t || pxtcArg(args, "translator") || "google").toLowerCase();
  let target = String(query.l || pxtcArg(args, "target") || "zh-CN");
  if (!PXTC_LANG_MAP[target]) target = "zh-CN";
  if (translator !== "microsoft" && translator !== "baidu" && translator !== "deepseek") translator = "google";
  // 新协议：客户端一次 POST 一段 JSON {texts:[...]}，服务端批量翻译多段后一次返回；
  // 兼容旧协议：正文直接作为裸字符串时按单段翻译。
  const rawBody = $request.body;
  let texts = null;
  let text = "";
  if (typeof rawBody === "object" && rawBody !== null) {
    if (Array.isArray(rawBody.texts)) texts = rawBody.texts.map(String);
    else text = JSON.stringify(rawBody);
  } else if (typeof rawBody === "string") {
    const trimmed = rawBody.trim();
    // 不依赖 Content-Type：只要 body 以 { 或 [ 开头就尝试 JSON 解析。
    // 某些 Loon 版本可能不传递请求头，仅靠 Content-Type 判断会导致 JSON body 被当裸文本翻译。
    if (/^[\[{]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed && Array.isArray(parsed.texts)) texts = parsed.texts.map(String);
      } catch (e) { texts = null; }
    }
    if (!texts) text = rawBody;
  }
  const result = { ok: false, translation: "", translations: [], src: translator, error: "" };
  try {
    if (!text && !(texts && texts.length)) throw new Error("空请求体");
    const lang = PXTC_LANG_MAP[target];
    let translation = "";
    let translations = [];
    if (translator === "microsoft") {
      if (!msKey) throw new Error("未配置微软翻译 Key");
      if (texts) translations = await msTranslateBatch(texts, lang.microsoft, msKey);
      else translation = await msTranslate(text, lang.microsoft, msKey);
    } else if (translator === "baidu") {
      if (!baiduAppid || !baiduSecret) throw new Error("未配置百度 AppID / 密钥");
      if (texts) translations = await baiduTranslateBatch(texts, lang.baidu, baiduAppid, baiduSecret);
      else translation = await baiduTranslate(text, lang.baidu, baiduAppid, baiduSecret);
    } else if (translator === "deepseek") {
      if (!deepseekKey) throw new Error("未配置 DeepSeek API Key");
      if (texts) translations = await deepseekTranslateBatch(texts, lang.deepseek, deepseekApiUrl, deepseekKey, deepseekModel);
      else translation = await deepseekTranslate(text, lang.deepseek, deepseekApiUrl, deepseekKey, deepseekModel);
    } else {
      if (texts) translations = await googleTranslateBatch(texts, lang.google);
      else translation = await googleTranslate(text, lang.google);
    }
    result.ok = true;
    result.translation = translation;
    result.translations = translations;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg.indexOf("__PXTC_TIMEOUT__") !== -1) {
      // 真正的 60 秒超时：接口确实响应太慢
      result.error = "翻译接口请求超时：接口响应太慢，请重试；若仍超时可在插件参数里调小 chunk 分块，或更换更快的翻译源";
    } else if (/rpm exhausted|rate.?limit|429|限流/i.test(msg)) {
      // 翻译源自身的限流（DeepSeek RPM、Google 429 等），不是连接问题
      result.error = msg + "（翻译源限流，请降低翻译频率或更换翻译源）";
    } else if (/\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|socket|network)\b/i.test(msg) ||
      /status.0|请求失败|请求超时/.test(msg)) {
      // 连接失败（代理节点不可用等）：提示检查节点
      result.error = msg + "（请检查 Loon 代理节点是否可用，或配置 Google Worker 代理）";
    } else if (msg && msg !== "[object Object]") {
      // 其他 API 错误（DeepSeek error 等）：保留原始错误，不追加误导提示
      result.error = msg;
    } else {
      result.error = "翻译请求失败：请检查 Loon 代理节点是否可用，或配置 Google Worker 代理（插件参数 google_proxy_url）";
    }
  }
  doneWithResponse(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }, JSON.stringify(result));
}

function handleInject() {
  const body = typeof $response.body === "string" ? $response.body : "";
  if (!body) {
    $done({});
    return;
  }
  const cfg = getConfig();
  // 诊断日志：仅输出是否已配置，不含密钥明文；在 Loon 脚本日志中搜索 [pxtc] 可排查
  $.log("[pxtc] 注入配置: translator=" + cfg.translator + " target=" + cfg.target + " chunk=" + cfg.chunk +
    " hasMs=" + cfg.hasMs + " hasBaidu=" + cfg.hasBaidu + " hasDeepSeek=" + cfg.hasDeepSeek);
  const clientSrc = "window.__PXTC_CONFIG=" + JSON.stringify(cfg) + ";\n(" + __pxtc_client.toString() + ")();";
  const inject = '<style id="pxtc-style">' + PXTC_CSS + '</style><script id="pxtc-script">' + clientSrc + "</script>";
  let newBody;
  if (/<\/body>/i.test(body)) newBody = body.replace(/<\/body>/i, inject + "</body>");
  else newBody = body + inject;
  const headers = {};
  const rawHeaders = $response.headers || {};
  const keys = Object.keys(rawHeaders);
  for (let i = 0; i < keys.length; i++) {
    const lower = keys[i].toLowerCase();
    if (lower === "content-encoding" || lower === "content-length") continue;
    headers[keys[i]] = rawHeaders[keys[i]];
  }
  $done({ body: newBody, headers: headers });
}

(async function main() {
  const url = typeof $request !== "undefined" && $request.url ? $request.url : "";
  if (url.indexOf("/pxtrans") !== -1) {
    await handleProxy();
  } else if (typeof $response !== "undefined") {
    handleInject();
  } else {
    $done({});
  }
})().catch(function (e) {
  const url = typeof $request !== "undefined" && $request.url ? $request.url : "";
  try {
    if (url.indexOf("/pxtrans") !== -1) {
      doneWithResponse(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, JSON.stringify({ ok: false, translation: "", src: "", error: String((e && e.message) || e) }));
    } else {
      $done({});
    }
  } catch (err) { }
});

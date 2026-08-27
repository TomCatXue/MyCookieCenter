/*
------------------------------------------
@Name: Pixiv 小说翻译
@Version: 1.0.0
@Desc: 在 Pixiv 小说阅读页注入翻译按钮，支持 Google 免费接口 / 微软翻译 / 百度翻译
@Author: TomCatXue
@Date: 2026-08-27

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

const SCRIPT_VERSION = "20260828-r1";

const PXTC_LANG_MAP = {
  "zh-CN": { google: "zh-CN", microsoft: "zh-Hans", baidu: "zh" },
  "zh-TW": { google: "zh-TW", microsoft: "zh-Hant", baidu: "cht" },
  "en": { google: "en", microsoft: "en", baidu: "en" },
  "ja": { google: "ja", microsoft: "ja", baidu: "jp" },
  "ko": { google: "ko", microsoft: "ko", baidu: "kor" }
};

const PXTC_CHUNK_LIMITS = { google: 350, microsoft: 4500, baidu: 580 };

function parseArgument() {
  const out = {};
  const arg = typeof $argument === "string" ? $argument : "";
  if (!arg) return out;
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
  let translator = String(args.translator || "google").toLowerCase();
  let target = String(args.target || "zh-CN");
  if (!PXTC_LANG_MAP[target]) target = "zh-CN";
  if (translator !== "microsoft" && translator !== "baidu") translator = "google";
  return {
    translator: translator,
    target: target,
    hasMs: !!(args.ms_key),
    hasBaidu: !!(args.baidu_appid && args.baidu_secret)
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

async function googleTranslate(text, target) {
  const qs = "client=it&dt=t&otf=3&dj=1&hl=zh_CN&sl=auto&tl=" + encodeURIComponent(target) + "&q=" + encodeURIComponent(text);
  const hosts = [
    "https://translate.google.hk/translate_a/single",
    "https://translate.googleapis.com/translate_a/single"
  ];
  let lastError = null;
  for (let i = 0; i < hosts.length; i++) {
    try {
      const res = await $.get({
        url: hosts[i] + "?" + qs,
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const data = JSON.parse(res.body || "{}");
      if (!data || !Array.isArray(data.sentences)) throw new Error("Google 返回格式异常");
      let out = "";
      for (let j = 0; j < data.sentences.length; j++) {
        if (data.sentences[j] && typeof data.sentences[j].trans === "string") out += data.sentences[j].trans;
      }
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Google 翻译失败");
}

async function msTranslate(text, target, key) {
  const res = await $.post({
    url: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=" + encodeURIComponent(target),
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": key
    },
    body: JSON.stringify([{ Text: text }])
  });
  const data = JSON.parse(res.body || "{}");
  if (!Array.isArray(data) || !data[0] || !data[0].translations || !data[0].translations[0]) {
    throw new Error("微软翻译返回格式异常");
  }
  return data[0].translations[0].text;
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
  const data = JSON.parse(res.body || "{}");
  if (data && data.error_code) throw new Error("百度翻译 " + data.error_code + " " + (data.error_msg || ""));
  if (!data || !Array.isArray(data.trans_result)) throw new Error("百度翻译返回格式异常");
  let out = "";
  for (let i = 0; i < data.trans_result.length; i++) {
    if (data.trans_result[i] && data.trans_result[i].dst) out += data.trans_result[i].dst;
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
    var cfg = window.__PXTC_CONFIG || { translator: "google", target: "zh-CN", hasMs: false, hasBaidu: false };
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

    function buildChunks(paragraphs, max) {
      var chunks = [];
      var current = [];
      var currentLen = 0;
      for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        if (p.length > max) {
          if (current.length) {
            chunks.push(current.join("\n\n"));
            current = [];
            currentLen = 0;
          }
          var pieces = splitLongParagraph(p, max);
          for (var j = 0; j < pieces.length; j++) chunks.push(pieces[j]);
        } else {
          var add = current.length ? currentLen + 2 + p.length : p.length;
          if (current.length && add > max) {
            chunks.push(current.join("\n\n"));
            current = [];
            currentLen = 0;
          }
          current.push(p);
          currentLen = current.length === 1 ? p.length : currentLen + 2 + p.length;
        }
      }
      if (current.length) chunks.push(current.join("\n\n"));
      return chunks;
    }

    function renderParagraphs(text) {
      var paras = String(text || "").split(/\n{2,}/);
      var html = "";
      for (var i = 0; i < paras.length; i++) {
        html += '<p>' + esc(paras[i]).replace(/\n/g, "<br>") + "</p>";
      }
      return html;
    }

    function translateChunk(text) {
      var url = "/pxtrans?t=" + encodeURIComponent(cfg.translator) + "&l=" + encodeURIComponent(cfg.target);
      return fetch(url, { method: "POST", body: text })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok) throw new Error((data && data.error) || "翻译失败");
          return data.translation || "";
        });
    }

    function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    async function runTranslate(chunks) {
      var sections = [];
      var done = 0;
      var failed = 0;
      for (var i = 0; i < chunks.length; i++) {
        var section = createEl("section", "pxtc-chunk", '<div class="pxtc-orig">' + renderParagraphs(chunks[i]) + "</div>");
        reader.appendChild(section);
        sections.push(section);
      }
      for (var i = 0; i < chunks.length; i++) {
        try {
          var trans = await translateChunk(chunks[i]);
          sections[i].innerHTML = '<div class="pxtc-orig">' + renderParagraphs(chunks[i]) + '</div><div class="pxtc-trans">' + renderParagraphs(trans) + "</div>";
          done++;
        } catch (e) {
          failed++;
          sections[i].innerHTML = '<div class="pxtc-orig">' + renderParagraphs(chunks[i]) + '</div><div class="pxtc-error">' + esc((e && e.message) || e) + "</div>";
        }
        setStatus("翻译中 " + (i + 1) + "/" + chunks.length, "");
        if (cfg.translator === "google") await sleep(150);
      }
      if (failed) setStatus("完成，失败 " + failed + " 段", "#c0392b");
      else setStatus("翻译完成 " + done + "/" + chunks.length, "#1e8449");
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
        setStatus("请先在插件参数中填写微软 Key", "#c0392b");
        busy = false;
        return;
      }
      if (cfg.translator === "baidu" && !cfg.hasBaidu) {
        setStatus("请先填写百度 AppID 和密钥", "#c0392b");
        busy = false;
        return;
      }
      if (!buildReader()) {
        setStatus("未找到小说正文容器", "#c0392b");
        busy = false;
        return;
      }
      var paragraphs = splitParagraphs(text);
      var limit = { google: 350, microsoft: 4500, baidu: 580 }[cfg.translator] || 350;
      var chunks = buildChunks(paragraphs, limit);
      if (!chunks.length) {
        restore();
        setStatus("没有可翻译的正文", "#c0392b");
        busy = false;
        return;
      }
      try {
        await runTranslate(chunks);
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
        '<option value="microsoft"' + (cfg.hasMs ? "" : " disabled") + ">微软翻译</option>" +
        '<option value="baidu"' + (cfg.hasBaidu ? "" : " disabled") + ">百度翻译</option>";
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
      panel.querySelector(".pxtc-primary").addEventListener("click", doTranslate);
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

async function handleProxy() {
  const args = parseArgument();
  const query = parseQuery($request.url);
  let translator = String(query.t || args.translator || "google").toLowerCase();
  let target = String(query.l || args.target || "zh-CN");
  if (!PXTC_LANG_MAP[target]) target = "zh-CN";
  if (translator !== "microsoft" && translator !== "baidu") translator = "google";
  // http-request / http-response 下 $request.body 都可能是字符串；
  // 若 Loon 按 JSON Content-Type 解析过请求体会是对象，这里统一兜底转字符串
  const rawBody = $request.body;
  const text = typeof rawBody === "string" ? rawBody : (rawBody && typeof rawBody === "object" ? JSON.stringify(rawBody) : "");
  const result = { ok: false, translation: "", src: translator, error: "" };
  try {
    if (!text) throw new Error("空请求体");
    const lang = PXTC_LANG_MAP[target];
    let translation = "";
    if (translator === "microsoft") {
      if (!args.ms_key) throw new Error("未配置微软翻译 Key");
      translation = await msTranslate(text, lang.microsoft, args.ms_key);
    } else if (translator === "baidu") {
      if (!args.baidu_appid || !args.baidu_secret) throw new Error("未配置百度 AppID / 密钥");
      translation = await baiduTranslate(text, lang.baidu, args.baidu_appid, args.baidu_secret);
    } else {
      translation = await googleTranslate(text, lang.google);
    }
    result.ok = true;
    result.translation = translation;
  } catch (e) {
    result.error = String((e && e.message) || e);
  }
  $done({
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(result)
  });
}

function handleInject() {
  const body = typeof $response.body === "string" ? $response.body : "";
  if (!body) {
    $done({});
    return;
  }
  const cfg = getConfig();
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
      $done({
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ ok: false, translation: "", src: "", error: String((e && e.message) || e) })
      });
    } else {
      $done({});
    }
  } catch (err) { }
});




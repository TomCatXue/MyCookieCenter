/**
 * Pixiv 漫画原位翻译 · Loon 请求脚本
 * ---------------------------------------------------------------
 * 把 Pixiv App 对 i.pximg.net 的图片请求，转给自建翻译 Worker，
 * 再把 Worker 返回的图片交给 Pixiv 阅读器。
 *
 * 踩过的三个坑（按发现顺序）：
 *   1. `$done({ url })` 改写 URL 无效 —— Loon 直接返回假 404
 *      （timings 里 dns/connect/ssl 全 -1）
 *   2. 返回二进制必须传 ArrayBuffer，不是 base64 字符串
 *   3. 脚本内请求 Worker 时，若目标域名也在 MITM/规则范围内，
 *      请求可能被 Loon 自己拦掉（wait/receive 全 -1）
 *      → 本脚本用较短的 timeout + 失败重试 + 最终放行原图
 *
 * 配置来源：Loon 插件 [Argument] 的 $argument，或下面的 DEFAULTS
 */

(function () {
  "use strict";

  var DEFAULTS = {
    WORKER_HOST: "pixiv.xuetom.top",
    TARGET_LANG: "zh-CN",
    PASSTHROUGH: "false",
    TRANSLATE_ALL: "false"
  };

  // 诊断开关：改成 true，失败原因用系统通知弹出来
  var DEBUG = false;

  function report(msg) {
    if (!DEBUG) return;
    try {
      $notification.post("Pixiv 漫翻", "", String(msg).slice(0, 280));
    } catch (e) { /* ignore */ }
    try { console.log("[PixivImgTranslate] " + msg); } catch (e) { /* ignore */ }
  }

  function pick(key) {
    var v;
    try {
      if (typeof $argument !== "undefined" && $argument) {
        if (typeof $argument === "object") v = $argument[key];
        else if (typeof $argument === "string") {
          var m = $argument.match(new RegExp("(?:^|[&,])" + key + "=([^&,]*)"));
          if (m) v = m[1];
        }
      }
    } catch (e) { /* ignore */ }
    if (v === undefined || v === null || v === "") return String(DEFAULTS[key]);
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(v);
  }

  var host = pick("WORKER_HOST").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  var lang = pick("TARGET_LANG");
  var isPassthrough = pick("PASSTHROUGH").toLowerCase() === "true";
  var isTranslateAll = pick("TRANSLATE_ALL").toLowerCase() === "true";

  if (!host || host.indexOf("REPLACE") >= 0) { $done({}); return; }

  var url = "";
  try {
    url = (typeof $request !== "undefined" && $request && $request.url) ? $request.url : "";
  } catch (e) { $done({}); return; }

  if (!/^https:\/\/i\.pximg\.net\//i.test(url)) { $done({}); return; }
  if (!isTranslateAll && !isArtworkImage(url)) { $done({}); return; }

  var target =
    "https://" + host + "/img?src=" + encodeURIComponent(url) +
    "&lang=" + encodeURIComponent(lang) +
    (isPassthrough ? "&pt=1" : "&pt=0");

  // ── 主流程 ────────────────────────────────────────────────
  fetchImage(target, function (buf, ctype) {
    if (!buf) { $done({}); return; }  // 失败放行原图

    var headers = {
      "Content-Type": ctype || "image/jpeg",
      "Cache-Control": "public, max-age=604800"
    };

    $done({
      status: 200,
      headers: headers,
      body: buf,
      response: { status: 200, headers: headers, body: buf }
    });
  });

  /**
   * 请求 Worker 拿图片。
   * 优先用 $task.fetch（Promise 风格，Loon 支持更完整），
   * 不可用时回退 $httpClient.get。
   */
  function fetchImage(u, cb) {
    var done = false;
    function finish(buf, ct) { if (!done) { done = true; cb(buf, ct); } }

    // 超时兜底，避免脚本挂死
    var timer = setTimeout(function () {
      report("请求超时");
      finish(null, null);
    }, 100000);

    function handle(resp, data) {
      clearTimeout(timer);
      if (!resp) { report("无响应"); finish(null, null); return; }
      if (resp.statusCode && resp.statusCode !== 200) { report("状态 " + resp.statusCode); finish(null, null); return; }
      if (resp.status && resp.status !== 200) { report("状态 " + resp.status); finish(null, null); return; }
      if (!data) { report("空响应体"); finish(null, null); return; }

      var hdrs = resp.headers || {};
      var ct = hdrs["Content-Type"] || hdrs["content-type"] || "image/jpeg";
      ct = String(ct).split(";")[0].trim() || "image/jpeg";

      var buf = toArrayBuffer(data);
      if (!buf) { report("转换失败: " + Object.prototype.toString.call(data)); finish(null, null); return; }
      finish(buf, ct);
    }

    // 优先 $task.fetch
    if (typeof $task !== "undefined" && $task && typeof $task.fetch === "function") {
      try {
        $task.fetch({
          url: u,
          method: "GET",
          timeout: 90,
          "binary-mode": true
        }).then(function (resp) {
          handle(resp, resp && resp.body);
        }).catch(function (e) {
          clearTimeout(timer);
          report("$task.fetch 失败: " + (e && e.message ? e.message : e));
          finish(null, null);
        });
        return;
      } catch (e) {
        report("$task.fetch 异常");
      }
    }

    // 回退 $httpClient
    try {
      $httpClient.get(
        { url: u, timeout: 90, "binary-mode": true },
        function (err, resp, data) {
          if (err) { clearTimeout(timer); report("$httpClient 错误: " + (err.message || err)); finish(null, null); return; }
          handle(resp, data);
        }
      );
    } catch (e) {
      clearTimeout(timer);
      report("$httpClient 异常");
      finish(null, null);
    }
  }

  // ── helpers ───────────────────────────────────────────────

  function isArtworkImage(u) {
    if (/\/user-profile\//i.test(u)) return false;
    if (/\/custom-thumb\//i.test(u)) return false;
    if (/_square\d*\./i.test(u)) return false;

    var m = u.match(/\/c\/(\d+)x(\d+)/i);
    if (m) {
      var w = parseInt(m[1], 10);
      var h = parseInt(m[2], 10);
      if (w < 300 || h < 300) return false;
    }

    if (/\/img-master\//i.test(u)) return true;
    if (/\/img-original\//i.test(u)) return true;
    return false;
  }

  function toArrayBuffer(data) {
    try {
      if (!data) return null;
      if (data instanceof ArrayBuffer) return data;
      if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      if (Array.isArray(data)) return new Uint8Array(data).buffer;

      if (typeof data === "string") {
        if (!data.length) return null;
        var stripped = data.replace(/[\r\n\s]/g, "");
        var looksBase64 = /^[A-Za-z0-9+/=]+$/.test(stripped) && stripped.length % 4 === 0;
        if (looksBase64) {
          var bin = atobSafe(stripped);
          if (bin) {
            var u8 = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i) & 0xff;
            return u8.buffer;
          }
        }
        var out = new Uint8Array(data.length);
        for (var j = 0; j < data.length; j++) out[j] = data.charCodeAt(j) & 0xff;
        return out.buffer;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function atobSafe(str) {
    try { if (typeof atob === "function") return atob(str); } catch (e) { /* ignore */ }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var lookup = {};
    for (var i = 0; i < chars.length; i++) lookup[chars[i]] = i;
    var buf = [], bits = 0, acc = 0;
    for (var k = 0; k < str.length; k++) {
      var c = str[k];
      if (c === "=") break;
      var v = lookup[c];
      if (v === undefined) continue;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; buf.push((acc >> bits) & 0xff); }
    }
    if (!buf.length) return "";
    var s = "";
    for (var n = 0; n < buf.length; n++) s += String.fromCharCode(buf[n]);
    return s;
  }
})();

/**
 * Pixiv 漫画原位翻译 · Loon 请求脚本
 * ---------------------------------------------------------------
 * 把 Pixiv App 对 i.pximg.net 的图片请求，转给自建翻译 Worker 处理，
 * 再把 Worker 返回的图片直接交回给 Pixiv 阅读器。
 *
 *   原始: GET https://i.pximg.net/c/600x1200_90_webp/img-master/.../xxx_p0_master1200.jpg
 *   处理: 脚本内部请求 https://<worker>/img?src=<原URL编码>&lang=zh-CN
 *   返回: 把 Worker 的图片字节原样回给 App
 *
 * ⚠️ 关键：Loon 的 request 脚本**不支持 $done({ url }) 改写 URL**。
 *    那样写会被当成无效参数，Loon 直接返回 404（timings 里 dns/connect/ssl 全是 -1）。
 *    正确做法是在脚本里自己发请求，再用 $done 把响应返给 App。
 *
 * 配置来源：
 *   1. Loon 插件 [Argument] 的 $argument（对象形态）
 *   2. 下面的 DEFAULTS
 */

(function () {
  "use strict";

  var DEFAULTS = {
    WORKER_HOST: "pixiv.xuetom.top",
    TARGET_LANG: "zh-CN",
    PASSTHROUGH: "false",
    TRANSLATE_ALL: "false"
  };

  /** 从 $argument 取值，兼容对象/字符串/布尔三种形态 */
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

  // 没配域名 → 放行原请求
  if (!host || host.indexOf("REPLACE") >= 0) {
    $done({});
    return;
  }

  var url = "";
  try {
    url = (typeof $request !== "undefined" && $request && $request.url) ? $request.url : "";
  } catch (e) {
    $done({});
    return;
  }

  if (!/^https:\/\/i\.pximg\.net\//i.test(url)) {
    $done({});
    return;
  }

  // 只翻漫画/插画大图。头像、封面、小图标放行原图。
  if (!isTranslateAll && !isArtworkImage(url)) {
    $done({});
    return;
  }

  var target =
    "https://" +
    host +
    "/img?src=" +
    encodeURIComponent(url) +
    "&lang=" +
    encodeURIComponent(lang) +
    (isPassthrough ? "&pt=1" : "&pt=0");

  // ── 请求 Worker，拿到图片后直接返回给 App ────────────────────
  $httpClient.get(
    {
      url: target,
      timeout: 120,
      "binary-mode": true
    },
    function (err, resp, data) {
      if (err || !resp || resp.status !== 200 || !data) {
        // 失败就放行原图，绝不让阅读器白屏
        $done({});
        return;
      }

      var headers = (resp && resp.headers) || {};
      var ctype = headers["Content-Type"] || headers["content-type"] || "image/jpeg";

      var body = data;
      // 统一成 base64。Loon 不同版本对 Uint8Array / ArrayBuffer / string 处理不一致，
      // 用 body 传 base64 最稳。
      var b64 = toBase64(body);
      if (!b64) {
        $done({});
        return;
      }

      var outHeaders = {
        "Content-Type": ctype,
        "Cache-Control": "public, max-age=604800"
      };

      $done({
        status: 200,
        headers: outHeaders,
        body: b64,
        bodyBase64: true,     // 部分版本认这个字段
        response: {
          status: 200,
          headers: outHeaders,
          body: b64,
          bodyBase64: true
        }
      });
    }
  );

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

  /** 把各种二进制形态统一转成 base64 字符串 */
  function toBase64(data) {
    try {
      if (typeof data === "string") {
        // 已经是 base64（Loon binary-mode 有时直接给 base64）
        if (/^[A-Za-z0-9+/=\r\n]+$/.test(data) && data.length > 100) return data;
        // 是二进制字符串，逐字节转
        var out = "";
        for (var i = 0; i < data.length; i++) {
          out += String.fromCharCode(data.charCodeAt(i) & 0xff);
        }
        return btoaSafe(out);
      }
      if (data instanceof ArrayBuffer) return btoaSafe(bufToStr(new Uint8Array(data)));
      if (ArrayBuffer.isView(data)) return btoaSafe(bufToStr(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      if (Array.isArray(data)) return btoaSafe(bufToStr(new Uint8Array(data)));
    } catch (e) { /* ignore */ }
    return "";
  }

  function bufToStr(u8) {
    var s = "";
    var CHUNK = 0x8000;
    for (var i = 0; i < u8.length; i += CHUNK) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return s;
  }

  function btoaSafe(str) {
    try {
      if (typeof btoa === "function") return btoa(str);
    } catch (e) { /* ignore */ }
    // 手写 base64，防止某些运行时没有 btoa
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var out = "";
    for (var i = 0; i < str.length; i += 3) {
      var a = str.charCodeAt(i) & 0xff;
      var b = i + 1 < str.length ? str.charCodeAt(i + 1) & 0xff : 0;
      var c = i + 2 < str.length ? str.charCodeAt(i + 2) & 0xff : 0;
      out += chars[a >> 2];
      out += chars[((a & 3) << 4) | (b >> 4)];
      out += i + 1 < str.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
      out += i + 2 < str.length ? chars[c & 63] : "=";
    }
    return out;
  }
})();

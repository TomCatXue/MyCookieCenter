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
 * 两个关键点（都踩过坑）：
 *   1. Loon 的 request 脚本**不支持 $done({ url }) 改写 URL**。
 *      那样写会被当成无效参数，Loon 直接返回 404（timings 里 dns/connect/ssl 全是 -1）。
 *   2. 返回二进制必须传 **ArrayBuffer**，不是 base64 字符串。
 *      写法参考项目里 txvideo 的 binaryResult：{ body: ArrayBuffer, headers }。
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

  // 诊断开关：改成 true 后，失败原因会用系统通知弹出来
  var DEBUG = false;

  function report(msg) {
    if (!DEBUG) return;
    try {
      $notification.post("Pixiv 漫翻诊断", "", String(msg).slice(0, 300));
    } catch (e) { /* ignore */ }
    try {
      console.log("[PixivImgTranslate] " + msg);
    } catch (e) { /* ignore */ }
  }

  /** 从 $argument 取值，兼容对象 / 字符串 / 布尔三种形态 */
  function pick(key) {
    var v;
    try {
      if (typeof $argument !== "undefined" && $argument) {
        if (typeof $argument === "object") {
          v = $argument[key];
        } else if (typeof $argument === "string") {
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
      if (err) {
        report("请求失败: " + (err.message || err));
        $done({});
        return;
      }
      if (!resp) {
        report("无响应对象");
        $done({});
        return;
      }
      if (resp.status !== 200) {
        report("Worker 状态 " + resp.status);
        $done({});
        return;
      }
      if (!data) {
        report("响应体为空");
        $done({});
        return;
      }

      var headers = resp.headers || {};
      var ctype = headers["Content-Type"] || headers["content-type"] || "image/jpeg";
      // 去掉 charset 之类的参数，图片只需要 mime
      ctype = String(ctype).split(";")[0].trim() || "image/jpeg";

      // ⚠️ 必须转成 ArrayBuffer，Loon 只认这个
      var buf = toArrayBuffer(data);
      if (!buf) {
        report("二进制转换失败，data 类型: " + Object.prototype.toString.call(data));
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
        body: buf,
        response: {
          status: 200,
          headers: outHeaders,
          body: buf
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

  /**
   * 把 $httpClient 返回的各种形态统一转成 ArrayBuffer。
   * binary-mode 可能给：base64 字符串 / 原始二进制字符串 /
   * Uint8Array / ArrayBuffer / number[]，都要兼容。
   */
  function toArrayBuffer(data) {
    try {
      if (!data) return null;

      // ArrayBuffer
      if (data instanceof ArrayBuffer) return data;

      // TypedArray（Uint8Array 等）
      if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }

      // 普通数组
      if (Array.isArray(data)) return new Uint8Array(data).buffer;

      // 字符串：可能是 base64，也可能是原始二进制串
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

        // 当作原始二进制字符串
        var out = new Uint8Array(data.length);
        for (var j = 0; j < data.length; j++) out[j] = data.charCodeAt(j) & 0xff;
        return out.buffer;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function atobSafe(str) {
    try {
      if (typeof atob === "function") return atob(str);
    } catch (e) { /* ignore */ }

    // 手写 base64 解码兜底
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var lookup = {};
    for (var i = 0; i < chars.length; i++) lookup[chars[i]] = i;

    var buf = [];
    var bits = 0;
    var acc = 0;
    for (var k = 0; k < str.length; k++) {
      var c = str[k];
      if (c === "=") break;
      var v = lookup[c];
      if (v === undefined) continue;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        buf.push((acc >> bits) & 0xff);
      }
    }
    if (!buf.length) return "";
    var s = "";
    for (var n = 0; n < buf.length; n++) s += String.fromCharCode(buf[n]);
    return s;
  }
})();

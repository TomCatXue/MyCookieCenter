/**
 * YouTube 字幕实时机翻助手 (Loon 独立适配版)
 * 作用：拦截外语视频字幕请求，无缝追加 tlang 参数实现官方机器翻译回传
 */
(() => {
  try {
    if (typeof $request === "undefined" || !$request.url) {
      return $done({});
    }

    const options = parseOptions($argument);
    const enabled = options.translation_enabled === true || options.translation_enabled === "true";
    const targetLang = options.translation_target || "zh-CN";

    if (!enabled) {
      return $done({});
    }

    const newUrl = rewriteTimedTextUrl($request.url, targetLang);
    if (newUrl && newUrl !== $request.url) {
      $done({ url: newUrl });
    } else {
      $done({});
    }
  } catch (e) {
    console.log("[YouTube-Subtitle] error: " + (e?.message || e));
    $done({});
  }

  function parseOptions(arg) {
    if (typeof arg === "object" && arg !== null) {
      return arg;
    }
    if (typeof arg === "string" && arg.trim().startsWith("{")) {
      try {
        return JSON.parse(arg);
      } catch (_) {}
    }
    if (typeof arg === "string" && arg.includes("=")) {
      const res = {};
      arg.split("&").forEach(pair => {
        const idx = pair.indexOf("=");
        if (idx > 0) {
          res[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
        }
      });
      return res;
    }
    return {};
  }

  function getQueryParam(params, key) {
    for (let i = 0; i < params.length; i++) {
      const eqIdx = params[i].indexOf("=");
      const k = (eqIdx < 0 ? params[i] : params[i].slice(0, eqIdx)).toLowerCase();
      if (k === key) {
        try {
          return decodeURIComponent(eqIdx < 0 ? "" : params[i].slice(eqIdx + 1).replace(/\+/g, "%20"));
        } catch (_) {
          return null;
        }
      }
    }
    return null;
  }

  function rewriteTimedTextUrl(url, target) {
    const qIdx = url.indexOf("?");
    if (qIdx < 0) return null;
    const base = url.slice(0, qIdx);
    const params = url.slice(qIdx + 1).split("&");

    const lang = getQueryParam(params, "lang");
    if (!lang || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(lang)) return null;

    const sparams = getQueryParam(params, "sparams");
    if (sparams && /(?:^|,)tlang(?:,|$)/i.test(sparams)) return null;

    const l = lang.toLowerCase();
    const isTarget = target === "zh-CN" ? (l === "zh-cn" || l === "zh-hans") : (l === "en" || l === "en-us");
    const tlangCode = target === "zh-CN" ? "zh-Hans" : "en";

    let hasTlang = false;
    for (let i = 0; i < params.length; i++) {
      const eq = params[i].indexOf("=");
      const k = (eq < 0 ? params[i] : params[i].slice(0, eq)).toLowerCase();
      if (k === "tlang") {
        if (hasTlang) return null;
        if (isTarget) {
          params.splice(i, 1);
          i--;
        } else {
          params[i] = k + "=" + encodeURIComponent(tlangCode);
        }
        hasTlang = true;
      }
    }
    if (!hasTlang && !isTarget) {
      params.push("tlang=" + encodeURIComponent(tlangCode));
    }
    const result = base + "?" + params.join("&");
    return result === url ? null : result;
  }
})();

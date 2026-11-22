/**
 * Pixiv 漫画原位翻译 · Loon 请求改写脚本
 * ---------------------------------------------------------------
 * 把 Pixiv App 对 i.pximg.net 的图片请求，改写到自建图片翻译 Worker。
 *
 *   原始: GET https://i.pximg.net/c/540x540_70/img-master/.../123456_p0_master1200.jpg
 *   改写: GET https://<worker>/img?src=<原URL编码>&lang=zh-CN
 *   Worker 抓原图 → 视觉模型 → 合成译文 → 返回图片
 *
 * Loon 的 $argument 是个对象，键名就是插件 [Argument] 里的变量名。
 *   WORKER_HOST   input   域名
 *   TARGET_LANG   input   目标语言
 *   PASSTHROUGH   switch  true/false
 *   TRANSLATE_ALL switch  true/false
 */

(function () {
  "use strict";

  // ── 内置默认值（Loon 没传 argument 时兜底）─────────────────
  var DEFAULTS = {
    WORKER_HOST: "pixiv-imgproxy.xuetom43b.workers.dev",
    TARGET_LANG: "zh-CN",
    PASSTHROUGH: "true",
    TRANSLATE_ALL: "false"
  };

  /**
   * 从 $argument 取配置。
   * Loon 的 switch 类型会给 "true"/"false" 字符串或 true/false 布尔值，
   * 这里统一成小写字符串，后面用 === "true" 判断。
   */
  function pick(key) {
    var v;
    try {
      if (typeof $argument !== "undefined" && $argument) {
        if (typeof $argument === "object") v = $argument[key];
        else if (typeof $argument === "string") {
          // 某些版本会给 "k1=v1&k2=v2" 形式，兼容一下
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

  // 没配域名 → 原样放行，绝不影响正常看图
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

  // ── 判断这张图要不要走 Worker ──────────────────────────────
  // 头像、封面缩略图、UI 图标走翻译是白白烧钱又拖慢列表加载。
  // 默认只处理漫画/插画大图路径。
  if (!isTranslateAll && !isArtworkImage(url)) {
    $done({});
    return;
  }

  // ── 拼 Worker 请求并改写 ───────────────────────────────────
  var target =
    "https://" +
    host +
    "/img?src=" +
    encodeURIComponent(url) +
    "&lang=" +
    encodeURIComponent(lang) +
    (isPassthrough ? "&pt=1" : "&pt=0");

  $done({ url: target });

  // ── helpers ───────────────────────────────────────────────
  function isArtworkImage(u) {
    // 漫画大图典型路径：
    //   /img-master/img/.../xxx_p0_master1200.jpg
    //   /img-original/img/.../xxx_p0.jpg
    //   /c/1200x1200/img-master/.../xxx_p0_master1200.jpg
    if (/\/img-master\//i.test(u)) return true;
    if (/\/img-original\//i.test(u)) return true;
    if (/\/c\/\d+x\d+.*img-master/i.test(u)) return true;
    return false;
  }
})();

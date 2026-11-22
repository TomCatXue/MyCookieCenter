/**
 * Pixiv 漫画原位翻译 · Loon 请求改写脚本
 * ---------------------------------------------------------------
 * 作用：把 Pixiv App 对 i.pximg.net 的图片请求，
 *       改写成对自建图片翻译 Worker 的请求。
 *
 * 链路：
 *   原始: GET https://i.pximg.net/c/540x540_70/img-master/img/2024/01/01/12/00/00/123456_p0_master1200.jpg
 *   改写: GET https://<worker>/img?src=<原URL编码>&lang=zh-CN
 *   Worker 抓原图 → 视觉模型 → 合成译文 → 返回图片
 *
 * 参数（由 .plugin 的 argument 传入）：
 *   WORKER_HOST      Worker 域名
 *   TARGET_LANG      目标语言
 *   PASSTHROUGH      1 = 只透传原图
 *   TRANSLATE_ALL    1 = 翻译全部图片；0 = 只翻译漫画路径
 */

(function () {
  "use strict";

  // ── 1. 解析参数 ────────────────────────────────────────────
  // Loon 把 argument 以 $argument 暴露；不同版本可能是字符串或对象
  function readArgs() {
    var out = { host: "", lang: "zh-CN", passthrough: "0", all: "0" };

    var raw = typeof $argument !== "undefined" ? $argument : undefined;

    if (raw && typeof raw === "object") {
      out.host = raw.WORKER_HOST || "";
      out.lang = raw.TARGET_LANG || "zh-CN";
      out.passthrough = String(raw.PASSTHROUGH || "0");
      out.all = String(raw.TRANSLATE_ALL || "0");
      return out;
    }

    if (typeof raw === "string" && raw) {
      // 形如 "host,lang,pass,all" 或 "WORKER_HOST=host&..."
      var parts = raw.split(",");
      if (parts.length >= 1 && parts[0]) out.host = parts[0].trim();
      if (parts.length >= 2 && parts[1]) out.lang = parts[1].trim();
      if (parts.length >= 3) out.passthrough = String(parts[2]).trim();
      if (parts.length >= 4) out.all = String(parts[3]).trim();
    }

    return out;
  }

  var args = readArgs();

  // 未配置 Worker 域名 → 原样放行，不影响正常看图
  if (!args.host || args.host.indexOf("REPLACE_ME") >= 0) {
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

  // ── 2. 判断这张图要不要翻译 ────────────────────────────────
  // 头像、封面缩略图、UI 小图标走翻译会白白烧钱又拖慢列表加载。
  // 默认只处理漫画/插画大图路径。
  var shouldTranslate = args.all === "1" || isArtworkImage(url);

  if (!shouldTranslate) {
    $done({});
    return;
  }

  // ── 3. 拼 Worker 请求 ─────────────────────────────────────
  var host = args.host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  var target =
    "https://" +
    host +
    "/img?src=" +
    encodeURIComponent(url) +
    "&lang=" +
    encodeURIComponent(args.lang);

  if (args.passthrough === "1") {
    target += "&pt=1";
  }

  // Loon 的 http-request 脚本通过 $done({ url }) 改请求地址
  $done({ url: target });

  // ── helpers ───────────────────────────────────────────────
  function isArtworkImage(u) {
    // 漫画大图典型路径：
    //   /img-master/img/.../xxx_p0_master1200.jpg
    //   /img-original/img/.../xxx_p0.jpg
    //   /c/1200x1200/img-master/.../xxx_p0_master1200.jpg
    if (/\/img-master\//i.test(u)) return true;
    if (/\/img-original\//i.test(u)) return true;
    // /c/宽x高/... 这类是客户端缩放规格，也要跟着走
    if (/\/c\/\d+x\d+.*img-master/i.test(u)) return true;
    return false;
  }
})();

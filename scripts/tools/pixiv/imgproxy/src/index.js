/**
 * Pixiv 漫画原位翻译 · 图片代理 Worker
 * ---------------------------------------------------------------
 * 目标：让 Pixiv App 原生阅读器直接显示中文译文，不需要离开软件。
 *
 * 链路：
 *   Pixiv App 请求 i.pximg.net/.../p0_master1200.jpg
 *     ↓ Loon [MITM] 解密 i.pximg.net
 *     ↓ Loon [URL Rewrite] 改写成 https://<worker>/img?src=<原图URL>
 *     ↓ 本 Worker 抓原图 → 视觉模型拿气泡坐标 → SVG 合成译文 → 返回图片
 *   Pixiv 阅读器把返回的图当普通图片渲染
 *
 * 运行模式（env.PASSTHROUGH_ONLY）：
 *   1  只透传原图（验证阶段：确认 Pixiv 接不接受代理返回的图）
 *   0  完整翻译链路
 */

import wasmModule from "../node_modules/@resvg/resvg-wasm/index_bg.wasm";
import { ensureWasm, renderTranslated } from "./render.js";
import { detectBubbles } from "./vision.js";

const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const PXIMG_HOST_RE = /^https:\/\/i\.pximg\.net\//;

// 字体在 isolate 内只加载一次
let fontCache = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        return json({
          ok: true,
          mode: modeOf(env),
          engine: env.VISION_ENGINE || "gemini",
          styleVersion: env.STYLE_VERSION || "v1",
          hasKey: !!keyFor(env),
          hasFont: !!(env.FONT_URL || env.FONT),
        });
      }
      if (url.pathname === "/img") return await handleImage(request, env, ctx);

      // 诊断端点：返回一张 1x1 的小图。用来验证 Loon 脚本的 $httpClient
      // 二进制处理链路是否正常（不涉及翻译，不消耗 API 额度）。
      if (url.pathname === "/probe") {
        const px = Uint8Array.from([
          0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
          0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c,
          0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
          0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30,
          0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34,
          0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
          0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
          0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff,
          0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x37, 0xff, 0xd9,
        ]);
        return imageResponse(px, "image/jpeg", { maxAge: 0, extra: { "X-Pixiv-Probe": "1x1" } });
      }

      return json({ ok: false, error: "not found" }, 404);
    } catch (err) {
      return json({ ok: false, error: String((err && err.stack) || err) }, 500);
    }
  },
};

function modeOf(env) {
  return env.PASSTHROUGH_ONLY === "1" ? "passthrough" : "translate";
}

function keyFor(env) {
  const e = (env.VISION_ENGINE || "gemini").toLowerCase();
  if (e === "gemini") return env.GEMINI_KEY;
  if (e === "openai") return env.OPENAI_KEY;
  return env.CUSTOM_KEY;
}

async function handleImage(request, env, ctx) {
  const reqUrl = new URL(request.url);
  const src = reqUrl.searchParams.get("src");
  if (!src) return json({ ok: false, error: "missing src" }, 400);
  if (!PXIMG_HOST_RE.test(src)) {
    return json({ ok: false, error: "only i.pximg.net allowed", got: String(src).slice(0, 80) }, 403);
  }

  const lang = reqUrl.searchParams.get("lang") || env.DEFAULT_TARGET_LANG || "zh-CN";

  // 查询串可以临时覆盖模式，不必重新部署（现场排障用）：
  //   pt=1 强制透传   pt=0 强制翻译（即使全局 PASSTHROUGH_ONLY=1）
  const ptParam = reqUrl.searchParams.get("pt");
  const passthrough =
    ptParam === "1" ? true : ptParam === "0" ? false : env.PASSTHROUGH_ONLY === "1";

  // 上游抓图：pximg 强校验 Referer
  const upstream = await fetch(src, {
    headers: {
      Referer: "https://www.pixiv.net/",
      "User-Agent": UA_DESKTOP,
      Accept: "image/avif,image/webp,image/jpeg,image/png,*/*",
    },
    cf: { cacheEverything: true, cacheTtl: 86400 },
  });

  if (!upstream.ok) {
    return json({ ok: false, error: "upstream " + upstream.status, src }, 502);
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  const contentType = upstream.headers.get("content-type") || "image/jpeg";

  // —— 验证模式：原样返回 ——
  if (passthrough) {
    if (env.LOG_PASSTHROUGH === "1") {
      console.log(JSON.stringify({ event: "passthrough", src, bytes: bytes.length, contentType, lang }));
    }
    return imageResponse(bytes, contentType, { maxAge: 86400, extra: { "X-Pixiv-Translate": "passthrough" } });
  }

  return translateImage({ src, bytes, contentType, lang, env, ctx });
}

async function translateImage({ src, bytes, contentType, lang, env, ctx }) {
  const cache = env.TRANSLATE_CACHE;
  const styleVersion = env.STYLE_VERSION || "v1";
  const engine = (env.VISION_ENGINE || "gemini").toLowerCase();
  const cacheKey = `tr:${styleVersion}:${engine}:${lang}:${await sha1Hex(src)}`;

  if (cache) {
    const hit = await cache.get(cacheKey, "arrayBuffer");
    if (hit && hit.byteLength) {
      return imageResponse(new Uint8Array(hit), "image/jpeg", {
        maxAge: 604800,
        extra: { "X-Pixiv-Translate": "hit" },
      });
    }
  }

  let out;
  try {
    out = await buildTranslatedImage({ src, bytes, contentType, lang, env });
  } catch (err) {
    console.log(
      JSON.stringify({ event: "translate_fail", src, error: String((err && err.message) || err) })
    );
    // 翻译失败降级回原图，绝不让阅读器白屏
    return imageResponse(bytes, contentType, {
      maxAge: 300,
      extra: { "X-Pixiv-Translate": "fail-passthrough" },
    });
  }

  if (out && out.skipped) {
    return imageResponse(bytes, contentType, {
      maxAge: 3600,
      extra: { "X-Pixiv-Translate": "no-dialogue" },
    });
  }

  if (cache && out && out.bytes) {
    const buf = out.bytes.buffer.slice(out.bytes.byteOffset, out.bytes.byteOffset + out.bytes.byteLength);
    ctx.waitUntil(cache.put(cacheKey, buf, { expirationTtl: 604800 }).catch(() => {}));
  }

  return imageResponse(out.bytes, "image/jpeg", {
    maxAge: 604800,
    extra: {
      "X-Pixiv-Translate": "miss",
      "X-Pixiv-Bubbles": String(out.bubbles || 0),
    },
  });
}

async function buildTranslatedImage({ src, bytes, contentType, lang, env }) {
  // 1. 原图转 data URI 交给视觉模型（避免模型自己抓 pximg 被 403）
  const b64 = base64FromBytes(bytes);
  const imageDataUri = `data:${contentType};base64,${b64}`;

  // 2. 视觉模型识别气泡
  const bubbles = await detectBubbles({ imageDataUri, lang, env });
  if (!bubbles || !bubbles.length) {
    return { skipped: true, bubbles: 0 };
  }

  // 3. 拿到图片尺寸（从 PNG/JPEG 头部解析，避免额外依赖）
  const dim = imageSize(bytes, contentType);
  if (!dim) throw new Error("无法解析图片尺寸");

  // 4. 加载字体 + wasm
  const font = await loadFont(env);
  await ensureWasm(wasmModule);

  // 5. 合成
  const png = renderTranslated({
    imageDataUri,
    width: dim.width,
    height: dim.height,
    bubbles,
    fontBuffer: font,
    theme: themeFrom(env),
  });

  return { bytes: png, bubbles: bubbles.length };
}

function themeFrom(env) {
  const num = (v, d) => (v == null || v === "" || isNaN(Number(v)) ? d : Number(v));
  return {
    fill: env.THEME_FILL || "#fffdf8",
    text: env.THEME_TEXT || "#111111",
    stroke: env.THEME_STROKE || "#ffffff",
    // 遮罩必须完全不透明，日文笔画密，0.9 都会透出来
    opacity: num(env.THEME_OPACITY, 1),
    // 只给极小外扩补模型误差，给大了会吃掉气泡原生黑轮廓
    padGrow: num(env.THEME_PAD_GROW, 0.015),
  };
}

/** 字体：优先 env.FONT（base64），否则从 FONT_URL 拉取并缓存 */
async function loadFont(env) {
  if (fontCache) return fontCache;

  if (env.FONT) {
    fontCache = base64ToBytes(env.FONT);
    return fontCache;
  }

  if (!env.FONT_URL) {
    throw new Error("未配置字体：请设置 FONT_URL 或 FONT（base64）");
  }

  const res = await fetch(env.FONT_URL, { cf: { cacheEverything: true, cacheTtl: 604800 } });
  if (!res.ok) throw new Error("字体下载失败: " + res.status);

  fontCache = new Uint8Array(await res.arrayBuffer());
  return fontCache;
}

// ─── 图片尺寸解析（支持 JPEG / PNG / WebP / GIF）─────────────────
function imageSize(b, contentType) {
  const u = b;
  // PNG: 89 50 4E 47
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) {
    return {
      width: (u[16] << 24) | (u[17] << 16) | (u[18] << 8) | u[19],
      height: (u[20] << 24) | (u[21] << 16) | (u[22] << 8) | u[23],
    };
  }
  // GIF: 47 49 46
  if (u[0] === 0x47 && u[1] === 0x49 && u[2] === 0x46) {
    return { width: u[6] | (u[7] << 8), height: u[8] | (u[9] << 8) };
  }
  // WebP: RIFF....WEBP
  if (u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57) {
    if (u[12] === 0x56 && u[13] === 0x50 && u[14] === 0x38 && u[15] === 0x20) {
      // VP8 (lossy)
      return { width: (u[26] | (u[27] << 8)) & 0x3fff, height: (u[28] | (u[29] << 8)) & 0x3fff };
    }
    if (u[12] === 0x56 && u[13] === 0x50 && u[14] === 0x38 && u[15] === 0x4c) {
      // VP8L (lossless)
      const bits = u[21] | (u[22] << 8) | (u[23] << 16) | (u[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (u[12] === 0x56 && u[13] === 0x50 && u[14] === 0x38 && u[15] === 0x58) {
      // VP8X (extended)
      const w = (u[24] | (u[25] << 8) | (u[26] << 16)) + 1;
      const h = (u[27] | (u[28] << 8) | (u[29] << 16)) + 1;
      return { width: w, height: h };
    }
    return null;
  }
  // JPEG: FF D8
  if (u[0] === 0xff && u[1] === 0xd8) {
    let i = 2;
    while (i < u.length - 9) {
      if (u[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = u[i + 1];
      const len = (u[i + 2] << 8) | u[i + 3];
      // SOF0..SOF15（排除 DHT=C4, JPG=C8, DAC=CC）
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (u[i + 5] << 8) | u[i + 6], width: (u[i + 7] << 8) | u[i + 8] };
      }
      if (len <= 0) break;
      i += 2 + len;
    }
    return null;
  }
  return null;
}

// ─── Base64 ────────────────────────────────────────────────
function base64FromBytes(u8) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── 工具 ───────────────────────────────────────────────────
function imageResponse(bytes, contentType, { maxAge = 3600, extra = {} } = {}) {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType || "image/jpeg",
      "Cache-Control": `public, max-age=${maxAge}`,
      ...extra,
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha1Hex(str) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

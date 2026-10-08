/**
 * Pixiv 小说翻译 · Cloudflare Workers 翻译代理
 * -------------------------------------------------------------
 * 作用：把 Google 免费接口的限流压力从"你的设备 IP"转移到"Workers IP"，
 *       并在服务端缓存译文（同段重复翻译 = 0 上游请求）。
 *
 * 接口协议（与插件 pxtrans 返回结构保持一致）：
 *   POST https://<worker>/translate?t=google&l=zh-CN
 *   Body（批量）: {"texts":["段1","段2",...]}
 *   Body（单段）: 待翻译文本（纯文本）
 *   Header: x-worker-token: <WORKER_TOKEN>（可选，防滥用）
 *   Response（批量）: {"ok":true,"translation":"","translations":["译1","译2"],"src":"google","error":""}
 *   Response（单段）: {"ok":true,"translation":"...","src":"google","error":""}
 *
 * 部署说明见同目录 README.md
 */
const DEFAULT_TOKEN = "CHANGE_ME_PLEASE"; // 仅本机直跑测试用；正式部署用 env.WORKER_TOKEN
// 版本自证：所有响应带 v 字段。curl 返回里能看到 v=20260829-batch-v4 才说明部署的是最新版。
const WORKER_VERSION = "20260829-batch-v4";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 路径固定为 /translate，其余返回 404
    if (url.pathname !== "/translate") {
      return json({ ok: false, translation: "", src: "", error: "not found" }, 404);
    }

    // 简单鉴权，防止他人盗用你的 Worker
    const token = env.WORKER_TOKEN || DEFAULT_TOKEN;
    const auth = request.headers.get("x-worker-token") || url.searchParams.get("token") || "";
    if (token !== "CHANGE_ME_PLEASE" && auth !== token) {
      return json({ ok: false, translation: "", src: "", error: "unauthorized" }, 403);
    }

    if (request.method !== "POST") {
      return json({ ok: false, translation: "", src: "", error: "method not allowed" }, 405);
    }

    const target = url.searchParams.get("l") || "zh-CN";
    const src = url.searchParams.get("t") || "google";

    // —— 诊断：?echo=1 时回显收到的原始 body（含长度），用于排查请求体解析 ——
    if (url.searchParams.get("echo") === "1") {
      const rawEcho = await request.text();
      return json({ ok: true, code: "echo", raw: rawEcho, rawLen: String(rawEcho).length, src, error: "" });
    }

    // —— 解析请求体：支持 JSON 批量协议 {texts:[...]} 和裸文本两种形态 ——
    // request.body 只能读一次，先读出来再判断
    const raw = await request.text();
    let texts = null;
    let text = "";
    const trimmed = raw.trim();
    if (/^[{[]/.test(trimmed)) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.texts)) texts = parsed.texts.map(String);
        else if (parsed && typeof parsed === "object") {
          // 合法 JSON 但不是批量协议：明确报错，避免像旧版那样把整个 JSON 当文本翻译
          return json({ ok: false, translation: "", src, error: "请求体是 JSON 但缺少 texts 数组：请用 {\"texts\":[...]} 批量格式或发送裸文本" });
        }
      } catch (e) { texts = null; }
    }
    if (!texts) text = raw;
    if (!text && !(texts && texts.length)) {
      return json({ ok: false, translation: "", src, error: "空请求体" });
    }

    // —— 批量翻译（多段）——
    if (texts) {
      try {
        const translations = new Array(texts.length).fill(null);
        const needIdx = [];
        const need = [];
        // 1) 逐段查 KV 缓存，命中直接填充
        for (let i = 0; i < texts.length; i++) {
          const ck = await sha256("v2\n" + target + "\n" + texts[i]);
          if (env.PXTC_CACHE) {
            try {
              const hit = await env.PXTC_CACHE.get(ck);
              if (hit !== null) { translations[i] = hit; continue; }
            } catch (e) { /* 缓存不可用则跳过 */ }
          }
          needIdx.push(i);
          need.push(texts[i]);
        }
        // 2) 未命中缓存的段打包成一次 /translate_a/t 批量请求（client=gtx，多 q），
        //    10 段 = 1 次 Google 请求，而非旧的 10 次逐段调用，大幅降低 429 概率
        if (need.length) {
          const batchResult = await googleTranslateBatch(need, target);
          for (let j = 0; j < batchResult.length; j++) {
            translations[needIdx[j]] = batchResult[j];
            if (env.PXTC_CACHE && batchResult[j]) {
              try {
                const ck = await sha256("v2\n" + target + "\n" + need[j]);
                await env.PXTC_CACHE.put(ck, batchResult[j], { expirationTtl: 30 * 24 * 3600 });
              } catch (e) { }
            }
          }
        }
        return json({ ok: true, translation: "", translations, src, error: "" });
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/限流|429/.test(msg)) {
          return json({ ok: false, translation: "", translations: [], src, error: "代理端 Google 限流（429），请稍后重试" });
        }
        return json({ ok: false, translation: "", translations: [], src, error: "代理翻译失败：" + msg });
      }
    }

    // —— 单段翻译 ——
    // 缓存 key 带 v2 前缀，绕过旧版缓存污染
    const cacheKey = await sha256("v2\n" + target + "\n" + text);
    if (env.PXTC_CACHE) {
      try {
        const hit = await env.PXTC_CACHE.get(cacheKey);
        if (hit !== null) {
          return json({ ok: true, translation: hit, src, error: "" });
        }
      } catch (e) { /* 缓存不可用则跳过 */ }
    }
    try {
      const translation = await googleTranslate(text, target);
      if (env.PXTC_CACHE && translation) {
        try {
          await env.PXTC_CACHE.put(cacheKey, translation, { expirationTtl: 30 * 24 * 3600 });
        } catch (e) { /* 写缓存失败忽略 */ }
      }
      return json({ ok: true, translation, src, error: "" });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/限流|429/.test(msg)) {
        return json({ ok: false, translation: "", src, error: "代理端 Google 限流（429），请稍后重试" });
      }
      return json({ ok: false, translation: "", src, error: "代理翻译失败：" + msg });
    }
  }
};

// 批量翻译：用 /translate_a/t（client=gtx，POST 多 q），一次请求翻多段，
// 10 段 = 1 次 Google 请求，是避免 429 最有效的办法（与插件直连逻辑一致）。
async function googleTranslateBatch(texts, target) {
  const arr = texts.map(String);
  if (!arr.length) return [];
  const params = new URLSearchParams({ client: "gtx", dt: "t", sl: "auto", tl: target });
  const body = arr.map(function (t) { return "q=" + encodeURIComponent(t); }).join("&");
  // googleapis.com 最不易 429，放最前；hk 经常返回 reCAPTCHA 页
  const hosts = [
    "https://translate.googleapis.com/translate_a/t",
    "https://translate.google.com/translate_a/t",
    "https://translate.google.hk/translate_a/t"
  ];
  let lastErr = null;
  let sawRateLimit = false;
  for (let i = 0; i < hosts.length; i++) {
    try {
      const res = await fetch(hosts[i] + "?" + params, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: body,
        cf: { cacheTtl: 0 }
      });
      const raw = await res.text();
      if (res.status === 429 || /^\s*</.test(raw) || /unusual traffic|异常流量/i.test(raw)) {
        sawRateLimit = true;
        lastErr = new Error("Google 限流（429）");
        continue;
      }
      let data;
      try { data = JSON.parse(raw); } catch (e) {
        lastErr = new Error("Google 返回非 JSON");
        continue;
      }
      if (!Array.isArray(data) || data.length !== arr.length) {
        // 段数不匹配：退回逐段翻译
        const fallback = [];
        for (let k = 0; k < arr.length; k++) fallback.push(await googleTranslate(arr[k], target));
        return fallback;
      }
      const out = [];
      for (let j = 0; j < arr.length; j++) {
        const item = data[j];
        if (Array.isArray(item) && typeof item[0] === "string") out.push(item[0]);
        else if (typeof item === "string") out.push(item);
        else { lastErr = new Error("Google 返回段数不匹配"); break; }
      }
      if (out.length === arr.length) return out;
    } catch (e) {
      lastErr = e;
    }
  }
  if (sawRateLimit) throw new Error("Google 限流（429）");
  throw lastErr || new Error("Google 翻译失败");
}

// 单段翻译：用 /translate_a/single（client=it），作为批量接口段数不匹配时的兜底
async function googleTranslate(text, target) {
  const hosts = [
    "https://translate.google.hk/translate_a/single",
    "https://translate.googleapis.com/translate_a/single",
    "https://translate.google.com/translate_a/single"
  ];
  let lastErr = null;
  for (let i = 0; i < hosts.length; i++) {
    try {
      const qs = new URLSearchParams({
        client: "it",
        dt: "t",
        otf: "3",
        dj: "1",
        hl: "zh_CN",
        sl: "auto",
        tl: target,
        q: text
      });
      const res = await fetch(hosts[i] + "?" + qs, {
        headers: { "User-Agent": "Mozilla/5.0" },
        cf: { cacheTtl: 0 }
      });
      const body = await res.text();
      if (res.status === 429 || /^\s*</.test(body)) {
        lastErr = new Error("Google 限流（429）");
        continue; // 换下一个域名
      }
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        lastErr = new Error("Google 返回非 JSON");
        continue;
      }
      if (!data || !Array.isArray(data.sentences)) {
        lastErr = new Error("Google 返回格式异常");
        continue;
      }
      let out = "";
      for (let j = 0; j < data.sentences.length; j++) {
        if (data.sentences[j] && typeof data.sentences[j].trans === "string") out += data.sentences[j].trans;
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Google 翻译失败");
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(Object.assign({ v: WORKER_VERSION }, obj)), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
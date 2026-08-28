/**
 * Pixiv 小说翻译 · Cloudflare Workers 翻译代理
 * -------------------------------------------------------------
 * 作用：把 Google 免费接口的限流压力从"你的设备 IP"转移到"Workers IP"，
 *       并在服务端缓存译文（同段重复翻译 = 0 上游请求）。
 *
 * 接口协议（与插件 pxtrans 返回结构保持一致）：
 *   POST https://<worker>/translate?t=google&l=zh-CN
 *   Body: 待翻译文本（纯文本）
 *   Header: x-worker-token: <WORKER_TOKEN>（可选，防滥用）
 *   Response: {"ok":true,"translation":"...","src":"google","error":""}
 *
 * 部署说明见同目录 README.md
 */
const DEFAULT_TOKEN = "CHANGE_ME_PLEASE"; // 仅本机直跑测试用；正式部署用 env.WORKER_TOKEN

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

    const text = await request.text();
    const target = url.searchParams.get("l") || "zh-CN";
    const src = url.searchParams.get("t") || "google";
    if (!text || !text.trim()) {
      return json({ ok: false, translation: "", src, error: "空请求体" });
    }

    // —— 缓存查询（KV 命名空间 PXTC_CACHE，部署时绑定）——
    const cacheKey = await sha256(target + "\n" + text);
    if (env.PXTC_CACHE) {
      try {
        const hit = await env.PXTC_CACHE.get(cacheKey);
        if (hit !== null) {
          return json({ ok: true, translation: hit, src, error: "" });
        }
      } catch (e) { /* 缓存不可用则跳过 */ }
    }

    // —— 调 Google 免费接口（三域名轮换）——
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
      // 429/HTML → 明确标记限流，插件侧可提示
      if (/限流|429/.test(msg)) {
        return json({ ok: false, translation: "", src, error: "代理端 Google 限流（429），请稍后重试" });
      }
      return json({ ok: false, translation: "", src, error: "代理翻译失败：" + msg });
    }
  }
};

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
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
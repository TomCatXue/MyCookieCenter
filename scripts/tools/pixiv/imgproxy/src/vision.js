/**
 * 视觉模型层：让模型直接看图，返回气泡坐标 + 原文 + 译文
 * ---------------------------------------------------------------
 * 支持三种引擎：
 *   gemini   Google Gemini（推荐，漫画理解最好）
 *   openai   OpenAI 兼容端点（GPT-4o / 自建中转）
 *   custom   任意 OpenAI 兼容端点（DeepSeek-VL / Qwen-VL 等）
 *
 * 统一返回：[{ box:[ymin,xmin,ymax,xmax], ja, zh, shape }]
 */

const TRANSIENT_RE =
  /high demand|overloaded|try again later|temporarily|rate limit|resource[_ ]exhausted|too many requests|quota|429|500|502|503|504|timeout|timed out|ECONNRESET|socket hang up|fetch failed/i;

const LANG_NAMES = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

function buildPrompt(langName) {
  return [
    "You are a professional manga translator. Analyze this manga/comic page.",
    "",
    "Detect EVERY speech bubble, thought bubble, caption box, and any free-floating dialogue text.",
    "Return ONLY a valid JSON array. No markdown code fences. No explanation.",
    "",
    "Each element must be an object with exactly these keys:",
    '- "box": [ymin, xmin, ymax, xmax] — normalized percentages 0-100 of the image size',
    '- "ja": the original text you detected, verbatim (Japanese, or whatever language it is)',
    `- "zh": natural ${langName} translation in manga style (colloquial, keep honorifics tone, keep sound effects natural)`,
    '- "shape": one of "ellipse" | "rect" | "spiky" | "free" — the bubble outline type',
    "",
    "Rules:",
    "- Order elements in manga reading order: right-to-left, top-to-bottom.",
    '- IMPORTANT: "box" must cover the ENTIRE BUBBLE OUTLINE (balloon or caption box), not just the glyphs. ' +
      "The box paints a mask over the original lettering, so it must fully contain it, including vertical Japanese text. When unsure, go slightly larger.",
    "- Never merge two separate bubbles into one box. Never split one bubble into several boxes.",
    "- Skip non-dialogue text: artist signatures, watermarks, page numbers, SFX drawn as graphics.",
    "- If there is no dialogue at all, return [].",
    "- Translate faithfully. Do not add commentary or notes.",
    "",
    "Example output:",
    '[{"box":[8,47,30,93],"ja":"これはテストです","zh":"这是一个测试。","shape":"ellipse"}]',
  ].join("\n");
}

export async function detectBubbles({ imageDataUri, lang, env }) {
  const engine = (env.VISION_ENGINE || "gemini").toLowerCase();
  const langName = LANG_NAMES[lang] || "简体中文";
  const prompt = buildPrompt(langName);

  if (engine === "gemini") return callOpenAICompatible({ prompt, imageDataUri, env, kind: "gemini" });
  if (engine === "openai") return callOpenAICompatible({ prompt, imageDataUri, env, kind: "openai" });
  return callOpenAICompatible({ prompt, imageDataUri, env, kind: "custom" });
}

function resolveEndpoint(env, kind) {
  if (kind === "gemini") {
    return {
      url:
        env.GEMINI_URL ||
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: env.GEMINI_KEY || "",
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
    };
  }
  if (kind === "openai") {
    return {
      url: env.OPENAI_URL || "https://api.openai.com/v1/chat/completions",
      key: env.OPENAI_KEY || "",
      model: env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  return {
    url: env.CUSTOM_URL || "",
    key: env.CUSTOM_KEY || "",
    model: env.CUSTOM_MODEL || "",
  };
}

async function callOpenAICompatible({ prompt, imageDataUri, env, kind }) {
  const { url, key, model } = resolveEndpoint(env, kind);
  if (!url) throw new Error(`未配置 ${kind} 端点 URL`);
  if (!key) throw new Error(`未配置 ${kind} API Key`);

  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUri } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(700 * attempt);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      });
    } catch (netErr) {
      lastErr = new Error(`${kind} 网络异常: ${netErr && netErr.message}`);
      if (TRANSIENT_RE.test(String(netErr && netErr.message))) continue;
      throw lastErr;
    }

    const raw = await res.text();
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      lastErr = new Error(`${kind} 返回非 JSON: ${raw.slice(0, 120)}`);
      continue;
    }

    const errObj = payload && payload.error;
    if (errObj) {
      const msg = errObj.message || errObj.status || JSON.stringify(errObj);
      lastErr = new Error(`${kind} 报错: ${msg}`);
      if (TRANSIENT_RE.test(msg)) continue;
      throw lastErr;
    }

    const choice = payload && payload.choices && payload.choices[0];
    if (choice && choice.finish_reason && !["stop", "length"].includes(choice.finish_reason)) {
      throw new Error(`${kind} 审核拦截: ${choice.finish_reason}`);
    }

    const content = choice && choice.message && choice.message.content;
    const bubbles = parseBubbles(content);
    if (bubbles.length) return bubbles;

    // 有内容但解析不出气泡 → 常是输出截断，重试一次
    if (typeof content === "string" && content.trim()) {
      lastErr = new Error(`${kind} 解析失败: ${content.trim().slice(0, 80)}`);
      continue;
    }

    return [];
  }

  throw lastErr || new Error(`${kind} 识别失败`);
}

/**
 * 从 open 位置的 '[' 出发，按括号配对找它真正的收尾位置。
 * 正确处理字符串内的括号与转义；遇到未闭合（截断）返回 -1。
 */
function matchBracketEnd(str, open) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** JSON 容错解析 */
function tryParse(s) {
  try {
    const v = JSON.parse(s);
    return v === null ? undefined : v;
  } catch (e) {
    return undefined;
  }
}

/** 从被截断的 JSON 里抢救完整对象 */
function salvageObjects(str) {
  const out = [];
  let depth = 0,
    start = -1,
    inStr = false,
    esc = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const obj = tryParse(str.slice(start, i + 1));
        if (obj && typeof obj === "object" && !Array.isArray(obj)) out.push(obj);
        start = -1;
      }
    }
  }
  return out;
}

export function parseBubbles(content) {
  let value = content;

  if (typeof value === "string") {
    let clean = value.trim();
    const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced) clean = fenced[1].trim();
    else
      clean = clean
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    // 去掉数组前面/后面的散文（模型常写「Here are the bubbles: [...]」）。
    // 必须按括号配对找真正的收尾：裸用 lastIndexOf(']') 会匹配到
    // box 内部的 "]"（如 [1,2,3,4]），把整段截断在错误位置。
    const arrStart = clean.indexOf("[");
    if (arrStart >= 0) {
      const arrEnd = matchBracketEnd(clean, arrStart);
      clean = arrEnd > arrStart ? clean.slice(arrStart, arrEnd + 1) : clean.slice(arrStart);
    }

    let parsed = tryParse(clean);
    if (parsed === undefined) parsed = tryParse(clean.replace(/,\s*([\]}])/g, "$1"));
    if (parsed === undefined) {
      const salvaged = salvageObjects(clean);
      if (salvaged.length) parsed = salvaged;
    }
    if (parsed === undefined) return [];
    value = parsed;
  }

  if (!Array.isArray(value)) {
    value = value && (value.bubbles || value.items || value.data);
  }
  if (!Array.isArray(value)) return [];

  const raw = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const box = item.box || item.box_2d || item.bbox || item.coordinates;
    const zh = item.zh || item.translation || item.chinese || item.target || item.text;
    if (Array.isArray(box) && box.length === 4 && zh) {
      raw.push({
        box: box.map(Number),
        ja: String(item.ja || item.japanese || item.src || item.source || ""),
        zh: String(zh),
        shape: String(item.shape || item.type || "ellipse").toLowerCase(),
      });
    }
  }
  if (!raw.length) return [];

  // 坐标尺度自适应：模型可能返回 0-1、0-100 或 0-1000
  const all = [];
  for (const it of raw) for (const n of it.box) if (isFinite(n)) all.push(n);
  const maxVal = all.length ? Math.max(...all) : 0;

  return raw.map((it) => {
    let box = it.box;
    if (maxVal > 100) box = box.map((v) => v / 10);
    else if (maxVal > 0 && maxVal <= 1.0) box = box.map((v) => v * 100);
    return { ...it, box };
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

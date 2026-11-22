/**
 * SVG 合成渲染层
 * ---------------------------------------------------------------
 * 把「原图 + 气泡坐标 + 译文」拼成一张新图。
 * 关键设计：气泡遮罩不是死板矩形，而是按 shape 类型走不同路径，
 *          字号按盒高动态计算并自动收缩，避免译文溢出。
 */

import { Resvg, initWasm } from "@resvg/resvg-wasm";

let wasmReady = null;

/** Worker 里 wasm 只需初始化一次（isolate 复用） */
export async function ensureWasm(wasmModuleOrBytes) {
  if (!wasmReady) {
    wasmReady = initWasm(wasmModuleOrBytes).catch((e) => {
      wasmReady = null;
      throw e;
    });
  }
  return wasmReady;
}

/** XML 转义，防止译文里的 < & " 破坏 SVG */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 估算一行能放几个字。中文按 1 个字符宽度算，
 * 英文/数字按 0.55 个字符宽度算（等宽近似）。
 */
function charWidth(ch) {
  const code = ch.codePointAt(0);
  // CJK 统一表意文字 + 全角标点 + 假名
  if (
    (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x3040 && code <= 0x30ff)
  ) {
    return 1.0;
  }
  return 0.55;
}

function textUnits(s) {
  let n = 0;
  for (const ch of s) n += charWidth(ch);
  return n;
}

/** 按盒宽把译文折成多行 */
function wrapText(text, maxUnits) {
  const lines = [];
  let cur = "";
  let curW = 0;
  for (const ch of String(text)) {
    const w = charWidth(ch);
    if (ch === "\n") {
      lines.push(cur);
      cur = "";
      curW = 0;
      continue;
    }
    if (curW + w > maxUnits && cur) {
      lines.push(cur);
      cur = ch;
      curW = w;
    } else {
      cur += ch;
      curW += w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * 计算最优字号：在「盒子能装下」和「字不能太小」之间取平衡。
 * 返回 { fontSize, lines }
 */
function fitText(text, boxW, boxH, opts = {}) {
  const minFont = opts.minFont || 10;
  const maxFont = opts.maxFont || 40;
  const lineHeight = opts.lineHeight || 1.28;
  const padRatio = opts.padRatio || 0.07; // 内边距占盒子的比例

  const innerW = boxW * (1 - padRatio * 2);
  const innerH = boxH * (1 - padRatio * 2);

  // 从大到小找第一个能装下的字号。
  // 椭圆气泡的有效内切区比外接矩形小，这里用 0.78 系数保守收缩，
  // 保证文字不会压到椭圆边缘。
  const effW = innerW * 0.86;
  const effH = innerH * 0.82;

  const textW = textUnits(text);

  // 先算单行方案能到多大
  const oneLineFont = Math.floor(
    Math.min(maxFont, effW / Math.max(textW, 0.001), effH / lineHeight, effH / lineHeight)
  );
  const oneLineOK = oneLineFont >= minFont && textW * oneLineFont <= effW;

  // 再算折行方案能到多大：从大字往小字扫，取「装得下且字号最大」的排法
  let bestWrap = null;
  for (let fs = maxFont; fs >= minFont; fs -= 1) {
    const maxUnits = effW / fs;
    if (maxUnits < 1) continue;
    const lines = wrapText(text, maxUnits);
    if (lines.length < 2) continue; // 单行，交给上面处理
    const totalH = lines.length * fs * lineHeight;
    if (totalH > effH) continue;
    // 避免「最后一行只剩一个字」的孤字断行
    const lastUnits = textUnits(lines[lines.length - 1]);
    if (lastUnits <= 1.01 && lines.length > 2) continue;
    // 行数太多不好读
    if (lines.length > 5) continue;

    bestWrap = { fontSize: fs, lines };
    break; // 从大到小扫，第一个成立的就是最大字号
  }

  // 决策：谁的最终字号大就用谁。
  // 长句硬挤成单行会缩成蚂蚁，这时候折行明显更好读。
  if (oneLineOK && (!bestWrap || oneLineFont >= bestWrap.fontSize)) {
    return { fontSize: oneLineFont, lines: [text] };
  }
  if (bestWrap) return bestWrap;
  if (oneLineOK) return { fontSize: oneLineFont, lines: [text] };

  // 极端情况：全部装不下，用最小字号硬排
  const fallbackUnits = Math.max(1, effW / minFont);
  return { fontSize: minFont, lines: wrapText(text, fallbackUnits).slice(0, 6) };
}

/** 生成气泡形状的 SVG path / 元素 */
function bubbleShape(x, y, w, h, shape) {
  const s = String(shape || "rect").toLowerCase();
  if (s === "ellipse" || s === "oval" || s === "round") {
    return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" />`;
  }
  if (s === "spiky" || s === "jagged" || s === "burst") {
    // 爆炸形：围绕中心生成锯齿多边形
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const spikes = 12;
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (Math.PI * i) / spikes - Math.PI / 2;
      const k = i % 2 === 0 ? 1.0 : 0.82;
      pts.push(`${(cx + Math.cos(ang) * rx * k).toFixed(1)},${(cy + Math.sin(ang) * ry * k).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(" ")}" />`;
  }
  // 默认圆角矩形
  const r = Math.min(12, Math.min(w, h) * 0.18);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" />`;
}

/**
 * 主渲染函数
 * @param {Object} p
 * @param {string} p.imageDataUri  原图的 data URI
 * @param {number} p.width         图片宽
 * @param {number} p.height        图片高
 * @param {Array}  p.bubbles       [{ box:[ymin,xmin,ymax,xmax] 百分比, zh, shape? }]
 * @param {Object} p.theme         { fill, text, border }
 * @param {Uint8Array} p.fontBuffer 字体字节
 */
export function renderTranslated({ imageDataUri, width, height, bubbles, theme, fontBuffer }) {
  const t = theme || {};
  const fill = t.fill || "#fffdf8";
  const textColor = t.text || "#111111";
  const strokeColor = t.stroke || "#ffffff";
  // 遮罩外扩比例。模型已被要求返回「气泡本体」框，
  // 所以只需要极小余量补模型误差。给大了会把气泡原生的黑色轮廓线一起吃掉。
  const padGrow = t.padGrow == null ? 0.015 : Number(t.padGrow);
  // 默认完全不透明：日文笔画密，任何半透明都会透出来。
  const shapeOpacity = t.opacity == null ? 1 : t.opacity;

  const parts = [];

  // 底层：原图
  parts.push(
    `<image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" href="${imageDataUri}"/>`
  );

  for (const b of bubbles) {
    const box = b.box;
    if (!Array.isArray(box) || box.length !== 4) continue;

    // box = [ymin, xmin, ymax, xmax] 百分比
    const ymin = Number(box[0]);
    const xmin = Number(box[1]);
    const ymax = Number(box[2]);
    const xmax = Number(box[3]);
    if (![ymin, xmin, ymax, xmax].every((v) => isFinite(v))) continue;

    const rawX = (Math.min(xmin, xmax) / 100) * width;
    const rawY = (Math.min(ymin, ymax) / 100) * height;
    const w = (Math.abs(xmax - xmin) / 100) * width;
    const h = (Math.abs(ymax - ymin) / 100) * height;
    if (w < 8 || h < 8) continue;

    // 关键：模型给的是「文字」框，日文原文往往比框更宽（尤其竖排或长句）。
    // 遮罩必须外扩才能盖干净，否则原文会从框外透出来。
    // 外扩量按框尺寸比例算，并做上下限约束，避免小框外扩过头盖到画面。
    const growX = Math.max(6, w * padGrow);
    const growY = Math.max(4, h * padGrow * 0.8);
    const mx = Math.max(0, rawX - growX);
    const my = Math.max(0, rawY - growY);
    const mw = Math.min(width - mx, w + growX * 2);
    const mh = Math.min(height - my, h + growY * 2);

    // 遮罩：完全盖住原文。
    // 注意：这里不能用半透明——日文原文字形密，0.9 以上都会透出来。
    // stroke 只用来吃掉边缘锯齿，必须很细：太粗会把气泡原来的黑色轮廓线也盖掉。
    const strokeW = Math.max(1, Math.min(mw, mh) * 0.008);
    parts.push(
      `<g fill="${esc(fill)}" stroke="${esc(fill)}" stroke-width="${strokeW.toFixed(1)}" opacity="${shapeOpacity}">` +
        bubbleShape(mx, my, mw, mh, b.shape) +
        `</g>`
    );

    // 文字
    const zh = b.zh || "";
    if (!zh) continue;

    // maxFont 上限：既要受框高约束（不能超出气泡），
    // 也要给一个足够大的绝对上限，否则长句会被压得很小。
    // 框高 * 0.5 是经验值：中文单行占 em 的约 0.72，留出行距余量。
    const { fontSize, lines } = fitText(zh, mw, mh, {
      maxFont: Math.min(64, mh * 0.5),
      minFont: 10,
    });

    const lineH = fontSize * 1.28;
    const totalH = lines.length * lineH;
    // 文字居中于「遮罩块」而不是原始文字框：
    // 遮罩外扩后视觉重心才是用户感知的气泡中心。
    // SVG 的 y 是文字基线，不是顶边。
    const startY = my + mh / 2 - totalH / 2 + lineH * 0.5 + fontSize * 0.36;
    const cx = mx + mw / 2;

    parts.push(`<g font-family="PixivTR" text-anchor="middle" fill="${esc(textColor)}">`);
    lines.forEach((line, i) => {
      const ly = startY + i * lineH;
      // 双层描边让文字在复杂背景上不糊
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="${fontSize.toFixed(1)}" ` +
          `stroke="${esc(strokeColor)}" stroke-width="${(fontSize * 0.13).toFixed(1)}" ` +
          `stroke-linejoin="round" paint-order="stroke">${esc(line)}</text>`
      );
    });
    parts.push(`</g>`);
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    parts.join("") +
    `</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      fontBuffers: [fontBuffer],
      defaultFontFamily: "PixivTR",
      loadSystemFonts: false,
    },
    background: "#ffffff",
  });

  return resvg.render().asPng();
}

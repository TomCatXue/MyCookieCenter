/**
 * 字体准备工具
 * ---------------------------------------------------------------
 * Worker 直接塞 9.7MB 的 simhei.ttf 会超体积限制。做法：
 *   1. 用 woff2 压缩（体积降到 ~1/3）
 *   2. 传到可公开访问的存储（R2 / GitHub Release / 你自己的图床）
 *   3. 把 URL 填到 wrangler.toml 的 FONT_URL
 *
 * 用法：
 *   node tools/prepare-font.mjs "C:/Windows/Fonts/simhei.ttf" ./dist/simhei.woff2
 */

import fs from "node:fs";
import path from "node:path";

const [, , srcPath, outPath] = process.argv;

if (!srcPath || !outPath) {
  console.error("用法: node tools/prepare-font.mjs <源字体.ttf> <输出.woff2>");
  process.exit(1);
}

if (!fs.existsSync(srcPath)) {
  console.error("源字体不存在:", srcPath);
  process.exit(1);
}

const raw = fs.readFileSync(srcPath);
console.log("源字体:", srcPath);
console.log("原始大小:", (raw.length / 1024 / 1024).toFixed(2), "MB");

// 尝试用 wawoff2 / fonttools 做真实压缩；没有就提示手动步骤
let compressed = null;
try {
  const wawoff2 = await import("wawoff2");
  const ttfBuf = raw.subarray(0, raw.length);
  const woff2Buf = await wawoff2.compress(ttfBuf);
  compressed = Buffer.from(woff2Buf);
} catch (e) {
  console.log("");
  console.log("未安装 wawoff2，无法自动压缩。两种解法：");
  console.log("");
  console.log("【方案 A】装压缩依赖后重跑：");
  console.log("  npm i -D wawoff2");
  console.log("  node tools/prepare-font.mjs \"" + srcPath + "\" \"" + outPath + "\"");
  console.log("");
  console.log("【方案 B】直接用现成的网络字体（推荐，0 依赖）：");
  console.log("  https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.3.1/files/noto-sans-sc-chinese-simplified-400-normal.woff2");
  console.log("  把这个 URL 填到 wrangler.toml 的 FONT_URL 即可。");
  process.exit(2);
}

fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
fs.writeFileSync(outPath, compressed);
console.log("输出:", outPath);
console.log("压缩后:", (compressed.length / 1024 / 1024).toFixed(2), "MB");
console.log("");
console.log("下一步：把这个文件传到可访问的地址，然后填到 wrangler.toml 的 FONT_URL");

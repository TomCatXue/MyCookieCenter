#!/usr/bin/env node
/**
 * 自动同步 loon/*.plugin 中本仓库脚本地址的 ?v= 缓存参数。
 *
 * 版本号 = 对应脚本内容 SHA-256 的前 8 位十六进制（CRLF 归一为 LF，
 * 与 raw 分发的 git blob 字节一致）。
 *
 * 用法：
 *   node tools/sync-cache-bust.mjs          # dry-run，只打印将要修改的内容
 *   node tools/sync-cache-bust.mjs --write  # 真正写回 .plugin 文件
 *
 * 只处理指向本仓库的 URL（raw.githubusercontent.com/TomCatXue/MyCookieCenter/），
 * 外部 URL 一律不碰；只重写 ?v=，其余参数与标点保持原样。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOON_DIR = path.join(ROOT, 'loon');

/** 不参与同步的插件：本地留存，.gitignore 排除，不进公开仓库 */
const SKIP_PLUGINS = ['ChinaMobileRenew.plugin'];

/** 本仓库 raw 地址前缀 */
const REPO_RAW_PREFIX = 'raw.githubusercontent.com/TomCatXue/MyCookieCenter/';

const IS_TTY = process.stdout.isTTY === true;
const paint = (code, text) => (IS_TTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (text) => paint('32', text);
const red = (text) => paint('31', text);
const yellow = (text) => paint('33', text);
const dim = (text) => paint('2', text);
const bold = (text) => paint('1', text);

const writeMode = process.argv.includes('--write');

// ---------------------------------------------------------------------------
// URL 解析（与 tools/verify.mjs 中的实现保持一致，直接复用）
// ---------------------------------------------------------------------------

/**
 * 把指向本仓库的 raw 地址转换为仓库相对路径。
 * 支持三种前缀：refs/heads/main/、main/、<40位或7位 SHA>/
 * 返回 null 表示不是本仓库地址，返回 { error } 表示无法识别的形式。
 */
function rawUrlToRepoPath(url) {
  const marker = `https://${REPO_RAW_PREFIX}`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  let rest = url.slice(index + marker.length).split('?')[0].split('#')[0];
  const segments = rest.split('/').filter(Boolean);

  if (segments[0] === 'refs' && segments[1] === 'heads') {
    rest = segments.slice(3).join('/');
  } else if (segments[0] === 'main') {
    rest = segments.slice(1).join('/');
  } else if (/^(?:[0-9a-f]{40}|[0-9a-f]{7})$/i.test(segments[0] || '')) {
    rest = segments.slice(1).join('/');
  } else {
    return { error: url };
  }

  return { relativePath: rest };
}

/**
 * 脚本 URL 匹配模式：与 tools/verify.mjs 的 extractScriptUrls 使用同一组正则。
 * 兼容 script-path=...、script("url")、script("url", {...}) 与 then script("url") with ...
 */
const SCRIPT_URL_PATTERNS = [
  /script-path\s*=\s*([^,\s]+)/g,
  /script\(\s*"([^"]+)"/g,
];

/**
 * 提取所有脚本 URL 及其在原文中的下标。
 * 按下标替换，避免「无参数 URL 是带参数 URL 的前缀」时误伤（如 a.js 与 a.js?v=old）。
 */
function collectScriptUrlMatches(content) {
  const matches = [];

  for (const pattern of SCRIPT_URL_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const url = match[1];
      const start = match.index + match[0].lastIndexOf(url);
      matches.push({ url, start, end: start + url.length });
    }
  }

  return matches.sort((left, right) => left.start - right.start);
}

// ---------------------------------------------------------------------------
// 哈希与 ?v= 重写
// ---------------------------------------------------------------------------

const hashCache = new Map();

/**
 * 脚本内容哈希：SHA-256 前 8 位。
 * CRLF 归一为 LF，避免 core.autocrlf 造成工作区与 git blob 哈希不一致。
 */
function scriptHash(relativePath) {
  if (hashCache.has(relativePath)) return hashCache.get(relativePath);

  let hash = null;
  try {
    const buffer = fs.readFileSync(path.join(ROOT, ...relativePath.split('/')));
    const normalized = buffer.toString('latin1').replace(/\r\n/g, '\n');
    hash = crypto
      .createHash('sha256')
      .update(Buffer.from(normalized, 'latin1'))
      .digest('hex')
      .slice(0, 8);
  } catch {
    hash = null;
  }

  hashCache.set(relativePath, hash);
  return hash;
}

/** 读取 URL 中已有的 ?v= 值，没有则返回 null */
function currentVersion(url) {
  const match = /[?&]v=([^&#]*)/.exec(url);
  return match ? match[1] || '' : null;
}

/**
 * 替换 / 追加 URL 的 ?v= 参数，保留其它参数、顺序与 fragment。
 * 例：
 *   .../a.js                -> .../a.js?v=abc12345
 *   .../a.js?x=1&v=old      -> .../a.js?x=1&v=abc12345
 *   .../a.js?x=1            -> .../a.js?x=1&v=abc12345
 */
function applyVersion(url, hash) {
  const fragmentIndex = url.indexOf('#');
  const base = fragmentIndex === -1 ? url : url.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : url.slice(fragmentIndex);

  const queryIndex = base.indexOf('?');
  if (queryIndex === -1) return `${base}?v=${hash}${fragment}`;

  const head = base.slice(0, queryIndex + 1);
  const query = base.slice(queryIndex + 1);
  if (!query) return `${head}v=${hash}${fragment}`;

  let replaced = false;
  const nextQuery = query
    .split('&')
    .map((pair) => {
      if (replaced) return pair;
      const equalsIndex = pair.indexOf('=');
      const key = equalsIndex === -1 ? pair : pair.slice(0, equalsIndex);
      if (key !== 'v') return pair;
      replaced = true;
      return `v=${hash}`;
    })
    .join('&');

  return replaced ? `${head}${nextQuery}${fragment}` : `${head}${query}&v=${hash}${fragment}`;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const allPlugins = fs
  .readdirSync(LOON_DIR)
  .filter((name) => name.endsWith('.plugin'))
  .sort();

const plugins = allPlugins.filter((name) => !SKIP_PLUGINS.includes(name));

const changes = [];
const unchanged = [];
const external = [];
const problems = [];
let writtenPlugins = 0;

for (const name of plugins) {
  const filePath = path.join(LOON_DIR, name);
  const original = fs.readFileSync(filePath, 'utf8');
  const urlMatches = collectScriptUrlMatches(original);
  let content = original;

  for (const urlMatch of urlMatches) {
    const url = urlMatch.url;
    const occurrences = original.split(url).length - 1;
    const resolved = rawUrlToRepoPath(url);

    if (!resolved) {
      external.push({ plugin: name, url, occurrences });
      continue;
    }
    if (resolved.error) {
      problems.push(`${name}  ${red(`无法识别的本仓库地址：${resolved.error}`)}`);
      continue;
    }

    const hash = scriptHash(resolved.relativePath);
    if (hash === null) {
      problems.push(`${name}  ${red(`脚本不存在：${resolved.relativePath}`)}`);
      continue;
    }

    const nextUrl = applyVersion(url, hash);
    if (nextUrl === url) {
      unchanged.push({ plugin: name, script: path.posix.basename(url.split('?')[0]), hash, occurrences });
      continue;
    }

    content = content.split(url).join(nextUrl);
    changes.push({
      plugin: name,
      script: path.posix.basename(url.split('?')[0]),
      from: currentVersion(url),
      to: hash,
      occurrences,
    });
  }

  if (content !== original) {
    if (writeMode) {
      fs.writeFileSync(filePath, content, 'utf8');
      writtenPlugins += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// 输出
// ---------------------------------------------------------------------------

const totalOccurrences = (list) => list.reduce((sum, item) => sum + item.occurrences, 0);
const cell = (text, width) => text + ' '.repeat(Math.max(0, width - text.length));

console.log();
if (!writeMode) console.log(yellow('DRY RUN，加 --write 才会写入'));
console.log(bold(writeMode ? '同步缓存参数（写入模式）' : '同步缓存参数（dry-run）'));
console.log(
  dim(`扫描 ${allPlugins.length} 个插件，${plugins.length} 个参与（跳过 ${SKIP_PLUGINS.length} 个：${SKIP_PLUGINS.join(', ')}）`),
);
console.log();

if (changes.length) {
  const pluginWidth = Math.max(...changes.map((item) => item.plugin.length));
  const scriptWidth = Math.max(...changes.map((item) => item.script.length));

  console.log(`更新 ${totalOccurrences(changes)} 处（${changes.length} 个脚本引用）：`);
  for (const change of changes) {
    const from = change.from === null ? '(无)' : `v=${change.from}`;
    const count = change.occurrences > 1 ? `  ×${change.occurrences}` : '';
    console.log(
      `  ${cell(change.plugin, pluginWidth)}  ${cell(change.script, scriptWidth)}  ${dim(from)} -> ${green(`v=${change.to}`)}${count}`,
    );
  }
} else {
  console.log(green('✓ 所有 ?v= 均已与脚本内容一致'));
}

console.log(`未变化 ${totalOccurrences(unchanged)} 处`);
console.log(`外部 URL 跳过 ${totalOccurrences(external)} 处（${new Set(external.map((item) => item.url)).size} 个地址）`);

if (problems.length) {
  console.log();
  for (const line of problems) console.log(red(`✗ ${line}`));
}

console.log();
if (!changes.length) {
  console.log(dim('无需写入。'));
} else if (writeMode) {
  console.log(green(`✓ 已写入 ${writtenPlugins} 个插件文件，共更新 ${totalOccurrences(changes)} 处`));
} else {
  console.log(dim(`dry-run：共 ${totalOccurrences(changes)} 处待更新，加 --write 才会写入文件。`));
}
console.log();

if (problems.length) process.exitCode = 1;

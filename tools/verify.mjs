#!/usr/bin/env node
/**
 * MyCookieCenter 仓库自动化校验
 *
 * 用法：node tools/verify.mjs
 * 全部通过退出码 0，存在失败项退出码 1（警告不计入失败）。
 * 零第三方依赖，仅使用 Node.js 内置模块。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// 常量配置（按需增删）
// ---------------------------------------------------------------------------

/** 允许不收录进公开文档的插件（.gitignore 排除、故意隐藏） */
const README_SKIP_PLUGINS = ['ChinaMobileRenew.plugin'];

/** 每个 loon/*.plugin 必须声明的头部字段 */
const REQUIRED_PLUGIN_FIELDS = ['name', 'desc', 'author', 'version', 'date', 'homepage'];

/** 本仓库 raw 地址前缀 */
const REPO_RAW_PREFIX = 'raw.githubusercontent.com/TomCatXue/MyCookieCenter/';

/** 表格显示宽度阈值（超出仅警告，不算失败） */
const TABLE_WIDTH_LIMITS = { name: 16, desc: 68 };

/** 遍历时跳过的目录 */
const IGNORED_DIRS = new Set(['node_modules', '.git', '__pycache__', '.alma', '.alma-snapshots']);

// ---------------------------------------------------------------------------
// 输出工具
// ---------------------------------------------------------------------------

const IS_TTY = process.stdout.isTTY === true;
const paint = (code, text) => (IS_TTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (text) => paint('32', text);
const red = (text) => paint('31', text);
const yellow = (text) => paint('33', text);
const dim = (text) => paint('2', text);
const cyan = (text) => paint('36', text);
const bold = (text) => paint('1', text);

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

const abs = (...parts) => path.join(ROOT, ...parts);

function readText(relativePath) {
  try {
    return fs.readFileSync(abs(relativePath), 'utf8');
  } catch {
    return null;
  }
}

function walkFiles(relativeDir, predicate) {
  const result = [];
  const start = abs(relativeDir);
  if (!fs.existsSync(start)) return result;

  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        visit(path.join(current, entry.name));
      } else if (predicate(entry.name)) {
        result.push(path.join(current, entry.name));
      }
    }
  };

  visit(start);
  return result;
}

function toRepoPath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

/** 判断某个仓库相对路径是否指向真实文件 / 目录 */
function repoPathExists(relativePath) {
  const target = abs(...relativePath.split('/'));
  return fs.existsSync(target);
}

function parsePluginHeaders(content) {
  const headers = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = /^#!([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) headers.set(match[1], match[2].trim());
  }
  return headers;
}

function listPlugins() {
  const dir = abs('loon');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.plugin'))
    .sort()
    .map((name) => ({
      name,
      relativePath: `loon/${name}`,
      content: fs.readFileSync(path.join(dir, name), 'utf8'),
    }))
    .map((plugin) => ({ ...plugin, headers: parsePluginHeaders(plugin.content) }));
}

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

/** 提取插件里所有脚本 URL：script-path=... 与 script("...") */
function extractScriptUrls(content) {
  const urls = [];
  const patterns = [
    /script-path\s*=\s*([^,\s]+)/g,
    // 兼容 script("url")、script("url", {...}) 与 then script("url") with ...
    /script\(\s*"([^"]+)"/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) urls.push(match[1]);
  }
  return [...new Set(urls)];
}

/** 提取插件里所有 img_url 引用（兼容带引号与不带引号两种写法） */
function extractImageUrls(content) {
  const urls = [];
  for (const match of content.matchAll(/img_url\s*=\s*(?:"([^"]+)"|([^\s,]+))/g)) {
    urls.push(match[1] || match[2]);
  }
  return [...new Set(urls)];
}

/** 显示宽度：CJK / 全角按 2，其余按 1；忽略 HTML 标签、Markdown 强调标记，&nbsp; 记 1 */
function displayWidth(input) {
  const text = input
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\*\*|__|`/g, '');

  let width = 0;
  for (const char of text) {
    width += isWideCodePoint(char.codePointAt(0)) ? 2 : 1;
  }
  return width;
}

function isWideCodePoint(codePoint) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2fffd) ||
    (codePoint >= 0x30000 && codePoint <= 0x3fffd)
  );
}

// ---------------------------------------------------------------------------
// 各项检查
// ---------------------------------------------------------------------------

function checkJsSyntax() {
  const files = ['scripts', 'ql_script', 'tools']
    .flatMap((dir) => walkFiles(dir, (name) => name.endsWith('.js')))
    .sort();
  const failures = [];

  for (const file of files) {
    // 仓库 package.json 声明了 "type": "module"，但大部分业务脚本是为 Loon /
    // 青龙等运行时编写的 CommonJS 风格脚本（存在顶层 return），而 pixiv worker
    // 等少数文件是真正的 ES Module。逐个按两种模式尝试，任一通过即视为语法正确。
    const source = fs.readFileSync(file, 'utf8');
    let lastError = '';

    const passed = ['commonjs', 'module'].some((inputType) => {
      const result = spawnSync(
        process.execPath,
        [`--input-type=${inputType}`, '--check', '-'],
        { encoding: 'utf8', input: source },
      );
      if (result.status === 0) return true;
      lastError = (result.stderr || result.stdout || '')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');
      return false;
    });

    if (!passed) failures.push(`${toRepoPath(file)}  ${lastError}`);
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `${files.length} 个文件`,
    details: failures.map((line) => red(line)),
  };
}

/** 记录当前 __pycache__ 目录与其内 .pyc 文件，用于精确清理本次产生的缓存 */
function snapshotBytecode() {
  const dirs = new Set();
  const files = new Set();
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(current, entry.name);
      if (entry.name === '__pycache__') {
        dirs.add(full);
        for (const cached of fs.readdirSync(full)) files.add(path.join(full, cached));
        continue;
      }
      visit(full);
    }
  };
  visit(ROOT);
  return { dirs, files };
}

function cleanupNewBytecode(before) {
  const removed = [];
  const now = snapshotBytecode();

  // 本次新建的 __pycache__ 目录整体删除
  for (const dir of now.dirs) {
    if (before.dirs.has(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    removed.push(toRepoPath(dir));
  }

  // 已存在的 __pycache__ 目录里，只删除本次新增的 .pyc
  for (const file of now.files) {
    if (before.files.has(file) || !fs.existsSync(file)) continue;
    fs.rmSync(file, { force: true });
    removed.push(toRepoPath(file));
  }

  return removed;
}

function checkPythonSyntax() {
  const files = ['scripts', 'ql_script']
    .flatMap((dir) => walkFiles(dir, (name) => name.endsWith('.py')))
    .sort();
  const failures = [];

  const before = snapshotBytecode();
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

  for (const file of files) {
    const result = spawnSync(python, ['-m', 'py_compile', file], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    if (result.error) {
      failures.push(`无法执行 ${python}: ${result.error.message}`);
      break;
    }
    if (result.status !== 0) {
      const message = (result.stderr || result.stdout || '')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');
      failures.push(`${toRepoPath(file)}  ${message}`);
    }
  }

  const cleaned = cleanupNewBytecode(before);

  const details = failures.map((line) => red(line));
  if (cleaned.length) details.push(dim(`已清理本次产生的缓存：${cleaned.join(', ')}`));

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `${files.length} 个文件`,
    details,
  };
}

function checkPluginReferences(plugins) {
  const failures = [];

  for (const plugin of plugins) {
    const references = [
      ...extractScriptUrls(plugin.content).map((url) => ({ url, kind: 'script' })),
      ...extractImageUrls(plugin.content).map((url) => ({ url, kind: 'image' })),
    ];

    for (const { url, kind } of references) {
      const resolved = rawUrlToRepoPath(url);
      if (!resolved) continue;

      if (resolved.error) {
        failures.push(
          `${plugin.name}  ${kind} 地址无法识别前缀：${red(resolved.error)}`,
        );
        continue;
      }

      if (!resolved.relativePath) {
        failures.push(`${plugin.name}  ${kind} 地址缺少文件路径：${red(url)}`);
        continue;
      }

      if (!repoPathExists(resolved.relativePath)) {
        failures.push(
          `${plugin.name}  ${kind} 引用不存在：${resolved.relativePath}  ${dim(url)}`,
        );
      }
    }
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `${plugins.length} 个插件`,
    details: failures.map((line) => red(line)),
  };
}

function checkCacheBusting(plugins) {
  const failures = [];
  let checked = 0;

  for (const plugin of plugins) {
    for (const url of extractScriptUrls(plugin.content)) {
      const resolved = rawUrlToRepoPath(url);
      if (!resolved || resolved.error) continue;
      checked += 1;
      if (!/[?&]v=/.test(url)) {
        failures.push(`${plugin.name}  缺少 ?v= 缓存参数：${url}`);
      }
    }
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `检查了 ${checked} 个本仓库脚本地址`,
    details: failures.map((line) => red(line)),
  };
}

function checkPluginMetadata(plugins) {
  const failures = [];

  for (const plugin of plugins) {
    const missing = REQUIRED_PLUGIN_FIELDS.filter((field) => !plugin.headers.get(field));
    if (missing.length) {
      failures.push(`${plugin.name}  缺少：${missing.map((field) => `#!${field}`).join(', ')}`);
    }
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `${plugins.length} 个插件`,
    details: failures.map((line) => red(line)),
  };
}

/** 解析 loon/README.md 中的插件版本声明 */
function parseDocVersions(content) {
  const entries = [];
  const lines = content.split(/\r?\n/);
  const pattern = /\[([^\]]+)\]\(\.\/([^)\s]+\.plugin)\)(?:\s*\(\s*v?([0-9][^)\s]*)\s*\))?/;

  lines.forEach((line, index) => {
    const match = pattern.exec(line);
    if (!match) return;
    entries.push({
      line: index + 1,
      plugin: match[2],
      docVersion: match[3] || null,
      raw: line,
    });
  });

  return entries;
}

function checkDocVersions(plugins) {
  const content = readText('loon/README.md');
  if (content === null) {
    return { status: 'fail', summary: '缺少 loon/README.md', details: [] };
  }

  const actual = new Map(plugins.map((plugin) => [plugin.name, plugin.headers.get('version') || null]));
  const mismatches = [];
  const unversioned = [];

  for (const entry of parseDocVersions(content)) {
    const realVersion = actual.get(entry.plugin);
    if (!realVersion) continue; // 交给元数据检查报告

    if (!entry.docVersion) {
      unversioned.push(`${entry.plugin}  实际 v${realVersion}（文档第 ${entry.line} 行）`);
    } else if (entry.docVersion !== realVersion) {
      mismatches.push(`${entry.plugin}  文档 ${entry.docVersion} / 实际 ${realVersion}`);
    }
  }

  const details = [
    ...mismatches.map((line) => red(`✗ ${line}`)),
    ...unversioned.map((line) => yellow(`未标版本：${line}`)),
  ];

  return {
    status: mismatches.length ? 'fail' : 'pass',
    summary: `${mismatches.length} 处不一致，${unversioned.length} 个未标版本`,
    details,
  };
}

function checkPluginsInReadme(plugins) {
  const docs = [readText('README.md') || '', readText('loon/README.md') || ''].join('\n');
  const failures = [];

  for (const plugin of plugins) {
    if (README_SKIP_PLUGINS.includes(plugin.name)) continue;
    if (!docs.includes(plugin.name)) failures.push(`${plugin.name}  未出现在 README.md 或 loon/README.md`);
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `${plugins.length} 个插件（白名单跳过 ${README_SKIP_PLUGINS.length} 个）`,
    details: failures.map((line) => red(line)),
  };
}

function collectRelativeLinks(content) {
  const links = [];
  for (const match of content.matchAll(/\]\(\.\/([^)]+)\)/g)) links.push(match[1]);
  for (const match of content.matchAll(/href="\.\/([^"]+)"/g)) links.push(match[1]);
  return links;
}

function checkDeadLinks() {
  const docs = ['README.md', 'loon/README.md'];
  const failures = [];

  for (const doc of docs) {
    const content = readText(doc);
    if (content === null) {
      failures.push(`${doc}  文件不存在`);
      continue;
    }

    const baseDir = path.posix.dirname(doc);
    for (const rawLink of collectRelativeLinks(content)) {
      const cleaned = rawLink.split('#')[0].split('?')[0];
      if (!cleaned || /^https?:\/\//i.test(cleaned)) continue;

      const target = path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, cleaned));
      if (!repoPathExists(target)) failures.push(`${doc}  →  ${cleaned}（解析为 ${target}）`);
    }
  }

  return {
    status: failures.length ? 'fail' : 'pass',
    summary: `扫描 ${docs.length} 个文档`,
    details: failures.map((line) => red(line)),
  };
}

function findPluginTable(lines) {
  const headerIndex = lines.findIndex((line) => {
    const cells = splitTableRow(line);
    return cells.includes('名称') && cells.includes('功能');
  });
  if (headerIndex === -1) return null;

  const rows = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim().startsWith('|')) break;
    rows.push({ line: index + 1, cells: splitTableRow(line) });
  }

  return { header: splitTableRow(lines[headerIndex]), rows };
}

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function checkTableWidth() {
  const content = readText('README.md');
  if (content === null) return { status: 'fail', summary: '缺少 README.md', details: [] };

  const lines = content.split(/\r?\n/);
  const table = findPluginTable(lines);
  if (!table) return { status: 'fail', summary: '未找到插件表格', details: [] };

  const nameIndex = table.header.indexOf('名称');
  const descIndex = table.header.indexOf('功能');
  const overflow = [];
  const maxima = { name: { width: 0, label: '' }, desc: { width: 0, label: '' } };

  for (const row of table.rows) {
    const name = row.cells[nameIndex] || '';
    const desc = row.cells[descIndex] || '';
    const nameWidth = displayWidth(name);
    const descWidth = displayWidth(desc);
    const label = name.replace(/\*\*|__|`/g, '').replace(/<[^>]*>/g, '').trim();

    if (nameWidth > maxima.name.width) maxima.name = { width: nameWidth, label };
    if (descWidth > maxima.desc.width) maxima.desc = { width: descWidth, label };

    if (nameWidth > TABLE_WIDTH_LIMITS.name) {
      overflow.push(`第 ${row.line} 行「${label}」名称列 ${nameWidth} > ${TABLE_WIDTH_LIMITS.name}`);
    }
    if (descWidth > TABLE_WIDTH_LIMITS.desc) {
      overflow.push(`第 ${row.line} 行「${label}」功能列 ${descWidth} > ${TABLE_WIDTH_LIMITS.desc}`);
    }
  }

  const summary =
    `名称列最大 ${maxima.name.width}（「${maxima.name.label}」，阈值 ${TABLE_WIDTH_LIMITS.name}），` +
    `功能列最大 ${maxima.desc.width}（「${maxima.desc.label}」，阈值 ${TABLE_WIDTH_LIMITS.desc}）`;

  return {
    status: overflow.length ? 'warn' : 'pass',
    summary,
    details: overflow.map((line) => yellow(line)),
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const checks = [
  { name: 'JS 语法', run: checkJsSyntax },
  { name: 'Python 语法', run: checkPythonSyntax },
  { name: '插件脚本引用完整性', run: () => checkPluginReferences(pluginList) },
  { name: '缓存参数 ?v=', run: () => checkCacheBusting(pluginList) },
  { name: '插件元数据', run: () => checkPluginMetadata(pluginList) },
  { name: '文档版本号一致性', run: () => checkDocVersions(pluginList) },
  { name: '插件在 README 中被收录', run: () => checkPluginsInReadme(pluginList) },
  { name: '文档死链', run: checkDeadLinks },
  { name: '表格宽度', run: checkTableWidth },
];

const pluginList = listPlugins();

console.log();
console.log(bold(cyan('MyCookieCenter 仓库校验')));
console.log(dim(`仓库根目录：${ROOT}`));
console.log();

const results = [];
for (const check of checks) {
  let result;
  try {
    result = check.run();
  } catch (error) {
    result = { status: 'fail', summary: '检查执行异常', details: [red(error.stack || String(error))] };
  }
  results.push({ ...check, ...result });

  const icon =
    result.status === 'pass' ? green('✓') : result.status === 'warn' ? yellow('⚠') : red('✗');
  const title = result.status === 'fail' ? red(check.name) : check.name;
  console.log(`${icon} ${title}  ${dim('—')} ${result.summary}`);
  for (const line of new Set(result.details || [])) console.log(`    ${line}`);
}

const failed = results.filter((result) => result.status === 'fail').length;
const warned = results.filter((result) => result.status === 'warn').length;

console.log();
const summaryParts = [`${results.length} checks`, `${failed} failed`];
if (warned) summaryParts.push(`${warned} warned`);
const summaryText = summaryParts.join(', ');
console.log(failed ? red(bold(summaryText)) : green(bold(summaryText)));
console.log();

process.exitCode = failed ? 1 : 0;

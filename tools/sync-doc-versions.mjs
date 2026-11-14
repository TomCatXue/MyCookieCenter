#!/usr/bin/env node
/**
 * 同步 loon/README.md 中声明的插件版本号。
 *
 * 用法：
 *   node tools/sync-doc-versions.mjs          # dry-run，只打印将要修改的内容
 *   node tools/sync-doc-versions.mjs --write  # 真正写回 loon/README.md
 *
 * 规则：
 *   - 文档写了 (vX.Y.Z) 且与插件 #!version 不一致 → 替换为实际版本
 *   - 文档没写版本 → 在链接闭合的 ) 之后补标 (v实际版本)
 *
 * 仅处理 loon/README.md 中以 | 开头的表格行，且只识别指向 loon/*.plugin 的
 * 相对链接（[**Name.plugin**](./Name.plugin) 与 [`Name.plugin`](./Name.plugin)
 * 两种写法均支持），不会误碰其它文件或表格之外的内容。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'loon', 'README.md');
const LOON_DIR = path.join(ROOT, 'loon');

const IS_TTY = process.stdout.isTTY === true;
const paint = (code, text) => (IS_TTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (text) => paint('32', text);
const yellow = (text) => paint('33', text);
const dim = (text) => paint('2', text);
const bold = (text) => paint('1', text);

const writeMode = process.argv.includes('--write');

function readPluginVersions() {
  const versions = new Map();
  for (const name of fs.readdirSync(LOON_DIR)) {
    if (!name.endsWith('.plugin')) continue;
    const content = fs.readFileSync(path.join(LOON_DIR, name), 'utf8');
    const match = /^#!version\s*=\s*(.+)$/m.exec(content);
    versions.set(name, match ? match[1].trim() : null);
  }
  return versions;
}

const pluginVersions = readPluginVersions();
const original = fs.readFileSync(README, 'utf8');

const changes = [];
const additions = [];
const missingPlugins = [];

/** 只匹配表格行里的 `./Xxx.plugin` 相对链接，以及紧随其后的可选版本括号 */
const linkPattern = /\[([^\]]+)\]\(\.\/([^)\s]+\.plugin)\)(\s*\(\s*v?([0-9][^)\s]*)\s*\))?/g;

/** 表格行判定：允许行首有缩进，但必须以 | 开头 */
const isTableRow = (line) => /^\s*\|/.test(line);

const updated = original
  .split(/\r?\n/)
  .map((line) => {
    // 只改表格行，正文与代码块原样保留
    if (!isTableRow(line)) return line;

    return line.replace(linkPattern, (whole, _label, pluginName, versionPart, docVersion) => {
      const realVersion = pluginVersions.get(pluginName);

      if (!pluginVersions.has(pluginName)) {
        missingPlugins.push(pluginName);
        return whole;
      }
      if (!realVersion) return whole;

      // 已有版本号且一致：幂等，原样返回
      if (docVersion === realVersion) return whole;

      // 缺版本号：在链接闭合的 ) 之后补标（whole 本身以 ) 结尾）
      if (!docVersion) {
        additions.push({ pluginName, realVersion });
        return `${whole} (v${realVersion})`;
      }

      changes.push({ pluginName, from: docVersion, to: realVersion });
      return whole.replace(versionPart, ` (v${realVersion})`);
    });
  })
  .join('\n');

console.log();
console.log(bold(writeMode ? '同步文档版本号（写入模式）' : '同步文档版本号（dry-run）'));
console.log(dim(README));
console.log();

if (changes.length === 0 && additions.length === 0) {
  console.log(green('✓ 所有已标注的版本号均与插件一致'));
} else {
  for (const change of changes) {
    console.log(`${green('~')} ${change.pluginName}  v${change.from} -> v${change.to}`);
  }
  for (const addition of additions) {
    console.log(`${green('+')} ${addition.pluginName}  补标 v${addition.realVersion}`);
  }
}

if (missingPlugins.length) {
  console.log();
  for (const pluginName of new Set(missingPlugins)) {
    console.log(yellow(`文档引用了不存在的插件：${pluginName}`));
  }
}

console.log();

const totalChanges = changes.length + additions.length;

if (totalChanges === 0) {
  console.log(dim('无需写入。'));
} else if (writeMode) {
  fs.writeFileSync(README, updated, 'utf8');
  console.log(green(`✓ 已写入 loon/README.md，共更新 ${totalChanges} 处`));
} else {
  console.log(dim(`dry-run：共 ${totalChanges} 处待更新，加 --write 才会写入文件。`));
}

console.log();

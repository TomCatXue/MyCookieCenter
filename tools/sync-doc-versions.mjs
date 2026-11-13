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
 *   - 文档没写版本 → 不自动添加，只提示“建议补标版本”
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
const unversioned = [];
const missingPlugins = [];

const linkPattern = /\[([^\]]+)\]\(\.\/([^)\s]+\.plugin)\)(\s*\(\s*v?([0-9][^)\s]*)\s*\))?/g;

const updated = original
  .split(/\r?\n/)
  .map((line) => {
    return line.replace(linkPattern, (whole, _label, pluginName, versionPart, docVersion) => {
      const realVersion = pluginVersions.get(pluginName);

      if (!pluginVersions.has(pluginName)) {
        missingPlugins.push(pluginName);
        return whole;
      }
      if (!realVersion) return whole;

      if (!docVersion) {
        unversioned.push({ pluginName, realVersion });
        return whole;
      }
      if (docVersion === realVersion) return whole;

      changes.push({ pluginName, from: docVersion, to: realVersion });
      return whole.replace(versionPart, ` (v${realVersion})`);
    });
  })
  .join('\n');

console.log();
console.log(bold(writeMode ? '同步文档版本号（写入模式）' : '同步文档版本号（dry-run）'));
console.log(dim(README));
console.log();

if (changes.length === 0) {
  console.log(green('✓ 所有已标注的版本号均与插件一致'));
} else {
  for (const change of changes) {
    console.log(`${green('~')} ${change.pluginName}  v${change.from} -> v${change.to}`);
  }
}

if (unversioned.length) {
  console.log();
  for (const item of unversioned) {
    console.log(yellow(`建议补标版本：${item.pluginName}（实际 v${item.realVersion}）`));
  }
}

if (missingPlugins.length) {
  console.log();
  for (const pluginName of new Set(missingPlugins)) {
    console.log(yellow(`文档引用了不存在的插件：${pluginName}`));
  }
}

console.log();

if (changes.length === 0) {
  console.log(dim('无需写入。'));
} else if (writeMode) {
  fs.writeFileSync(README, updated, 'utf8');
  console.log(green(`✓ 已写入 loon/README.md，共更新 ${changes.length} 处`));
} else {
  console.log(dim(`dry-run：共 ${changes.length} 处待更新，加 --write 才会写入文件。`));
}

console.log();

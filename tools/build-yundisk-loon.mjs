#!/usr/bin/env node
/**
 * 把 scripts/tools/yundisk/ydyp.loon.js 内联生成两个 Loon 入口脚本。
 *
 * Loon 不支持模块加载，入口脚本必须自包含；为避免手改产生三份分叉，
 * 以 ydyp.loon.js 为唯一源文件，生成时只替换入口模式标记。
 *
 * 用法：
 *   node tools/build-yundisk-loon.mjs          # dry-run，只打印结果
 *   node tools/build-yundisk-loon.mjs --write  # 写回两个入口脚本
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_REL = 'scripts/tools/yundisk/ydyp.loon.js';
const MARKER = /^const ENTRY_MODE = ''; \/\/ entry-mode$/m;

const TARGETS = [
  { relative: 'scripts/tools/yundisk/yundisk.sign.js', mode: 'sign' },
  { relative: 'scripts/tools/yundisk/yundisk.exchange.js', mode: 'exchange' },
];

const writeMode = process.argv.includes('--write');
const source = fs.readFileSync(path.join(ROOT, ...SOURCE_REL.split('/')), 'utf8');

if (!MARKER.test(source)) {
  console.error(`✗ 未在 ${SOURCE_REL} 中找到入口模式标记`);
  process.exit(1);
}

for (const target of TARGETS) {
  const banner = [
    '/**',
    ' * 自动生成文件，请勿手动修改。',
    ` * 源文件：${SOURCE_REL}`,
    ` * 入口模式：${target.mode}`,
    ' * 重新生成：node tools/build-yundisk-loon.mjs --write',
    ' */',
    '',
  ].join('\n');

  const content = banner + source.replace(MARKER, `const ENTRY_MODE = '${target.mode}'; // entry-mode`);
  const absolute = path.join(ROOT, ...target.relative.split('/'));
  const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;

  if (current === content) {
    console.log(`✓ ${target.relative} 已是最新（${target.mode}）`);
    continue;
  }

  console.log(`${writeMode ? '写入' : '待写入'} ${target.relative} → ${target.mode}（${content.length} 字节）`);
  if (writeMode) fs.writeFileSync(absolute, content, 'utf8');
}

if (!writeMode) console.log('\nDRY RUN，加 --write 才会写入');

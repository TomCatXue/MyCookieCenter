# 示例模板（复制改造用）

> 本目录是新增脚本的起点模板。复制 `example.js` 为 `<脚本名>.js` 后，全局替换所有 `<...>` 占位符即可。

## 改造步骤

1. 复制目录：`app/example/` → `app/<脚本名>/`
2. 重命名脚本：`example.js` → `<脚本名>.js`（全小写英文，无空格/下划线/连字符）
3. 全局替换占位符：

   | 占位符 | 替换为 |
   |---|---|
   | `<显示名>` | 用户熟悉的中文名（4 字以内，如「有品」） |
   | `<脚本名>` | 小写英文标识，与目录/文件名一致 |
   | `<域名>` | MITM hostname（如 `api.xxx.com`） |
   | `<重写正则>` | 抓 Cookie 的 URL 匹配正则 |
   | `<关键字段>` | Cookie 必含的字段名（如 `token`） |
   | `<owner>/<repo>` | 实际 GitHub 仓库地址 |

4. 替换 `main()` 里的签到接口 URL 与成功判断逻辑
5. 写 README（复制根目录 `CONTRIBUTING.md` 里的模板）
6. 在 `app/README.md` 的脚本清单追加一行

## 详细规范

见仓库根目录 [`CONTRIBUTING.md`](../../CONTRIBUTING.md)。

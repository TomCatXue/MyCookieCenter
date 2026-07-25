# 添加一个新 App

本文介绍如何为 MyCookieCenter 接入一个新的 App（抓 Cookie + 自动签到）。
项目采用 **"一脚本一文件夹"** 范式，接入只需新建 1 个子目录。

## 总览

接入一个 App 需要改动 **1 个目录 + 2 处索引**：

1. `app/<脚本名>/<脚本名>.js` —— 新建脚本（抓 Cookie + 签到合一）
2. `app/<脚本名>/README.md` —— 该脚本的详细文档
3. `app/README.md` —— 在脚本清单表格追加一行
4. （可选）`loon/CookieCenter.plugin`、`boxjs/CookieCenter.boxjs.json` 汇总配置

---

## 第 1 步：抓包定位接口

先抓包确认：

- **抓 Cookie 的接口**：登录后该 App 必会请求、且请求头携带完整 Cookie 的接口。
- **签到接口**：点击「签到」按钮时调用的接口（URL + 方法 + 参数）。

详见 [capture.md](capture.md)。

## 第 2 步：复制模板目录

```bash
cp -r app/example app/myapp
mv app/myapp/example.js app/myapp/myapp.js
```

## 第 3 步：改脚本

打开 `app/myapp/myapp.js`，全局替换占位符：

| 占位符 | 替换为 |
|---|---|
| `<显示名>` | 用户熟悉的中文名（如「我的App」） |
| `<脚本名>` | `myapp`（与目录/文件名一致） |
| `<域名>` | MITM hostname |
| `<重写正则>` | 抓 Cookie 的 URL 匹配正则 |
| `<关键字段>` | Cookie 必含的字段名 |
| `<owner>/<repo>` | 实际 GitHub 仓库地址 |

再替换 `main()` 里的签到接口 URL 与成功判断。

## 第 4 步：写 README

复制根目录 [`CONTRIBUTING.md`](../CONTRIBUTING.md) 里的 README 模板，填入四平台配置与 BoxJS 参数。

## 第 5 步：更新索引

在 `app/README.md` 的脚本清单表格追加：

| [`myapp/`](./myapp/) | 我的App - 每日签到 | 🧪 待验证 |

## 第 6 步：（可选）汇总配置

- 在 `loon/CookieCenter.plugin` 的 `[MITM]` 与 `[Script]` 追加该 App 规则
- 在 `boxjs/CookieCenter.boxjs.json` 的 `settings` 追加 `myapp_data` / `myapp_clear` 项

## ✅ 验证

1. 在代理工具中触发一次该 App 的请求，应收到 `✅ <显示名> Cookie 获取成功` 通知。
2. 手动触发该脚本 cron，应返回签到成功。

## 详细规范

见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)。

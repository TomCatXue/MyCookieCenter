# 🍪 MyCookieCenter

多平台 App 签到 & Cookie 管理脚本合集 · Loon / Surge / Quantumult X / Stash

> 一处抓取，多处使用：单文件脚本同时承担「抓 Cookie」与「cron 签到」，内联 Env 类跨平台运行。

---

## 📂 目录

| 目录 | 内容 | 索引 |
|---|---|---|
| [`app/`](./app/) | 原生 App 签到、自动化脚本 | [查看](./app/README.md) |
| [`loon/`](./loon/) | Loon 专用 `.plugin` 汇总 | — |
| [`boxjs/`](./boxjs/) | BoxJS 面板配置 | — |
| [`docs/`](./docs/) | 通用文档（抓包、接入指南） | — |

---

## 🚀 通用引用方式

所有脚本均通过 GitHub Raw URL 引用，格式：

```
https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js
```

> 仓库地址待定，使用前请全局替换 `<owner>/<repo>` 为实际地址。

具体每个脚本的重写规则与 cron 配置，请进入对应子目录的 README 查看。

---

## 🧩 已支持的 App

| App | 脚本 | 状态 |
|---|---|---|
| 哔哩哔哩 | [`app/bilibili/`](./app/bilibili/) | 🧪 待验证 |
| 微博 | [`app/weibo/`](./app/weibo/) | 🧪 待验证 |
| WPS | [`app/wps/`](./app/wps/) | 🧪 待验证 |
| 示例模板 | [`app/example/`](./app/example/) | 🔜 计划中 |

---

## 🤝 贡献规范

新增脚本请遵循 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 中的"一脚本一文件夹"规范。
里面提供了完整的脚本 README 模板，直接复制填空即可。

---

## ⚠️ 免责声明

详见 [`DISCLAIMER.md`](./DISCLAIMER.md)。

简言之：本仓库脚本仅供学习研究使用，使用者需自行评估风险并承担全部责任。

---

## 📄 License

[MIT](./LICENSE)

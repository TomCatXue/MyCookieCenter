# MyCookieCenter

多平台 App 签到 & Cookie 管理 / 特殊功能插件合集，适配 Loon / Surge / Quantumult X / Stash。

> **一键抓取，多处使用**：单文件脚本同时承担 Cookie 捕获与 cron 签到，内联 Env 类跨平台运行。

---

## 目录结构

```
MyCookieCenter/
├── app/         # App 签到 / 羊毛脚本（抓 Cookie + cron 签到）
├── plugins/     # 解锁会员 / 特殊功能脚本（请求净化、响应改写等）
├── loon/        # Loon 专用 .plugin 插件（签到聚合 + 独立功能）
├── boxjs/       # BoxJS 面板订阅（仅签到体系配置）
├── docs/        # 通用文档（抓包、接入指南）
└── icons/       # 图标资源
```

| 目录 | 内容 | 索引 |
|---|---|---|
| [`app/`](./app/) | 原生 App 签到、羊毛脚本（抓 Cookie + cron） | [查看](./app/README.md) |
| [`plugins/`](./plugins/) | 解锁会员、特殊功能脚本（首页净化、响应改写等） | [查看](./plugins/README.md) |
| [`loon/`](./loon/) | 所有 Loon `.plugin` 插件文件 | [查看](./loon/README.md) |
| [`boxjs/`](./boxjs/) | BoxJS 面板订阅文件（仅签到体系） | [查看](./boxjs/README.md) |
| [`docs/`](./docs/) | 通用文档（抓包、接入指南） | - |

### 分类说明

| 体系 | 目录 | 特点 |
|---|---|---|
| **签到体系** | `app/` + `loon/CookieCenter.plugin`(抓Cookie) + `boxjs/`(签到cron) | 抓 Cookie + cron 定时签到，需持久化 |
| **功能插件** | `plugins/` + `loon/*.plugin`（独立） | 无状态请求/响应改写，实时生效，独立开关 |

---

## 通用引用方式

所有脚本均通过 GitHub Raw URL 引用：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/<目录>/<脚本名>/<脚本名>.js
```

具体脚本的重写规则和 cron 配置，请查看对应子目录的 README。

---

## 已支持的 App 签到

| App | 脚本 | 状态 |
|---|---|---|
| 哔哩哔哩 | [`app/bilibili/`](./app/bilibili/) | 🧪 待验证 |
| 示例模板 | [`app/example/`](./app/example/) | 💎 规划中 |

## 特殊功能插件

| 插件 | 功能 | 状态 |
|---|---|---|
| 初见哔哩净化 | Web端剥离整条Cookie/App端删除账号字段+保留设备指纹，破信息茧房 | 🧪 待验证 |
| QQ空间·清净 | 广告退散，空间清净 | ✅ 已验证 |
| 微信读书·优雅收录 | 轻触订阅人数，好书即刻入架 | ✅ 已验证 |

---

## 贡献规范

新增脚本请遵循 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 中的"一脚本一文件"规范。

---

## 免责声明

详见 [`DISCLAIMER.md`](./DISCLAIMER.md)。

本仓库脚本仅供学习研究使用，使用者需自行评估风险并承担责任。

---

## License

[MIT](./LICENSE)

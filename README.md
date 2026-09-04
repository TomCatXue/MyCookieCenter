# MyCookieCenter

多平台 App 签到 & Cookie 管理 / 特殊功能插件合集，适配 Loon / Surge / Quantumult X / Stash。

> **一键抓取，多处使用**：单文件脚本同时承担 Cookie 捕获与 cron 签到，内联 Env 类跨平台运行。

---

## 目录结构

```
MyCookieCenter/
├── app/         # App 签到 / 羊毛脚本（抓 Cookie + cron 签到）
├── plugins/     # CookieCenter 受管脚本 + 独立功能脚本
├── loon/        # Loon 专用 .plugin 插件（CookieCenter + 独立功能）
├── boxjs/       # BoxJS 面板订阅（签到 / 权益体系）
├── docs/        # 通用文档（抓包、接入指南）
└── icons/       # 图标资源
```

| 目录 | 内容 | 索引 |
|---|---|---|
| [`app/`](./app/) | 原生 App 签到、羊毛脚本（抓 Cookie + cron） | [查看](./app/README.md) |
| [`plugins/`](./plugins/) | CookieCenter 受管脚本 + 独立功能脚本 | [查看](./plugins/README.md) |
| [`loon/`](./loon/) | 所有 Loon `.plugin` 插件文件 | [查看](./loon/README.md) |
| [`boxjs/`](./boxjs/) | BoxJS 面板订阅文件（签到 / 权益体系） | [查看](./boxjs/README.md) |
| [`docs/`](./docs/) | 通用文档（抓包、接入指南） | [查看](#通用文档) |

### 分类说明

| 体系 | 目录 | 特点 |
|---|---|---|
| **签到 / 权益体系** | `loon/CookieCenter.plugin`(抓 Cookie + cron) + `boxjs/`(BoxJS 面板) | 脚本位于 `app/weread_claim/`、`plugins/sx_ai_benefit/`、`plugins/bestpay_coin/`，需持久化 |
| **功能插件** | `plugins/` + `loon/*.plugin`（独立） | 无状态请求/响应改写，实时生效，独立开关 |

---

## 通用文档

| 文档 | 内容 |
|---|---|
| [`docs/capture.md`](./docs/capture.md) | 抓包教程：手机抓取 Cookie 与签到接口 |
| [`docs/add-app.md`](./docs/add-app.md) | 接入新 App（抓 Cookie + 自动签到） |
| [`docs/add-plugin.md`](./docs/add-plugin.md) | 新增功能插件（解锁会员 / 净化 / 改写） |

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
| 微信读书·自动领取 | [`app/weread_claim/`](./app/weread_claim/) | ✅ 已验证 |
| 示例模板 | [`app/example/`](./app/example/) | 💎 规划中 |

> 新平台接入请参考 [`docs/add-app.md`](./docs/add-app.md)。

## CookieCenter 统一管理

| App | 脚本 | Loon 入口 | BoxJS |
|---|---|--:|--:|
| 微信读书·自动领取与翻牌 | [`app/weread_claim/`](./app/weread_claim/) | [`loon/CookieCenter.plugin`](./loon/CookieCenter.plugin) | [`boxjs/CookieCenter.boxjs.json`](./boxjs/CookieCenter.boxjs.json) |
| 山西电信·体验AI领福利 | [`plugins/sx_ai_benefit/`](./plugins/sx_ai_benefit/) | [`loon/CookieCenter.plugin`](./loon/CookieCenter.plugin) | [`boxjs/CookieCenter.boxjs.json`](./boxjs/CookieCenter.boxjs.json) |
| 翼支付·权益币与绿色能量 | [`plugins/bestpay_coin/`](./plugins/bestpay_coin/) | [`loon/CookieCenter.plugin`](./loon/CookieCenter.plugin) | [`boxjs/CookieCenter.boxjs.json`](./boxjs/CookieCenter.boxjs.json) |

> 微信读书、山西电信、翼支付原先的独立插件已合并进 [`loon/CookieCenter.plugin`](./loon/CookieCenter.plugin)，安装一个插件即可同时获得凭据捕获与后台定时任务；Cookie、偏好等配置在 [`boxjs/CookieCenter.boxjs.json`](./boxjs/CookieCenter.boxjs.json) 面板管理。

## 特殊功能插件

| 插件 | 功能 | 状态 |
|---|---|---|
| [QQ空间·清净](./loon/QzoneAdBlock.plugin) | 广告退散，空间清净（纯规则型） | ✅ 已验证 |
| [哔哩哔哩·增强版 𝕏](./loon/BilibiliFix.plugin) | 空降助手 + 分区修复 + 扫码登录 + 1080P高码率解锁 | ✅ 已验证 |
| [微信读书·优雅收录](./loon/WeReadEnhance.plugin) | 轻触订阅人数，好书即刻入架 | ✅ 已验证 |
| [GitHub·星标推送时间](./loon/GitHubPushTime.plugin) | 在 GitHub App 星标列表语言后显示最近推送时间 | ✅ 已验证 |
| [Pixiv·小说翻译](./loon/PixivNovelTranslate.plugin) | 小说阅读页一键翻译，支持 Google 免费接口 / 微软 / 百度 | ✅ 已验证 |
| [扫描全能王·签到](./loon/camscanner.plugin) | 抓取 Cookie + 每日签到 | ✅ 已验证（外部依赖） |

> `扫描全能王·签到` 的脚本与图标指向外部仓库（[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)、[MaYIHEI/pin](https://github.com/MaYIHEI/pin)），本仓库仅提供 `.plugin` 入口，脚本内容不在维护范围内。

**状态徽章**：✅ 已验证（实测可用）｜ 🧪 待验证（未确认）｜ ⚠️ 待修（失效/受限）｜ 📦 已归档 ｜ 💎 规划中

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

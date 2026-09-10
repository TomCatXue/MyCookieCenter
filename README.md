<p align="center">
  <img src="icons/icon.png" width="96" alt="MyCookieCenter logo" />
</p>

<h1 align="center">MyCookieCenter</h1>

<p align="center">
  <b>多平台 App 签到 & Cookie 管理 · 特殊功能插件合集</b><br>
  适配 Loon / Surge / Quantumult X / Stash
</p>

<p align="center">
  <a href="https://github.com/TomCatXue/MyCookieCenter/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/TomCatXue/MyCookieCenter?style=flat-square" /></a>
  <a href="https://github.com/TomCatXue/MyCookieCenter/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/TomCatXue/MyCookieCenter?style=flat-square" /></a>
  <a href="./LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/TomCatXue/MyCookieCenter?style=flat-square" /></a>
  <img alt="Loon" src="https://img.shields.io/badge/Loon-22c55e?style=flat-square" />
  <img alt="Surge" src="https://img.shields.io/badge/Surge-0ea5e9?style=flat-square" />
  <img alt="Quantumult X" src="https://img.shields.io/badge/Quantumult%20X-6366f1?style=flat-square" />
  <img alt="Stash" src="https://img.shields.io/badge/Stash-8b5cf6?style=flat-square" />
</p>

<p align="center">
  <a href="#快速开始">🚀 快速开始</a> ·
  <a href="#核心特性">✨ 核心特性</a> ·
  <a href="#签到与权益体系">📆 签到与权益</a> ·
  <a href="#特殊功能插件">🧩 功能插件</a> ·
  <a href="#目录结构">🗂️ 目录结构</a> ·
  <a href="#文档">📖 文档</a> ·
  <a href="#路线图">🗺️ 路线图</a> ·
  <a href="#免责声明">⚠️ 免责声明</a>
</p>

---

## 项目简介

MyCookieCenter 是一套运行在代理工具上的自动化脚本合集，覆盖两类能力：

- **签到 / 权益体系**：抓取 App 登录凭据（Cookie / 会话），在后台定时完成签到、领福利、抢权益兑换，结果以通知推送；
- **功能插件**：无状态的请求 / 响应改写，实现会员解锁、广告净化、页面增强等实时生效的能力。

> **一句话架构**：抓取与执行彻底分离——专用 Cookie 抓取插件（`CookieCenter.plugin`）静默捕获凭据，签到脚本脱机定时执行；Cookie 持久化、偏好参数与手动运行由 BoxJS 订阅统一管理。

## 核心特性

- 📦 **抓取与执行分离** — 专用抓取插件只负责静默捕获凭据，签到单体脱机自动运行，职责单一、互不干扰
- 📋 **BoxJS 统一面板** — Cookie 持久化、偏好参数、定时任务与手动运行，一个订阅全部管理
- 🔌 **多平台适配** — 脚本内联 `Env` 类，同一份代码在 Loon / Surge / Quantumult X / Stash 上跨平台运行
- 🧩 **即插即用** — 所有 Loon 功能以 `.plugin` 发布，URL 一键导入，无需手写重写规则
- 🔒 **默认全关、按需开启** — 捕获与签到开关粒度到每个 App，抓完凭据即可关闭对应 MITM 减少干扰
- 🔔 **结果通知推送** — 签到成功 / 失败 / 凭据过期均有通知，失效时引导重新抓取
- 📚 **一脚本一文件夹** — 每个脚本独立子目录 + 独立 README，接入与贡献规范见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## 快速开始

### 前置要求

- 任一代理工具：**Loon**（推荐，本仓库 `.plugin` 均为 Loon 格式）/ Surge / Quantumult X / Stash
- **BoxJS**（可选）：用于面板配置、手动运行与任务调度

### 方式 A · 签到与权益体系（以 Loon 为例）

1. **导入抓取插件**：Loon → 插件 → 右上角「+」→ 粘贴 URL 导入：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin
   ```

2. **添加 BoxJS 订阅**：BoxJS → 添加订阅，填入：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/CookieCenter.boxjs.json
   ```

3. **捕获凭据**：确认对应 App 的总开关已开启 → 打开对应 App 触发一次登录态请求（各 App 具体操作见 [签到与权益体系](#签到与权益体系) 表格）→ 收到 `✅ Cookie 获取成功` 通知即完成
4. **验证**：在 BoxJS 面板点「运行」手动执行一次；后续签到将按 cron 自动运行，结果以通知推送

> Surge / Quantumult X / Stash 用户：脚本内置 `Env` 类跨平台运行，请按各脚本 `README.md` 中的平台配置段设置重写规则。

### 方式 B · 独立功能插件

1. 在 [特殊功能插件](#特殊功能插件) 表格中找到目标插件，复制对应 `.plugin` 的 Raw 地址
2. Loon → 插件 → 「+」→ URL 导入
3. 总开关默认关闭，在插件设置中按需打开即实时生效（无状态改写，无需 BoxJS）

> **通用 Raw URL 模板**：`https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/<目录>/<文件名>`

## 签到与权益体系

统一由 [`loon/CookieCenter.plugin`](./loon/CookieCenter.plugin) 提供入口，[`boxjs/CookieCenter.boxjs.json`](./boxjs/CookieCenter.boxjs.json) 面板统一管理：

| App | 功能 | 捕获操作 | 脚本 | 状态 |
|---|---|---|---|---|
| 📚 微信读书 · 自动领取 | 每晚 23:00 领取阅读奖励 · 周二翻牌 · 周五好书入架 | 打开微信读书浏览 / 重新登录 | [`app/weread_claim/`](./app/weread_claim/) | ✅ 已验证 |
| 📱 山西电信 · 体验AI领福利 | 凭证静默捕获 + 月度福利领取 | 电信 App 首页 AI 搜索「领福利」进入活动页 | [`plugins/sx_ai_benefit/`](./plugins/sx_ai_benefit/) | ✅ 已验证 |
| ☎️ 中国电信 · 等级权益 | 每日 0 点自动抢兑等级话费券 | 电信营业厅 App →「我」→ 签到 / 等级权益页 | [`plugins/telecom_rights/`](./plugins/telecom_rights/) | ✅ 已验证 |
| 📷 扫描全能王 · 签到 | 抓取 Cookie + 每日签到 | 打开扫描全能王 App（静默抓取） | [`plugins/camscanner/`](./plugins/camscanner/) | ✅ 已验证（外部依赖） |

> 微信读书、山西电信、电信权益原先的独立插件已合并进 `CookieCenter.plugin`，安装一个插件即可同时获得凭据捕获与后台定时任务。
> `扫描全能王 · 签到` 的签到脚本与图标指向外部仓库（[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)、[MaYIHEI/pin](https://github.com/MaYIHEI/pin)），本仓库仅维护抓取脚本与 `.plugin` 入口。

**状态图例**：✅ 已验证（实测可用）｜ 🧪 待验证（未确认）｜ ⚠️ 待修（失效 / 受限）｜ 📦 已归档 ｜ 💎 规划中

## 特殊功能插件

无状态请求 / 响应改写，实时生效、独立开关，不纳入 BoxJS：

| 插件 | 功能 | 脚本 | Loon 入口 | 状态 |
|---|---|---|---|---|
| 🚀 QQ空间 · 清净 | 广告退散，空间清净（纯规则型） | — | [`QzoneAdBlock.plugin`](./loon/QzoneAdBlock.plugin) | ✅ 已验证 |
| 📺 哔哩哔哩 · 增强版 𝕏 | 空降助手 + 分区修复 + 扫码登录 + 1080P 高码率解锁 | [`plugins/bilibili/`](./plugins/bilibili/) | [`BilibiliFix.plugin`](./loon/BilibiliFix.plugin) | ✅ 已验证 |
| 📖 微信读书 · 优雅收录 | 轻触订阅人数，好书即刻入架 | [`plugins/wxread/`](./plugins/wxread/) | [`WeReadEnhance.plugin`](./loon/WeReadEnhance.plugin) | ✅ 已验证 |
| ⭐ GitHub · 星标推送时间 | 星标列表语言后显示最近推送时间 | [`plugins/github_push_time/`](./plugins/github_push_time/) | [`GitHubPushTime.plugin`](./loon/GitHubPushTime.plugin) | ✅ 已验证 |
| 🎨 Pixiv · 小说翻译 | 小说阅读页一键翻译，支持 Google 免费 / 微软 / 百度 | [`plugins/pixiv_novel_translate/`](./plugins/pixiv_novel_translate/) | [`PixivNovelTranslate.plugin`](./loon/PixivNovelTranslate.plugin) | ✅ 已验证 |

## 目录结构

```
MyCookieCenter/
├── app/         # App 签到 / 羊毛脚本（抓 Cookie + cron 签到）
├── plugins/     # CookieCenter 受管脚本 + 独立功能脚本
├── loon/        # Loon 专用 .plugin 插件（CookieCenter + 独立功能）
├── boxjs/       # BoxJS 面板订阅（签到 / 权益体系）
├── docs/        # 通用文档（抓包、接入指南）
├── icons/       # 图标资源
└── notes/       # 开发笔记与排错手册
```

| 目录 | 内容 | 索引 |
|---|---|---|
| [`app/`](./app/) | 原生 App 签到、羊毛脚本（抓 Cookie + cron） | [查看](./app/README.md) |
| [`plugins/`](./plugins/) | CookieCenter 受管脚本 + 独立功能脚本 | [查看](./plugins/README.md) |
| [`loon/`](./loon/) | 所有 Loon `.plugin` 插件文件 | [查看](./loon/README.md) |
| [`boxjs/`](./boxjs/) | BoxJS 面板订阅文件（签到 / 权益体系） | [查看](./boxjs/README.md) |
| [`docs/`](./docs/) | 通用文档（抓包、接入指南） | [查看](#文档) |
| [`icons/`](./icons/) | 图标资源 | — |
| [`notes/`](./notes/) | 开发笔记与排错手册 | — |

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/capture.md`](./docs/capture.md) | 📱 抓包教程：手机抓取 Cookie 与签到接口 |
| [`docs/add-app.md`](./docs/add-app.md) | ➕ 接入新 App（抓 Cookie + 自动签到） |
| [`docs/add-plugin.md`](./docs/add-plugin.md) | 🧩 新增功能插件（解锁会员 / 净化 / 改写） |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | 🤝 贡献规范（「一脚本一文件夹」） |
| [`DISCLAIMER.md`](./DISCLAIMER.md) | ⚠️ 免责声明 |

## 路线图

- [x] CookieCenter 统一签到体系：抓取与执行分离 + BoxJS 面板管理
- [x] 微信读书 · 自动领取（阅读奖励 / 翻牌 / 好书入架）
- [x] 电信权益体系（山西电信 AI 领福利 + 等级权益 0 点抢兑）
- [x] 独立功能插件矩阵（Bilibili / Pixiv / GitHub / 微信读书 / QQ 空间）
- [ ] [`app/example/`](./app/example/) 示例模板完善（💎 规划中）
- [ ] 更多 App 接入 —— 欢迎贡献，流程见 [`docs/add-app.md`](./docs/add-app.md)

## 致谢

- `QQ空间 · 清净` 广告屏蔽规则源自 [zqzess/rule_for_quantumultX](https://github.com/zqzess/rule_for_quantumultX)（MIT License）
- `微信读书 · 优雅收录` 脚本基于社区脚本重构整合
- `扫描全能王 · 签到` 签到脚本与图标引用 [MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)、[MaYIHEI/pin](https://github.com/MaYIHEI/pin)
- 感谢每一位 Star / Issue / PR 的朋友 🙌

## 免责声明

本仓库脚本仅供**学习研究使用**，使用者需自行评估风险并承担全部责任。详细条款见 [`DISCLAIMER.md`](./DISCLAIMER.md)。

## License

[MIT](./LICENSE)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TomCatXue%2FMyCookieCenter&type=date)](https://www.star-history.com/#TomCatXue%2FMyCookieCenter&type=date)

如果这个项目帮到了你，欢迎点个 ⭐ Star 支持一下 · [反馈问题](https://github.com/TomCatXue/MyCookieCenter/issues)

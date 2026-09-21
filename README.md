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

### 方式 C · 青龙面板自动化（云端挂机 & 100% 脱机自愈）

在青龙面板「订阅管理」中直接添加此订阅：
```bash
ql repo https://github.com/TomCatXue/MyCookieCenter.git "ql_script" "" "README" "main"
```
- 自动识别脚本头部 Cron 定时，免去手动配置；
- 单环境变量极简设计：青龙仅需配置 `WEREAD_AUTH` 凭据，子任务开关在脚本顶部直接改 `true`/`false`；
- 内嵌脱机换票引擎，自动刷新登录态，无需频繁手动重登。

### 方式 B · 独立功能插件

1. 在 [特殊功能插件](#特殊功能插件) 表格中找到目标插件，复制对应 `.plugin` 的 Raw 地址
2. Loon → 插件 → 「+」→ URL 导入
3. 总开关默认关闭，在插件设置中按需打开即实时生效（无状态改写，无需 BoxJS）

> **通用 Raw URL 模板**：`https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/<目录>/<文件名>`

## 签到与权益体系

统一由 [`loon/CookieCenter.plugin`](./loon/CookieCenter.plugin) 提供入口，[`boxjs/CookieCenter.boxjs.json`](./boxjs/CookieCenter.boxjs.json) 面板统一管理：

| App | 功能 | 捕获操作 | 脚本 | 状态 |
|---|---|---|---|---|
| 📚 微信读书 · 自动任务 | 每日阅读领卡 + 周二翻牌 + 周五限免入架 (脱机换票) | 退出微信读书并重新登录一次 (捕获长效凭据) | [`scripts/weread/`](./scripts/weread/) | ✅ 已验证 (青龙/Loon双栖) |
| 📱 山西电信 · 体验AI领福利 | 凭证静默捕获 + 月度福利领取 | 电信 App 首页 AI 搜索「领福利」进入活动页 | [`plugins/sx_ai_benefit/`](./plugins/sx_ai_benefit/) | ✅ 已验证 |
| ☎️ 中国电信 · 全系权益中心 | 周三双抽奖 + 幸运抽奖秒领 + 0点话费秒杀 + 山西福利 | 电信5G会员小程序（进任意页秒领）/ 营业厅App（0点抢话费） | [`scripts/telecom/`](./scripts/telecom/) | ✅ 已验证 |
| 📷 扫描全能王 · 签到 | 抓取 Cookie + 每日签到 | 打开扫描全能王 App（静默抓取） | [`scripts/tools/camscanner/`](./scripts/tools/camscanner/) | ✅ 已验证（外部依赖） |

> 微信读书、山西电信、电信权益与电信会员抽奖已合并进 `CookieCenter.plugin`，安装一个插件即可同时获得凭据捕获与后台定时任务。
> `扫描全能王 · 签到` 的签到脚本与图标指向外部仓库（[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)、[MaYIHEI/pin](https://github.com/MaYIHEI/pin)），本仓库仅维护抓取脚本与 `.plugin` 入口。

**状态图例**：✅ 已验证（实测可用）｜ 🧪 待验证（未确认）｜ ⚠️ 待修（失效 / 受限）｜ 📦 已归档 ｜ 💎 规划中

## 特殊功能插件

无状态请求 / 响应改写，实时生效、独立开关，不纳入 BoxJS：

| 插件 | 功能 | 脚本 | Loon 入口 | 状态 |
|---|---|---|---|---|
| 🚀 QQ空间 · 清净 | 广告退散，空间清净（纯规则型） | — | [`QzoneAdBlock.plugin`](./loon/QzoneAdBlock.plugin) | ✅ 已验证 |
| 📺 哔哩哔哩 · 增强版 𝕏 | 空降助手 + 分区修复 + 扫码登录 + 1080P 高码率解锁 | [`scripts/tools/bilibili/`](./scripts/tools/bilibili/) | [`BilibiliFix.plugin`](./loon/BilibiliFix.plugin) | ✅ 已验证 |
| 📖 微信读书 · 防强更净化 | 屏蔽升级弹窗与强更通知，锁定老版本免费 AI 听书 | [`scripts/tools/wxread_enhance/`](./scripts/tools/wxread_enhance/) | [`WeReadEnhance.plugin`](./loon/WeReadEnhance.plugin) | ✅ 已验证 |
| ⭐ GitHub · 星标推送时间 | 星标列表语言后显示最近推送时间 | [`scripts/tools/github/`](./scripts/tools/github/) | [`GitHubPushTime.plugin`](./loon/GitHubPushTime.plugin) | ✅ 已验证 |
| 🎨 Pixiv · 小说翻译 | 小说阅读页一键翻译，支持 Google 免费 / 微软 / 百度 | [`scripts/tools/pixiv/`](./scripts/tools/pixiv/) | [`PixivNovelTranslate.plugin`](./loon/PixivNovelTranslate.plugin) | ✅ 已验证 |

## 目录结构

```text
MyCookieCenter/
├── loon/                           # Loon 插件目录 (.plugin)
│   ├── CookieCenter.plugin         # 核心一站式合集（微信读书 + 中国电信）
│   ├── BilibiliFix.plugin          # 哔哩哔哩增强版
│   ├── WeReadEnhance.plugin        # 微信读书防强更净化
│   ├── PixivNovelTranslate.plugin  # Pixiv小说阅读翻译
│   ├── QzoneAdBlock.plugin         # QQ空间广告屏蔽
│   ├── GitHubPushTime.plugin       # GitHub星标时间显示
│   └── camscanner.plugin           # 扫描全能王签到
├── boxjs/                          # BoxJS 订阅文件
│   └── CookieCenter.boxjs.json     # 微信读书 + 中国电信 统一配置面板
├── ql_script/                      # 青龙面板专用脚本目录（单文件聚合 + 内置标准 Cron + @tag 分类）
│   ├── weread.js                   # 微信读书全功能聚合（内置纯 JS S-box 逆向签名，100% 脱机换票）
│   ├── telecom_daily.py            # 中国电信 · 每日签到与金豆打卡
│   ├── telecom_wednesday.py        # 中国电信 · 周三双抽奖与权益币
│   ├── telecom_ai_pad.py           # 中国电信 · AI奇遇赢Pad（优先赚点·跨期累计·满千兑换话费）
│   ├── telecom_midnight_equity.py  # 中国电信 · 0点等级会员权益自动抢兑
│   └── unicom_daily.py             # 中国联通 · 每日签到与聚合福利
├── scripts/                        # 核心脚本源码（按业务生态清晰聚合）
│   ├── weread/                     # 微信读书专区（抓取 + 签到 + 翻牌 + 限免 + 聚合）
│   ├── telecom/                    # 中国电信专区（周三抽奖 + 话费秒杀 + 山西福利）
│   ├── tools/                      # 独立功能与页面净化工具（B站、Pixiv、GitHub等）
│   └── example/                    # 脚本开发模板
├── docs/                           # 开发规范与使用指南
└── icons/                          # 插件图标资源
```

| 目录 | 说明 | 文档 |
|---|---|---|
| [`ql_script/`](./ql_script/) | 青龙面板专用聚合脚本（内置 Cron 与单环境变量设计） | [查看](./ql_script/README.md) |
| [`scripts/`](./scripts/) | 所有执行脚本源码（按业务聚合为 weread、telecom、tools） | [查看](./scripts/README.md) |
| [`loon/`](./loon/) | Loon 插件规则配置 | [查看](./loon/README.md) |
| [`boxjs/`](./boxjs/) | BoxJS 统一订阅配置 | [查看](./boxjs/README.md) |
| [`docs/`](./docs/) | 详细使用教程与架构规范 | [查看](./docs/) |

## ⚠️ 免责声明

1. **用途限制**：本项目（MyCookieCenter）及其包含的所有自动化脚本、规则及配置仅供个人技术研究、网络协议学习以及日常自我自动化管理使用，**严禁用于任何商业用途、非法牟利或任何形式的黑灰产活动**。
2. **凭据安全与隐私保护**：脚本运行所需的所有凭证（如手机号、服务密码、Cookie、Token、Key 等敏感信息）均仅保存在用户本地设备或用户自建的面板私有运行环境中，**本项目绝不收集、上传、转发或窃取任何用户的个人隐私与身份凭据**。
3. **责任自负原则**：用户在下载、部署或运行本项目脚本时，应自行评估并承担一切操作风险。因使用本仓库代码而造成的任何直接或间接后果（包括但不限于账号异常、积分变动、服务受限、活动规则变更阻断或封号等），**本项目作者及所有代码贡献者概不承担任何法律责任与连带责任**。
4. **知识产权与合规处理**：本项目所引用的第三方服务名称、商标、Logo 及相关权益均归属于其各自的合法持有方。若相关机构或个人认为本项目某些内容侵犯了其合法权益，请通过 Issue 联系仓库维护者，核实后将第一时间处理或下架相关内容。

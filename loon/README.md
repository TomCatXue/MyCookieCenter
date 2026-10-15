# Loon 插件

本目录存放所有 Loon 专用的 `.plugin` 文件，按功能分两类：

- **统一 Cookie 抓取合集** — `CookieCenter.plugin`，参照 Paperclip 架构设计，集中管理全部业务的纯凭据捕获，每个业务配备独立开关（默认全关，按需开启），**100% 剥离定时签到执行**（签到任务由青龙面板负责）
- **独立功能插件** — 对应 `scripts/tools/` 下的解锁 / 净化脚本，各自独立开关

> [BoxJS 订阅](../boxjs/README.md) 统一提供凭据持久化查看、一键复制青龙环境变量、完备度诊断与 Cookie 清除重置入口。

---

## 插件清单

### CookieCenter（统一 Cookie 抓取合集）

| 文件 | 说明 | 包含业务与开关 |
|---|---|---|
| [`CookieCenter.plugin`](./CookieCenter.plugin) | 集中抓取全系业务 Cookie（纯抓取、零 cron、默认全关） | **微信读书**（`weread`）<br>**电信·会员抽奖**（`telecom_draw`）<br>**电信·等级权益**（`telecom_rights`）<br>**电信·山西福利**（`telecom_benefit`）<br>**扫描全能王**（`camscanner`） |

### 独立功能（解锁 / 净化类）

| 文件 | 说明 | 类型 |
|---|---|---|
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间·清净 — 广告退散，空间清净 | 规则型（无脚本） |
| [`BilibiliFix.plugin`](./BilibiliFix.plugin) | 哔哩哔哩·增强版 𝕏 — 空降助手、分区修复、扫码登录、画质解锁 | 脚本型 · [`scripts/tools/bilibili/`](../scripts/tools/bilibili/) |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书·防强更去广告 — 屏蔽升级弹窗、强更通知与去广告精简，锁定老版本免费 AI 听书 | 脚本型 · [`scripts/tools/wxread_enhance/`](../scripts/tools/wxread_enhance/) |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub·星标推送时间 — 在 GitHub App 星标列表语言后显示最近推送时间 | 脚本型 · [`scripts/tools/github/`](../scripts/tools/github/) |
| [`PixivEnhanced.plugin`](./PixivEnhanced.plugin) | Pixiv·全域增强翻译 — 全页面日文深度汉化 · AI 视觉多模态漫翻 · 内置设置中心 | 脚本型 · [`scripts/tools/pixiv/`](../scripts/tools/pixiv/) |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王·签到 — 抓取 Cookie + 每日签到 | 脚本型 · 抓取内化 [`scripts/tools/camscanner/`](../scripts/tools/camscanner/) / 签到外部 |
| [LoonMonitor.plugin](./LoonMonitor.plugin) | Loon 监控·小组件数据提供与状态服务 — 专为 iOS 哑巴面板小组件打造，实时提供运行模式、策略组、VPN 出口 IP 与订阅流量 | 脚本型 · [scripts/tools/loon/](../scripts/tools/loon/) |

---

## 使用方式

1. 在 Loon 中选择「插件」→ 右上角「+」→ URL 导入
2. 粘贴 `CookieCenter.plugin` 的 Raw 地址：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin
   ```

3. 导入后默认全部开关为关闭状态，**按需打开需要抓取的业务开关**（如 `weread` 或 `telecom_draw`）；
4. 进入对应 App 或小程序触发抓取，收到系统通知提示即表示抓取成功；
5. 打开 [BoxJS 订阅](../boxjs/README.md)，在对应应用中点击数据行，使用原生「数据查看器」的复制按钮取出凭据，填入青龙面板。

---

## 💡 抓取黄金顺序与贴士

- **微信读书**：强烈建议先打开微信读书 App 进入「我」的页面（触发 App 基础凭据与脱机换票 token 捕获），再去打开「周二翻牌」活动页（自动补齐 Web 端 wr_vid / wr_skey），两步即可合成最完整的满血凭据！
- **复制凭据**：BoxJS 自带数据查看器与「复制数据」，无需额外导出脚本；复制后按各脚本 README 拼装青龙环境变量（如 `WEREAD_AUTH`、`dxlin`）。

---

## ⚠️ 插件版本与时分日期规范

仓库内所有 `.plugin` 插件推行**高精度版本时间戳规范**：
- **版本号标识**：每个插件必须显式携带 `#!version = x.y.z`；
- **更新时间戳**：`#!date` 必须**精确到分钟**（`YYYY-MM-DD HH:mm`）；
- **版本更新核对**：每次维护更新时，日期时分随之刷新，确保用户客户端能穿透本地缓存。

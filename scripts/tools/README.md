# 独立功能与增强工具 (scripts/tools/)

本专区存放无状态的请求/响应改写、界面净化及独立增强类脚本。每个工具拥有独立的 Loon `.plugin` 文件，各功能单开关控制，互不影响。

---

## 工具清单

| 目录 | 功能名称 | 对应 Loon 插件 | 说明 |
|---|---|---|---|
| **[`bilibili/`](./bilibili/)** | 哔哩哔哩·增强版 𝕏 | [`loon/BilibiliFix.plugin`](../../loon/BilibiliFix.plugin) | 空降助手、分区修复、扫码登录、画质解锁 |
| **[`pixiv/`](./pixiv/)** | Pixiv·小说翻译 | [`loon/PixivNovelTranslate.plugin`](../../loon/PixivNovelTranslate.plugin) | 小说阅读页一键翻译，支持 Google / 微软 / 百度 / Cloudflare Worker |
| **[`github/`](./github/)** | GitHub·星标推送时间 | [`loon/GitHubPushTime.plugin`](../../loon/GitHubPushTime.plugin) | 在 GitHub App 星标列表语言后展示最近推送时间 |
| **[`wxread_enhance/`](./wxread_enhance/)** | 微信读书·防强更净化 | [`loon/WeReadEnhance.plugin`](../../loon/WeReadEnhance.plugin) | 屏蔽升级弹窗与强更通知，锁定老版本免费 AI 听书 |
| **[`camscanner/`](./camscanner/)** | 扫描全能王·签到 | [`loon/camscanner.plugin`](../../loon/camscanner.plugin) | 静默抓取 Cookie 并执行每日签到 |

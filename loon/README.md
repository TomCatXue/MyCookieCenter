# Loon 插件

本目录存放所有 Loon 专用的 `.plugin` 文件，按功能分两类：

- **统一凭据捕获插件** — `CookieCenter.plugin`，专职整合微信读书、山西电信、翼支付的凭据捕获与页面注入
- **独立功能插件** — 对应 `plugins/` 下的解锁/净化脚本，各自独立开关

> `CookieCenter.plugin` 只负责凭据捕获与页面处理，不含任何 cron；微信读书 / 山西电信的定时签到任务由 [BoxJS 订阅](../boxjs/README.md)统一调度，面板负责 Cookie 持久化与参数设置。

---

## 插件清单

### CookieCenter（统一凭据捕获）

| 文件 | 说明 | 脚本来源 |
|---|---|---|
| [`CookieCenter.plugin`](./CookieCenter.plugin) | 微信读书 / 山西电信 / 翼支付的凭据捕获（定时任务见 [BoxJS 订阅](../boxjs/README.md)） | [`app/weread_claim/`](../app/weread_claim/)、[`plugins/sx_ai_benefit/`](../plugins/sx_ai_benefit/)、[`plugins/bestpay_coin/`](../plugins/bestpay_coin/) |

### 独立功能

| 文件 | 说明 | 类型 |
|---|---|---|
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间·清净 — 广告退散，空间清净 | 规则型（无脚本） |
| [`BilibiliFix.plugin`](./BilibiliFix.plugin) | 哔哩哔哩·增强版 𝕏 — 空降助手、分区修复、扫码登录、画质解锁 | 脚本型 · [`plugins/bilibili/`](../plugins/bilibili/) |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书·优雅收录 — 轻触订阅人数，好书即刻入架 | 脚本型 · [`plugins/wxread/`](../plugins/wxread/) |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub·星标推送时间 — 在 GitHub App 星标列表语言后显示最近推送时间 | 脚本型 · [`plugins/github_push_time/`](../plugins/github_push_time/) |
| [`PixivNovelTranslate.plugin`](./PixivNovelTranslate.plugin) | Pixiv·小说翻译 — 小说阅读页一键翻译，支持 Google 免费接口 / 微软 / 百度 | 脚本型 · [`plugins/pixiv_novel_translate/`](../plugins/pixiv_novel_translate/) |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王·签到 — 抓取 Cookie + 每日签到 | 脚本型 · 抓取内化 [`plugins/camscanner/`](../plugins/camscanner/) / 签到外部 |

> `camscanner.plugin` 的**抓取脚本**已内化至 [`plugins/camscanner/`](../plugins/camscanner/)（静默版：进 App 不弹通知，失效由签到通知）；**签到脚本**与图标仍引用外部仓库（[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)、[MaYIHEI/pin](https://github.com/MaYIHEI/pin)）。

---

## 使用方式

1. 在 Loon 中选择「插件」→ 右上角「+」→ URL 导入
2. 粘贴对应 `.plugin` 的 Raw 地址，例如：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin
   ```

3. 导入后可在插件设置中按需调整各平台捕获开关（默认开启）
4. **凭据捕获**：打开对应 App 开关 → 进入 App 触发接口 → 收到通知即成功 → 捕获完成后可关闭对应开关减少 MITM
5. **参数面板 / 手动运行**：通过 [BoxJS 订阅](../boxjs/README.md) 查看与配置 Cookie 和偏好


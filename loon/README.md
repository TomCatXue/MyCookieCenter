# Loon 插件

本目录存放所有 Loon 专用的 `.plugin` 文件，按功能分两类：

- **统一签到 / 权益插件** — `CookieCenter.plugin`，整合「微信读书」与「中国电信」全系业务的凭据捕获与后台定时任务
- **独立功能插件** — 对应 `plugins/` 下的解锁/净化脚本，各自独立开关

> `CookieCenter.plugin` 内置了 Loon 极简双主控开关与后台 cron 任务；[BoxJS 订阅](../boxjs/README.md) 统一提供凭据持久化、参数配置与手动测试入口。

---

## 插件清单

### CookieCenter（统一签到 / 权益中心）

| 文件 | 说明 | 整合业务与脚本来源 |
|---|---|---|
| [`CookieCenter.plugin`](./CookieCenter.plugin) | 微信读书 / 中国电信全系业务的一站式凭据捕获 + 后台定时任务 | **微信读书**：[`app/weread_claim/`](../app/weread_claim/)<br>**中国电信**：[`plugins/telecom_member_draw/`](../plugins/telecom_member_draw/)（周三双抽奖+幸运抽奖）、[`plugins/telecom_rights/`](../plugins/telecom_rights/)（0点秒杀话费）、[`plugins/sx_ai_benefit/`](../plugins/sx_ai_benefit/)（山西福利） |

### 独立功能（解锁 / 净化类）

| 文件 | 说明 | 类型 |
|---|---|---|
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间·清净 — 广告退散，空间清净 | 规则型（无脚本） |
| [`BilibiliFix.plugin`](./BilibiliFix.plugin) | 哔哩哔哩·增强版 𝕏 — 空降助手、分区修复、扫码登录、画质解锁 | 脚本型 · [`plugins/bilibili/`](../plugins/bilibili/) |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书·防强更净化 — 屏蔽升级弹窗与强更通知，锁定老版本免费 AI 听书 | 脚本型 · [`plugins/wxread/`](../plugins/wxread/) |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub·星标推送时间 — 在 GitHub App 星标列表语言后显示最近推送时间 | 脚本型 · [`plugins/github_push_time/`](../plugins/github_push_time/) |
| [`PixivNovelTranslate.plugin`](./PixivNovelTranslate.plugin) | Pixiv·小说翻译 — 小说阅读页一键翻译，支持 Google 免费接口 / 微软 / 百度 | 脚本型 · [`plugins/pixiv_novel_translate/`](../plugins/pixiv_novel_translate/) |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王·签到 — 抓取 Cookie + 每日签到 | 脚本型 · 抓取内化 [`plugins/camscanner/`](../plugins/camscanner/) / 签到外部 |

---

## 使用方式

1. 在 Loon 中选择「插件」→ 右上角「+」→ URL 导入
2. 粘贴 `CookieCenter.plugin` 的 Raw 地址：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin
   ```

3. 导入后可在插件设置中按需调整开关（`weread`（微信读书）、`telecom`（中国电信））；
4. **参数面板 / 手动运行**：通过 [BoxJS 订阅](../boxjs/README.md) 查看与配置 Cookie、手机号和运行测试。

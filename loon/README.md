# Loon 插件

本目录存放所有 Loon 专用的 `.plugin` 文件，按功能分两类：

- **Cookie 抓取插件** — `CookieCenter.plugin`，多平台 Cookie 抓取 + 签到，独立开关
- **独立功能插件** — 对应 `plugins/` 下的解锁/净化脚本，各自独立开关

> 签到/羊毛 cron 任务不在 Loon 插件中，由 BoxJS 订阅统一管理。

---

## 插件清单

### Cookie 抓取

| 文件 | 说明 | 脚本来源 |
|---|---|---|
| [`CookieCenter.plugin`](./CookieCenter.plugin) | 多平台 Cookie 抓取 + 每日签到 | `app/` 下各脚本目录 |

### 独立功能

| 文件 | 说明 | 类型 |
|---|---|---|
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间·清净 — 广告退散，空间清净 | 规则型（无脚本） |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书·优雅收录 — 轻触订阅人数，好书即刻入架 | 脚本型 · [`plugins/wxread/`](../plugins/wxread/) |
| [`WeReadClaim.plugin`](./WeReadClaim.plugin) | 微信读书·自动领取 — 定时领取阅读奖励（书币/体验卡）+ 每周翻牌 | 脚本型 · [`plugins/weread_claim/`](../plugins/weread_claim/) |
| [`WeReadVip.plugin`](./WeReadVip.plugin) | 微信读书·会员解锁 — v6.x 会员解锁 + 付费墙 + 屏蔽更新 | 脚本型 · [`plugins/weread_vip/`](../plugins/weread_vip/) |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub·星标推送时间 — 在 GitHub App 星标列表显示最近推送时间 | 脚本型 · [`plugins/github_push_time/`](../plugins/github_push_time/) |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王·签到 — 抓取 Cookie + 每日签到 | 脚本型 · 抓取内化 [`plugins/camscanner/`](../plugins/camscanner/) / 签到外部 |

> `camscanner.plugin` 的**抓取脚本**已内化至 [`plugins/camscanner/`](../plugins/camscanner/)（静默版：进 App 不弹通知，失效由签到通知）；**签到脚本**与图标仍引用外部仓库（[MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)、[MaYIHEI/pin](https://github.com/MaYIHEI/pin)）。

---

## 使用方式

1. 在 Loon 中选择「插件」→ 右上角「+」→ URL 导入
2. 粘贴对应 `.plugin` 的 Raw 地址，例如：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin
   ```

3. 导入后在插件设置中按需打开开关（默认全关）
4. **Cookie 抓取**：打开对应 App 开关 → 进入 App 触发接口 → 收到通知即成功 → 建议关闭开关减少 MITM
5. **签到/羊毛**：通过 [BoxJS 订阅](../boxjs/README.md) 管理 cron 任务

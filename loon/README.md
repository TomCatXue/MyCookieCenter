# Loon 插件

本目录存放所有 Loon 专用的 `.plugin` 文件，按功能分两类：

- **Cookie 抓取插件** — `CookieCenter.plugin`，哔哩哔哩 Cookie 抓取 + 签到，独立开关
- **独立功能插件** — 对应 `plugins/` 下的解锁/净化脚本，各自独立开关

> 签到/羊毛 cron 任务不在 Loon 插件中，由 BoxJS 订阅统一管理。

---

## 插件清单

### Cookie 抓取

| 文件 | 说明 | 脚本来源 |
|---|---|---|
| [`CookieCenter.plugin`](./CookieCenter.plugin) | 哔哩哔哩 Cookie 抓取 + 每日签到 | 本项目 `app/bilibili/` |

### 独立功能

| 文件 | 说明 | 对应脚本 | 类型 |
|---|---|---|---|
| [`TabulaBili.plugin`](./TabulaBili.plugin) | 初见哔哩净化 — 剥离 B 站推荐流 Cookie，打破信息茧房 | [`plugins/tabulabili/`](../plugins/tabulabili/) | 脚本型 |
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间·清净 — 广告退散，空间清净 | [`plugins/qzone/`](../plugins/qzone/) | 规则型 |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书·优雅收录 — 轻触订阅人数，好书即刻入架 | [`plugins/wxread/`](../plugins/wxread/) | 脚本型 |

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

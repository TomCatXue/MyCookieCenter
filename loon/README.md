# Loon 插件

本目录存放所有 Loon 专用的 `.plugin` 文件，按功能分两类：

- **Cookie 抓取插件** — `CookieCenter.plugin`，整合 NobyDa + fmz200 脚本库，每个 App 独立开关，**只负责抓 Cookie**
- **独立功能插件** — 对应 `plugins/` 下的解锁/净化脚本，各自独立开关

> 签到/羊毛 cron 任务不在 Loon 插件中，由 BoxJS 订阅统一管理。

---

## 插件清单

### Cookie 抓取

| 文件 | 说明 | 脚本来源 |
|---|---|---|
| [`CookieCenter.plugin`](./CookieCenter.plugin) | Cookie 抓取合集，整合 60+ App，每个独立开关（默认全关） | 本项目 `app/` + NobyDa + fmz200 + chavyleung 等 |

### 独立功能

| 文件 | 说明 | 对应脚本 |
|---|---|---|
| [`TabulaBili.plugin`](./TabulaBili.plugin) | 初见哔哩净化 — 剥离 B 站推荐流 Cookie，打破信息茧房 | [`plugins/tabulabili/`](../plugins/tabulabili/) |
| [`AdaptyCrack.plugin`](./AdaptyCrack.plugin) | Adapty 合集解锁 — 修改 SDK 响应，解锁 15 个 App 会员 | [`plugins/adapty/`](../plugins/adapty/) |

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

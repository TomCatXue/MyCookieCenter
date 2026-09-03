# 微信读书 · 自动领取

> 定时领取已达标阅读时长奖励，每周二自动翻牌。

## 功能

- 每晚 23:00 自动检查并领取已达标的阅读奖励（书币 / 体验卡），按偏好优先选取
- 每周二 20:00 自动完成翻牌游戏（每周 6 次，按抓包确认的时序翻牌）
- 自动抓取鉴权信息：`i.weread.qq.com` 的 vid/skey 与 `weread.qq.com` 的 wr_vid/wr_skey
- 支持通知推送领取结果

## 安装

1. 在 Loon 中导入 [`loon/CookieCenter.plugin`](../../loon/CookieCenter.plugin)
2. 在插件设置中保持「微信读书·凭据捕获」开关开启，进入微信读书 App 随便刷一下触发抓取
3. 捕获为静默写入，进入 App 后无需等待通知；需要确认时可查看 BoxJS 中 `weread_auth_v2` 是否有值，或手动运行一次每日领取任务
4. 在 BoxJS 添加 [`boxjs/CookieCenter.boxjs.json`](../../boxjs/CookieCenter.boxjs.json) 订阅，配置奖励偏好等参数

## BoxJS 配置

本脚本已纳入 [`boxjs/CookieCenter.boxjs.json`](../../boxjs/CookieCenter.boxjs.json) 订阅，在 BoxJS 中添加订阅后可在面板中配置 `prefer_coin`（奖励偏好）并查看任务。

## 参数配置

| 参数 | 类型 | 作用 | 默认 |
|------|------|------|------|
| `prefer_coin` | BoxJS select | 奖励偏好：`1`=优先体验卡，`2`=优先书币 | `2` |
| `weread_capture` | CookieCenter 开关 | 开启自动抓取登录信息（vid/skey/refreshToken） | 开 |

## 定时任务

| 任务 | cron | 说明 |
|------|------|------|
| 领取奖励 | `0 23 * * *` | 每晚 23:00 检查并领取 |
| 翻牌游戏 | `0 20 * * 2` | 每周二 20:00 自动翻牌 |

> 领取与翻牌为两个独立脚本入口：`weread_claim.js` 默认执行每日领取，`weread_flip.js` 默认执行翻牌。运行通知标题分别显示「WeRead · 每日签到」与「WeRead · 周二翻牌」，便于区分。

## 鉴权模型

微信读书分两套域名，鉴权信息同值异传：

| 域名 | 用途 | 鉴权方式 |
|------|------|----------|
| `i.weread.qq.com` | App 核心 API（领取奖励） | `vid` / `skey` 请求头 |
| `weread.qq.com` | 翻牌游戏 H5 | `wr_vid` / `wr_skey` Cookie |

抓包确认 `wr_vid == vid`、`wr_skey == skey`，脚本自动从 `/login` 响应与各域请求中提取并分别存储。

## 已知限制

- **App 签到凭据不能主动刷新**：`/login` 请求体含 HMAC-SHA256 签名（盐 `EBRYFkVMReKBGsU2`，key 格式 `%@_%@_EBRYFkVMReKBGsU2_%@`），穷举 160+ 组合均无法复现。脚本会在 `skey` 失效时尝试仅用长期 `vid` 重试；若 `vid` 也失效，仍需重新打开 App 触发抓取。
- **翻牌 Cookie 支持自动续期**：`weread.qq.com` 的 `wr_skey` 失效时，脚本会调用网页版 `/web/login/renewal` 获取新的 `wr_skey`，并重试本次翻牌；该续期只更新 `wr_skey`，不会覆盖 App API 的 `skey`。
- 翻牌每周 6 次，脚本按抓包确认的 `FLIP_CARD_ORDER` 时序翻牌，用尽即止。

## 文件说明

| 文件 | 用途 |
|------|------|
| `weread_claim.js` | 核心脚本（抓取 + 每日领取；兼容 `task=flip` 执行翻牌） |
| `weread_flip.js` | 翻牌专用入口（默认执行翻牌，兼容 `task=claim` 参数） |

## 版本

- `2026-09-03-task-split` — 翻牌改为独立入口 `weread_flip.js`（默认翻牌），通知标题区分「WeRead · 每日签到」与「WeRead · 周二翻牌」
- `2026-08-10-fix` — 修复 cookie 自动抓取、翻牌时序、奖励切换三处问题（基于逆向笔记）
- `2026-08-11-flipfix` — 修复翻牌通知奖励误报：一次运行翻多张牌时，`describeFlipResult` 误取 `cardList` 中首张已翻牌的奖励，改为按本次 `cardIndex` 精确匹配
- `2026-08-12-autorenew` — 翻牌遇到 401/403 时自动调用网页版 `renewal` 续期 `wr_skey` 并重试，减少手动打开 App 重新抓 Cookie 的次数
- `2026-08-14-preferfix` — 修复奖励偏好切换失效：Loon `[Argument]` 段参数值应通过 `$persistentStore.read("prefer_coin")` 读取（即 `$.getdata("prefer_coin")`），而非 `$argument`（后者只对应 `argument="..."` 静态字符串）。原代码读取源错误导致偏好恒为默认书币，体验卡/书币切换不生效；同时移除失效的 `savePreferenceFromArgument` 中转存储死代码。

# 微信读书 · 自动领取

> 定时领取已达标阅读时长奖励，每周二自动翻牌。

## 功能

- 每晚 23:00 自动检查并领取已达标的阅读奖励（书币 / 体验卡），按偏好优先选取
- 每周二 20:00 自动完成翻牌游戏（每周 6 次，按抓包确认的时序翻牌）
- 自动抓取鉴权信息：`i.weread.qq.com` 的 vid/skey 与 `weread.qq.com` 的 wr_vid/wr_skey
- 支持通知推送领取结果

## 安装

1. 在 Loon 中导入 `loon/WeReadClaim.plugin`
2. 打开 `capture_cookie` 开关，进入微信读书 App 随便刷一下触发抓取
3. 收到抓取成功通知后可关闭开关（减少 MITM 开销）
4. 领取与翻牌由 cron 自动执行，无需手动干预

## 参数配置

| 参数 | 类型 | 作用 | 默认 |
|------|------|------|------|
| `prefer_coin` | input | 奖励偏好：`1`=优先体验卡，`2`=优先书币 | `2` |
| `capture_cookie` | switch | 开启自动抓取登录信息（vid/skey/refreshToken） | 开 |

## 定时任务

| 任务 | cron | 说明 |
|------|------|------|
| 领取奖励 | `0 23 * * *` | 每晚 23:00 检查并领取 |
| 翻牌游戏 | `0 20 * * 2` | 每周二 20:00 自动翻牌 |

## 鉴权模型

微信读书分两套域名，鉴权信息同值异传：

| 域名 | 用途 | 鉴权方式 |
|------|------|----------|
| `i.weread.qq.com` | App 核心 API（领取奖励） | `vid` / `skey` 请求头 |
| `weread.qq.com` | 翻牌游戏 H5 | `wr_vid` / `wr_skey` Cookie |

抓包确认 `wr_vid == vid`、`wr_skey == skey`，脚本自动从 `/login` 响应与各域请求中提取并分别存储。

## 已知限制

- **登录态无法自动刷新**：`/login` 请求体含 HMAC-SHA256 签名（盐 `EBRYFkVMReKBGsU2`，key 格式 `%@_%@_EBRYFkVMReKBGsU2_%@`），穷举 160+ 组合均无法复现，签名算法不可逆。因此 cookie 失效后需重新打开 App 触发抓取，不能自动续期。
- 翻牌每周 6 次，脚本按抓包确认的 `FLIP_CARD_ORDER` 时序翻牌，用尽即止。

## 文件说明

| 文件 | 用途 |
|------|------|
| `weread_claim.js` | 核心脚本（抓取 + 领取 + 翻牌，单文件自包含） |
| `loon/WeReadClaim.plugin` | Loon 插件清单（MITM / Script / Argument / cron） |

## 版本

- `2026-08-10-fix` — 修复 cookie 自动抓取、翻牌时序、奖励切换三处问题（基于逆向笔记）
- `2026-08-11-flipfix` — 修复翻牌通知奖励误报：一次运行翻多张牌时，`describeFlipResult` 误取 `cardList` 中首张已翻牌的奖励，改为按本次 `cardIndex` 精确匹配

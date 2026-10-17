# 微信读书

微信读书全功能任务：阅读领卡 + 周二翻牌 + 周五限免，内置脱机换票。

| 文件 | 用途 |
| :--- | :--- |
| [`weread.js`](./weread.js) | 青龙主任务（聚合三合一） |
| [`weread_cookie.js`](./weread_cookie.js) | Loon 凭据捕获 |
| [`weread_claim.js`](./weread_claim.js) | 独立：阅读领卡 |
| [`weread_flip.js`](./weread_flip.js) | 独立：周二翻牌 |
| [`weread_free.js`](./weread_free.js) | 独立：周五限免 |

## 青龙配置

| 项 | 值 |
| :--- | :--- |
| 环境变量 | `WEREAD_AUTH` |
| 定时 | `0 23 * * 0` |
| 值格式 | `{"vid":"...","skey":"...","refreshToken":"...","deviceId":"..."}` |

子任务开关在脚本顶部 `CONFIG` 中修改，无需额外环境变量。

## 脱机换票

只要凭据包含 `refreshToken` 与 `deviceId`，skey 过期时脚本会自动调用 `/login` 换票并回写 `weread_session.json`，之后无需再碰手机。

## 抓取顺序

先进「我」的页面拿 App 票据，再去「周二翻牌」页补齐 Web 票据，两步才完整。

# 扫描全能王 · Cookie 抓取

> 内化自 [MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)，按需改造。

## 行为

抓取到凭据后会弹「✅ Cookie 获取成功」，并在同页面并发请求时用 10 秒窗口去重，避免刷屏。

| 场景 | 行为 |
|------|------|
| 数据未变 | 10 秒内不重复通知，超过窗口再次进入会确认提示 |
| 数据变化 | 更新 `camscanner_data` 并**立即通知**（不受窗口限制） |
| Cookie 失效 | 由签到脚本 `camscanner.js`（cron）在签到失败时通知 |

## 自动换票（免反复抓包）

长效换票种子 `token_pwd` 只在 App「退出登录并重新登录」时经 `update_token_by_tokenpwd` 下发一次。
被本插件捕获后即安全存入本地（**绝不打印日志、不进通知正文、不入库**），之后 token 到期自动换新，无需再开 App 抓取。

| 环节 | 文件 | 说明 |
|------|------|------|
| 捕获种子 | `camscanner.cookie.js` | 换票请求出现时自动提取 `token_pwd`+配套参数，低频提醒一次 |
| 自动换票 | `camscanner.renew.js` | cron 调 `update_token_by_tokenpwd` 换 token，原地更新并落盘 |

### 首次启用（只做一次）

1. 确保已启用本插件的 MITM（`api-cs.intsig.net`）与抓取规则。
2. 打开扫描全能王 → **退出登录 → 重新登录**。
3. 插件自动捕获 `token_pwd` 并提示「🔑 长效换票种子已捕获」。
4. 之后 token 失效时 `camscanner.renew.js` 自动换票，无需再手动抓包。

> ⚠️ `token_pwd` 长效但非永久：修改密码或服务端重置后会失效，
> 届时换票脚本会通知「🚫 换票种子已失效」，重新执行一次「退出登录→重登」即可。

## 文件

| 文件 | 说明 | 来源 |
|------|------|------|
| `camscanner.cookie.js` | Cookie 抓取（带成功通知） | 本仓库维护（基于原作改造） |
| `camscanner.renew.js` | 自动换票（token_pwd → 新 token） | 本仓库维护 |
| 签到脚本 `camscanner.js` | 每日抽奖 | 仍引用外部 `MaYIHEI/paperclip` |

## 通知链路

```
进 App → camscanner.cookie.js 更新 camscanner_data → 通知「✅ Cookie 获取成功」
重登 App → camscanner.cookie.js 捕获 token_pwd → 通知「🔑 长效换票种子已捕获」
cron 换票 → camscanner.renew.js 用 token_pwd 换新 token → 通知「✅ 换票成功」
cron 签到 → camscanner.js 读取 camscanner_data 签到
  ├─ 成功 → 通知抽奖结果
  └─ Token 失效(ret 105/116) → 通知「🚫 Token 已失效，请重新打开 App 抓取」
```

## 配套插件

见 [`loon/camscanner.plugin`](../../../loon/camscanner.plugin)。

> ⚠️ `loon/DaiDaiPanel.plugin` 已包含同一条抓取规则。两个插件同时启用会各自触发一次抓取脚本，
> 导致重复通知 —— 请只保留其中一个（推荐统一用 `DaiDaiPanel.plugin`）。

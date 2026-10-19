# 扫描全能王 · Cookie 抓取

> 内化自 [MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)，按需改造。

## 行为

抓取到凭据后会弹「✅ Cookie 获取成功」，并在同页面并发请求时用 10 秒窗口去重，避免刷屏。

| 场景 | 行为 |
|------|------|
| 数据未变 | 10 秒内不重复通知，超过窗口再次进入会确认提示 |
| 数据变化 | 更新 `camscanner_data` 并**立即通知**（不受窗口限制） |
| Cookie 失效 | 由签到脚本 `camscanner.js`（cron）在签到失败时通知 |

## 文件

| 文件 | 说明 | 来源 |
|------|------|------|
| `camscanner.cookie.js` | Cookie 抓取（带成功通知） | 本仓库维护（基于原作改造） |
| 签到脚本 `camscanner.js` | 每日抽奖 | 仍引用外部 `MaYIHEI/paperclip` |

## 通知链路

```
进 App → camscanner.cookie.js 更新 camscanner_data → 通知「✅ Cookie 获取成功」
cron 签到 → camscanner.js 读取 camscanner_data 签到
  ├─ 成功 → 通知抽奖结果
  └─ Token 失效(ret 105/116) → 通知「🚫 Token 已失效，请重新打开 App 抓取」
```

## 配套插件

见 [`loon/camscanner.plugin`](../../../loon/camscanner.plugin)。

> ⚠️ `loon/CookieCenter.plugin` 已包含同一条抓取规则。两个插件同时启用会各自触发一次抓取脚本，
> 导致重复通知 —— 请只保留其中一个（推荐统一用 `CookieCenter.plugin`）。

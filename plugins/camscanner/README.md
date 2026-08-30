# 扫描全能王 · Cookie 抓取（静默版）

> 内化自 [MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip)，按需改造。

## 与原作的差异

原作每次进 App 抓取到新数据都弹「✅ Cookie 获取成功」通知，频繁打扰。本版改为**静默更新**：

| 场景 | 原作 | 本版 |
|------|------|------|
| 数据未变 | 跳过 | 跳过（同） |
| 数据变化 | 更新 + 弹通知 | 更新，**不弹通知** |
| Cookie 失效 | —（抓取脚本不判定） | 由签到脚本 `camscanner.js`（cron）在签到失败时通知 |

即：进 App 完全静默，只在签到发现 Cookie 失效时才收到通知。

## 文件

| 文件 | 说明 | 来源 |
|------|------|------|
| `camscanner.cookie.js` | Cookie 抓取（静默版） | 本仓库维护（基于原作改造） |
| 签到脚本 `camscanner.js` | 每日抽奖 | 仍引用外部 `MaYIHEI/paperclip` |

## 失效通知链路

```
进 App → camscanner.cookie.js 静默更新 camscanner_data
cron 签到 → camscanner.js 读取 camscanner_data 签到
  ├─ 成功 → 通知抽奖结果
  └─ Token 失效(ret 105/116) → 通知「🚫 Token 已失效，请重新打开 App 抓取」
```

## 配套插件

见 [`loon/camscanner.plugin`](../../loon/camscanner.plugin)。

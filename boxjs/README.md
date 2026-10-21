# BoxJS 订阅

凭据查看与导出中心，配合 [`DaiDaiPanel.plugin`](../loon/DaiDaiPanel.plugin) 使用。

### 订阅链接

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/DaiDaiPanel.boxjs.json
```

## 支持应用与同步目标

| 应用 | 凭据内容 | 呆呆面板 / 青龙环境变量 | 抓取即自动同步 |
| :--- | :--- | :--- | :---: |
| **微信读书** | App 票据 + 翻牌 Cookie (含 prefer_coin) | `WEREAD_AUTH` | ✅ 捕获即同步 |
| **中国移动** | 长期 app_token + 短期会话 | `CMCC_AUTH` | ✅ 捕获即同步 |
| **扫描全能王** | token / client_id / cs_ept_d | `camscanner_data` | ✅ 捕获即同步 |
| **中国电信 5G会员** | SessionKey + 手机号 | `dxlin` 第 4 段 / `TELECOM_DRAW_SESSION_KEY` | ✅ 智能缝合同步 |
| **中国电信 权益** | sign / Cookie / accId | 本地留存排障 | - |
| **中国电信 山西** | 活动 Cookie | 本地留存 | - |
| **呆呆面板** | 面板地址 / App Key / App Secret | 同步目标配置与映射 | - |

## 复制与清空

- **复制**：点击数据行 → 「数据查看器」中 value 右侧的复制按钮；或卡片右上角 ⋮ →「复制数据」
- **清空**：卡片右上角 ⋮ →「清除数据」，或数据行右侧 ✕

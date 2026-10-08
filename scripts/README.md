# 核心脚本目录 (scripts/)

本目录汇集了 MyCookieCenter 的全部执行脚本，采用**清晰的业务生态聚合架构**进行组织：

---

## 目录结构

```text
scripts/
├── weread/             # 📘 微信读书专区 (业务内聚：凭据捕获 + 每日阅读 + 周二翻牌 + 周五限免)
├── telecom/            # ☎️ 中国电信专区 (三合一：周三双抽奖+幸运抽奖、0点等级话费秒杀、山西福利)
├── tools/              # 🛠️ 独立功能专区 (无状态请求改写、页面净化、功能增强类脚本)
│   ├── bilibili/       #   - 哔哩哔哩·增强版 𝕏
│   ├── pixiv/          #   - Pixiv·小说阅读页一键翻译
│   ├── github/         #   - GitHub·星标列表推送时间展示
│   ├── wxread_enhance/ #   - 微信读书·防强更净化
│   └── camscanner/     #   - 扫描全能王·静默签到
└── example/            # 💡 新脚本开发模板与示例
```

---

## 架构与管理体系

| 专区 | 业务特性 | 管理入口 | 状态机制 |
|---|---|---|---|
| **[`weread/`](./weread/)** | 微信读书全量任务 | [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) | 有状态，Token 自动脱机换票更新 |
| **[`telecom/`](./telecom/)** | 中国电信全系业务 | [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) | 有状态，进小程序即时全自动秒领 |
| **[`tools/`](./tools/)** | 独立功能与页面净化 | 对应 [`loon/*.plugin`](../loon/) 独立插件 | 无状态请求/响应即时改写 |

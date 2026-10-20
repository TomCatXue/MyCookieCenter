# Loon 插件

| 插件 | 功能 | 独立业务开关 |
| :--- | :--- | :--- |
| [**DaiDaiPanel.plugin**](./DaiDaiPanel.plugin) | **呆呆面板 · 凭据捕获与自动同步**：微信读书 / 扫描全能王 / 中国移动 / 中国电信全系。单开关兼顾抓取与自动同步，含一键手动全量同步与每日巡检 | `weread` `cmcc_mark` `camscanner` `telecom_draw` `telecom_rights` `telecom_benefit` |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书：去广告、去更新弹窗、解除试听限制 | 内置总开关 |
| [`BilibiliFix.plugin`](./BilibiliFix.plugin) | 哔哩哔哩：空降助手、分区修复、扫码登录、画质解锁 | 内置总开关 |
| [`PixivEnhanced.plugin`](./PixivEnhanced.plugin) | Pixiv：全页面汉化、AI 漫画翻译、设置中心 | 内置总开关 |
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间：广告与营销内容屏蔽 | 规则型，无需开关 |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub：星标列表显示最近推送时间 | 内置总开关 |
| [`LoonMonitor.plugin`](./LoonMonitor.plugin) | 为 iOS 桌面小组件提供运行状态与流量数据 | 内置总开关 |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王：抓取 + 每日签到 | `cookie_capture` `sign_in` |

*(注：原 [`CookieCenter.plugin`](./CookieCenter.plugin) 与 `DaiDaiPanel.plugin` 保持同步对齐，旧订阅链接无缝兼容)*

## 使用

Loon → 插件 → 右上角 **+** → 粘贴插件 Raw 地址即可：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/DaiDaiPanel.plugin
```

> **微信读书**：建议先打开「我」的页面（获取 App 票据与脱机换票 token），再去「周二翻牌」活动页（补齐 Web 票据），两步结合即可自动合成最完整的满血凭据并推送至呆呆面板。
> **双重配置**：呆呆面板连接凭据可在 BoxJS 卡片中填写，也可直接在 Loon 插件配置界面的 `[Argument]` 处填入，两者自动双向同步。

## 注意

- 每个插件都带 `#!version` 与分钟级 `#!date`，脚本 URL 带 `?v=` 缓存参数；更新后若未生效，删除插件重新导入。
- `camscanner.plugin` 与 `DaiDaiPanel.plugin` 含相同抓取规则，建议只启用主插件 `DaiDaiPanel.plugin` 即可。

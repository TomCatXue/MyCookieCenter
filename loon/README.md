# Loon 插件

| 插件 | 功能 | 开关 |
| :--- | :--- | :--- |
| [`CookieCenter.plugin`](./CookieCenter.plugin) | 凭据抓取合集：微信读书 / 中国电信全系 / 扫描全能王，抓到即通知 | `weread` `telecom_draw` `telecom_rights` `telecom_benefit` `camscanner` |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书：去广告、去更新弹窗、解除试听限制 | 内置总开关 |
| [`BilibiliFix.plugin`](./BilibiliFix.plugin) | 哔哩哔哩：空降助手、分区修复、扫码登录、画质解锁 | 内置总开关 |
| [`PixivEnhanced.plugin`](./PixivEnhanced.plugin) | Pixiv：全页面汉化、AI 漫画翻译、设置中心 | 内置总开关 |
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间：广告与营销内容屏蔽 | 规则型，无需开关 |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub：星标列表显示最近推送时间 | 内置总开关 |
| [`LoonMonitor.plugin`](./LoonMonitor.plugin) | 为 iOS 桌面小组件提供运行状态与流量数据 | 内置总开关 |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王：抓取 + 每日签到 | `cookie_capture` `sign_in` |

## 使用

Loon → 插件 → 右上角 **+** → 粘贴插件 Raw 地址即可。

`CookieCenter.plugin` 导入后开关**默认开启**，可单独关掉不需要的业务；抓完凭据也可关闭以减少 MITM 干扰。

> **微信读书**：先进「我」的页面（拿 App 票据），再去「周二翻牌」页（补齐 Web 票据），两步才完整。

## 注意

- `camscanner.plugin` 与 `CookieCenter.plugin` 含相同抓取规则，**只保留一个**，否则会重复通知。
- 每个插件都带 `#!version` 与分钟级 `#!date`，脚本 URL 带 `?v=` 缓存参数；更新后若未生效，删除插件重新导入。

### QQ空间 清净

规则型插件，导入即生效，无需配置。屏蔽空间信息流广告、营销卡片与推广位。

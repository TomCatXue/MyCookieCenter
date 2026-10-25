# Loon 插件

| 插件 | 功能 | 独立业务开关 |
| :--- | :--- | :--- |
| [**DaiDaiPanel.plugin**](./DaiDaiPanel.plugin) (v1.0.6) | **呆呆面板**：微信读书 / 扫描全能王 / 中国移动 / 中国电信凭据捕获并自动同步 | `weread` `cmcc_mark` `camscanner` `telecom` |
| [**ChinaMobile.plugin**](./ChinaMobile.plugin) (v1.0.16) | **中国移动**：净化开屏、首页轮播、专区横幅、和包钱包营销浮层与「我的」弹窗 | HideCarousel 轮播总控及全功能细分开关 |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书：去广告、去更新弹窗、解除试听限制 | 内置总开关 |
| [`BilibiliFix.plugin`](./BilibiliFix.plugin) | 哔哩哔哩：空降助手、分区修复、扫码登录、画质解锁 | 内置总开关 |
| [`PixivEnhanced.plugin`](./PixivEnhanced.plugin) | Pixiv：全页面汉化、AI 漫画翻译、设置中心 | 内置总开关 |
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间：广告与营销内容屏蔽 | 规则型，无需开关 |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub：星标列表显示最近推送时间 | 内置总开关 |
| [`LoonMonitor.plugin`](./LoonMonitor.plugin) | 为 iOS 桌面小组件提供运行状态与流量数据 | 内置总开关 |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王：抓取 + 每日签到 | `cookie_capture` `sign_in` |

## 使用

Loon → 插件 → 右上角 **+** → 粘贴插件 Raw 地址即可：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/DaiDaiPanel.plugin
```

## 核心架构：一 App 一脚本与抓取即同步

- **彻底告别机械定时**：完全移除定时 Cron 轮询。推送到呆呆面板采用纯事件驱动机制——在 App 产生网络流量、拦截并识别到凭据发生变化的同一瞬间，立即推送到呆呆面板环境变量，并在系统通知弹窗中直观汇报同步状态（如 `WEREAD_AUTH 已更新入库 (ID: 101)`）。
- **极简规则架构**：每个 App 严格对应一个独立脚本，拒绝长串冗余传参。
- **配置双向自愈**：面板地址、App Key、App Secret 既可在 BoxJS 中配置，也可直接在 Loon 插件参数界面的 `[Argument]` 处填入，首次抓取即自动回写持久化。

## 注意

- 每个插件都带 `#!version` 与分钟级 `#!date`，脚本 URL 带 `?v=` 缓存参数；更新后若未生效，删除插件重新导入。
- `camscanner.plugin` 与 `DaiDaiPanel.plugin` 含相同抓取规则，建议只启用主插件 `DaiDaiPanel.plugin` 即可。

# Loon 插件

| 插件 | 功能 | 独立业务开关 |
| :--- | :--- | :--- |
| [**DaiDaiPanel.plugin**](./DaiDaiPanel.plugin) (v1.0.7) | **呆呆面板**：微信读书 / 扫描全能王 / 中国电信凭据捕获并自动同步 | `weread` `camscanner` `telecom` |
| [**ChinaMobile.plugin**](./ChinaMobile.plugin) (v1.0.16) | **中国移动**：净化开屏、首页轮播、专区横幅、和包钱包营销浮层与「我的」弹窗 | HideCarousel 轮播总控及全功能细分开关 |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) | 微信读书：去广告、去更新弹窗、解除试听限制 | 内置总开关 |
| [**BilibiliFix.plugin**](./BilibiliFix.plugin) (v2.8.3) | **哔哩哔哩 𝕏 (白B专用)**：空降助手、分区修复、扫码登录、画质解锁 | 内置总开关 |
| [`PixivEnhanced.plugin`](./PixivEnhanced.plugin) | Pixiv：全页面汉化、AI 漫画翻译、设置中心 | 内置总开关 |
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) | QQ空间：广告与营销内容屏蔽 | 规则型，无需开关 |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) | GitHub：星标列表显示最近推送时间 | 内置总开关 |
| [`LoonMonitor.plugin`](./LoonMonitor.plugin) | 为 iOS 桌面小组件提供运行状态与流量数据 | 内置总开关 |
| [`camscanner.plugin`](./camscanner.plugin) | 扫描全能王：抓取 + 每日签到 | `cookie_capture` `sign_in` |
| [`PixivAdBlock.plugin`](./PixivAdBlock.plugin) (v1.0.0) | Pixiv：小说广告过滤、图片镜像与 Premium 属性注入 (chaoscard 原作) | 规则型，无需开关 |
| [`PSBC.plugin`](./PSBC.plugin) (v1.0.0) | 邮储银行：屏蔽开屏广告、摇一摇与静态资源拦截 (chaoscard 原作) | 规则型，无需开关 |
| [`Telegram.plugin`](./Telegram.plugin) (v1.0.0) | Telegram 增强：优质 IP 调度防转圈、外部 t.me 链接跳转客户端 (chaoscard 原作) | `t.me_redirect` 客户端选择 |
| [**YouTube_Ad.plugin**](./YouTube_Ad.plugin) (v1.0.0) | **YouTube去广告**：移除广告、短片按钮/智能助手/商品/竖屏直播，解锁高码率画质/精彩跳转/通勤模式，内置画中画与后台播放，支持外语字幕中英机翻与QUIC防穿透 | `autoHd` `jumpAhead` `onTheGo` `translation_enabled` 等 11 项精细开关 |
| [**TencentVideo.plugin**](./TencentVideo.plugin) (v1.0.2) | **腾讯视频 · 全量净化**：开屏/前贴/中插/暂停/后贴/锚点/详情页/信息流/搜索/下载页/个人中心/激励/会员推广全量移除，融合简洁模式、底栏开关与 QUIC 防穿透 | `HideShortDrama` `HideVipTab` `HideGoods` 三个底栏开关；tab 记录安全删除，不改其余字段 |

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

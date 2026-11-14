# Loon 插件

| 插件 | 功能 | 独立业务开关 |
| :--- | :--- | :--- |
| [**DaiDaiPanel.plugin**](./DaiDaiPanel.plugin) (v1.0.7) | **呆呆面板**：微信读书 / 扫描全能王 / 中国电信凭据捕获并自动同步 | `weread` `camscanner` `telecom` |
| [**WeReadTasks.plugin**](./WeReadTasks.plugin) (v1.0.0) | **微信读书活动任务**：每日阅读奖励、周二翻牌、周五限免入架 | `capture` `claim` `flip` `free` |
| [**YunDiskTasks.plugin**](./YunDiskTasks.plugin) (v1.1.0) | **移动云盘活动任务**：每日签到云朵领取与 0/10/16 点商品抢兑 | `capture` `sign` `exchange` |
| [**ChinaMobile.plugin**](./ChinaMobile.plugin) (v1.0.16) | **中国移动**：净化开屏、首页轮播、专区横幅、和包钱包营销浮层与「我的」弹窗 | HideCarousel 轮播总控及全功能细分开关 |
| [`WeReadEnhance.plugin`](./WeReadEnhance.plugin) (v4.2.1) | 微信读书：去广告、去更新弹窗、解除试听限制 | 内置总开关 |
| [**BilibiliFix.plugin**](./BilibiliFix.plugin) (v2.8.3) | **哔哩哔哩 𝕏 (白B专用)**：空降助手、分区修复、扫码登录、画质解锁 | 内置总开关 |
| [`PixivEnhanced.plugin`](./PixivEnhanced.plugin) (v4.5.8) | Pixiv：全页面汉化、AI 漫画翻译、设置中心 | 内置总开关 |
| [`QzoneAdBlock.plugin`](./QzoneAdBlock.plugin) (v1.1.0) | QQ空间：广告与营销内容屏蔽 | 规则型，无需开关 |
| [`GitHubPushTime.plugin`](./GitHubPushTime.plugin) (v1.2.0) | GitHub：星标列表显示最近推送时间 | 内置总开关 |
| [`LoonMonitor.plugin`](./LoonMonitor.plugin) (v1.5.0) | 为 iOS 桌面小组件提供运行状态与流量数据 | 内置总开关 |
| [`camscanner.plugin`](./camscanner.plugin) (v1.6.1) | 扫描全能王：抓取 + 每日签到 | `cookie_capture` `sign_in` |
| [`PixivAdBlock.plugin`](./PixivAdBlock.plugin) (v1.0.1) | Pixiv：小说广告过滤、图片镜像与 Premium 属性注入 (chaoscard 原作) | 规则型，无需开关 |
| [`PSBC.plugin`](./PSBC.plugin) (v1.0.0) | 邮储银行：屏蔽开屏广告、摇一摇与静态资源拦截 (chaoscard 原作) | 规则型，无需开关 |
| [`Telegram.plugin`](./Telegram.plugin) (v1.1.0) | Telegram 增强：优质 IP 调度防转圈、外部 t.me 链接跳转客户端 (chaoscard 原作) | `t.me_redirect` 客户端选择 |
| [**YouTube_Ad.plugin**](./YouTube_Ad.plugin) (v1.1.1) | **去广告**：广告 / 短片按钮 / 商品 / 竖屏直播尽除；高码率、通勤模式、画中画、字幕机翻俱备 | `autoHd` `jumpAhead` `onTheGo` `translation_enabled` 等 11 项精细开关 |
| [**TencentVideo.plugin**](./TencentVideo.plugin) (v1.0.11) | **全量净化**：开屏 / 前贴 / 中插 / 暂停 / 后贴 / 激励 / VIP 营销尽数移除 | `HideShortDrama` `HideVipTab` `HideGoods` 三个底栏开关；VIP 会员底栏已关闭 |
| [**TestFlightRelay.plugin**](./TestFlightRelay.plugin) (v1.0.0) | **TestFlight 中转**：请求本地应答、多账号索引合并与详情缓存，Loon 原生适配 | 内置请求脚本 + 5 分钟会话刷新 |
| [**Duolingo.plugin**](./Duolingo.plugin) (v2.0.3) | **订阅解锁**：三处响应注入 Gold 家庭订阅，解锁免广告 / 无限心 / AI 功能 (j4gm4g 原作) | 规则型，无需开关 |
| [**MiguMusic.plugin**](./MiguMusic.plugin) (v1.0.0) | **去广告**：关闭开屏与运营广告、清空营销位、注入 no_ads 权益、拦截推广 SDK | 规则型，无需开关 |

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

# 微信读书 · 防强更去广告精简净化套件

> 专为微信读书 8.2.6 等老版本打造的极简去广告与防强更套件。通过 Loon 内核规则拦截与单次冷启动脚本改写，实现极致纯净与零运行开销。

---

## 插件：微信读书 · 防强更去广告 (`WeReadEnhance.plugin`)

### ⚡ 终极单次触发模式（进软件只触发 1 次）
- **Script 拦截端点极限收敛**：仅匹配 `/(feature|config|reconf|app\/upgrade)/`。只有在应用刚启动加载全局特性时触发 **1 次**，锁定 `upgrade_query_interval = 2147483647` 与 `VIPRightTimerSeconds = 8640000`；
- **移出所有动态心跳**：完全剔除 `mobileSync`、`discoverfeed` 等周期性心跳与信息流，切前后台、切Tab **0 脚本执行**；
- **静态广告秒拒**：`reader/tips` 与 `market/banner` 全由 `[URL Rewrite]` 的 `reject-dict` 秒回 `{}`，**0 脚本执行**；
- **阅读全程静默**：阅读器内翻页、看书、切章 **0 脚本执行**。

### 🎯 痛点根因与解决原理
1. **彻底根治更新弹窗**：通过对 WeRead 10.2.0 脱壳 Mach-O 二进制（`0x100a9d10c - 0x100a9d118`）及 8.2.6 二进制（`0x1009b0718 - 0x1009b0724`）反汇编查明：若配置的 `upgrade_query_interval <= 0`，客户端汇编会触发保底指令回退为 86400 秒（24小时）向苹果商店发起嗅探。
   - 脚本层锁定 `upgrade_query_interval = 2147483647`（约68年）及 `upgrade = 0, notice_type = 0`，从源头彻底阻断客户端向 App Store 触发版本检测；
   - 移除全局拦截 `itunes.apple.com`，彻底根除影响系统级 App Store 搜索、下载与更新的问题。
2. **纯净阅读与去广告**：
   - 阅读器底部特惠浮层与横幅推广通过 `[URL Rewrite] reject-dict` 秒回空字典；
   - 阻断腾讯 APM 性能监控与 CLS 遥测日志上报。

### 📱 订阅链接
```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/WeReadEnhance.plugin
```

### 💡 使用指南
1. 在 Loon 中直接导入上述独立插件链接并开启；
2. 在 iOS 后台彻底上滑退出「微信读书」App；
3. 重新打开微信读书，冷启动时触发 1 次配置锁定后，日常看书翻页全程静默、0 脚本运行。

# 番茄小说 · 极简去广告与特权净化套件

> 适配番茄小说（DragonRead）最新版（包含 7.3.9+ 脱壳实测）。基于可莉极简哲学与三层拦截架构，实现全场景无扰去广告、官方原生免广告特权激活与清爽纯净界面。

---

## 插件：番茄小说 · 极简去广告 (`DragonRead_remove_ads.plugin`)

### ⚡ 为什么原版插件 (kelee.one) 会失效？根因分析

通过对脱壳后的番茄小说 7.3.9 主二进制（`Payload/Reading.app/Reading`，解密体积 476MB）逆向分析发现：

1. **原版仅包含静态分流规则 [Rule]，缺少应用层拦截与数据清洗**：
   - 可莉原版 `DragonRead_remove_ads.lpx` **通篇仅有 34 条域名级 `[Rule]`（DOMAIN, ... REJECT）**，没有任何 `[URL Rewrite]`、`[Script]` 及 `[MITM]` 配置；
2. **核心广告与主业务域名深度耦合**：
   - 番茄小说将开屏广告（`/api/ad/splash/...`）、章节末尾广告位（`/reading/commerceapi/chapter_end/resource/v1/`）、广告聚合分发（`/api/ad/v1/aggregate/`）以及穿山甲/巨量广告（`/api/ad/union/sdk/get_ads/`）全部收敛在主业务域名 `*.fqnovel.com` 下；
   - 由于 `fqnovel.com` 同时承载了书籍正文下载、书架同步、目录等核心功能，**不能在 [Rule] 中将该域名直接 REJECT**。在没有应用层解密改写的前提下，所有广告请求全部直达客户端，导致去广告实质性全面失效；
3. **穿山甲广告联盟新域名与素材 CDN 覆盖缺失**：
   - 7.3.x 升级了穿山甲/巨量广告 SDK（`pangolin-sdk-toutiao.com`、`pglstatp-toutiao.com`、`pangle.io` 等）及动态签名素材 CDN（`*-ad-sign.byteimg.com`），原规则未作完整覆盖；
4. **福利挂件与营销 Tab 未作处理**：
   - 悬浮金币球、计时器挂件（`/luckycat/crossover/v\d/get_timer_widget`）和福利金币任务（`/luckycat/activity/`、`/luckycat/novel/page/ios_task`）仍在下发；
5. **未激活官方原生免广告通道**：
   - 客户端通过 `/api/novel/account/v1/vip/info/` 判定用户是否具备免广告特权（`is_vip`, `ad_free`, `expire_time`）。原版未作改写，客户端自然按免费带广告用户展示全部广告。

---

### 🎯 本次修复方案（可莉式极简三层拦截架构）

$$\text{Rule (0ms/0脚本)} > \text{Rewrite v2 (<1ms/0脚本)} > \text{Script v2 (5~50ms/JS沙箱)}$$

1. **【第一层：Rule】静态域名级秒拒（0ms，0脚本）**：
   - 阻断穿山甲 SDK、广告联盟、监控埋点、数据上报及动态签名素材 CDN；
   - 保护正常书籍封面与图片 CDN 不受误杀；
2. **【第二层：URL Rewrite】内核级秒回空字典（<1ms，0脚本）**：
   - 开屏广告配置与实时库存接口直接 `reject-dict` 秒回 `{}`，消除冷启动黑屏与跳过倒计时等待；
   - 章节末尾广告资源位与商业化混排直接秒回空字典，翻页时不唤起 JS 沙箱；
   - 悬浮金币球、计时器小部件与激励视频弹窗直接秒回空字典；
3. **【第三层：Script】官方原生免广告特权激活与底栏纯净化**：
   - 改写 `/api/novel/account/v1/vip/info/`，向客户端注入终身免广告（`is_vip: 1`, `ad_free: 1`, `expire_time: 4070880000`）；
   - 客户端自动开启**官方原生免广告排版**，彻底杜绝阅读器排版抖动与空白占位；
   - 正文流广告字段精准兜底剥离（绝不触碰小说正文文字内容，零误杀）；
   - 过滤底栏多余福利/赚钱 Tab，还原书架与书城极简布局。

---

### 📱 订阅链接

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/DragonRead_remove_ads.plugin
```

---

### 💡 使用指南

1. 在 Loon 中进入「插件」→ 右上角「+」→「从 URL 导入」；
2. 粘贴上述插件订阅地址并保存开启；
3. 确保 Loon 的 MitM CA 证书已安装并受系统信任；
4. 在 iOS 任务后台彻底上滑退出「番茄小说」App；
5. 重新打开番茄小说，享受清爽纯净的阅读体验！

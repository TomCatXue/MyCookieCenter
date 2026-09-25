# 微信读书 · 防强更与去广告精简净化

> 专为 8.2.6 等具备无限制 VALL-E AI 大模型免费听书特性的老版本微信读书打造。全面融合防强更、版本弹窗抹平、全界面去广告、红点清理与阅读界面精简，打造极致纯净的阅读与 AI 听书体验。

---

## 🎯 痛点根因与解决原理

### 为什么之前过一段时间就会蹦出“发现新版本”弹窗？
1. **拦截端点单一漏网**：微信读书检查版本更新不仅通过 `/feature`，还会通过 `/config`、`/reconf`、`/mobileSync`（移动端增量配置同步）等多路接口协同轮询；
2. **字段名称多变**：服务端在不同接口或不同活动期，使用的字段名不仅有 `upgrade`，还有 `forceUpdate`、`has_new_version`、`updateInfo`、`notice_msg` 等；如果仅对特定固定字段置零，一旦接口返回其他升级结构，App 就会解析出更新提示；
3. **域名覆盖不全**：部分请求会发往 `weread.qq.com` 而非 `i.weread.qq.com`。

### 全面升级后的 6 重防御与精简机制
- **全端点协同拦截**：全面覆盖 `/(feature|config|reconf|app/upgrade|mobileSync|book|groups|review|discoverfeed|user/profile)`；
- **全域名 MITM 解密**：同时支持 `i.weread.qq.com` 与 `weread.qq.com`；
- **通用正则递归深度遍历**：脚本内置 `deepSanitize` 引擎，无论是根节点还是嵌套子节点，只要命中升级、强更、版本更新、公告弹窗的字段，全自动将其强制归零、置空或剔除；
- **特性特别锁定**：在 `feature` 节点强制注入 `VIPRightTimerSeconds = 8640000`、`disableUpgrade = 1`、`closeUpgrade = 1`，消除客户端内嵌的倒计时检查，锁定 8.2.6 免费 AI 听书；
- **阅读页面极简无干扰**：全面净化 `book/readingStat`（清空好友读完数、在读人数与今日统计）、`book/chapterReview`（章节评论与分享数字置零）、`groups/readerEntrance`（隐藏阅读器内小圈子入口）、`review/list`（想法与点评干扰清空）；
- **主界面与发现流去广告**：融合 `discoverfeed/new` 与 `discoverfeed/get` 广告卡片过滤，消除 `mobileSync` 中的底部与发现页红点、故事流更新与通知计数，净化 `user/profile` 勋章与兑换提示；
- **Base64 / 明文全透明双模支持**：自动适配 `i.weread.qq.com` 的 Base64 编码机制，避免因编码格式不同抛出 SyntaxError。

---

## 📱 使用指南

### 1. 订阅安装
在 Loon 中直接导入独立插件文件：
```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/WeReadEnhance.plugin
```

### 2. 彻底清除 App 本地已有的更新弹窗缓存
> **重要提示**：如果之前微信读书已经弹出了更新提示，说明新版本信息已被写入 iOS 本地缓存中。
> 1. 请先在 iOS 后台**彻底上滑退出「微信读书」App**；
> 2. 在 Loon 中更新安装本插件并确保开关处于开启状态；
> 3. 重新打开微信读书 App，由于请求被全面净化，旧缓存将被彻底刷掉，此后不会再弹出任何更新弹窗。

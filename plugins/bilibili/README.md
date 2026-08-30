# 哔哩哔哩·增强版 𝕏

本目录收录哔哩哔哩相关的核心辅助与修复脚本：

- **`bilibili_region.js`**：分区列表修复脚本，提供全套 17 个官方分区数据与二级分类跳转协议（基于 BiliUniverse 完整架构）。
- **`bilibili_qrcode.js`**：扫码登录修复脚本，使用 B 站官方私钥自动生成 MD5 `sign` 签名并完成服务端确认授权，彻底解决扫码登录失效问题。
- **`bilibili_sponsor.js`**：原生双引擎空降助手，从 SponsorBlock 数据库与弹幕中提取高能打点并注入进度条。
- **`bilibili_vip.js`**：大会员凭证注入脚本，支持填入第三方 `Authorization` 凭证解锁专享番剧。

---

## 对应 Loon 插件

- [`loon/BilibiliFix.plugin`](../../loon/BilibiliFix.plugin)

## 使用方法

直接在 Loon 中导入 `BilibiliFix.plugin` 即可使用。

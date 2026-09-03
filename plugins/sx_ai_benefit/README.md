# 山西电信·体验AI领福利

专门针对中国电信“体验AI领福利”活动定制的凭证自动捕获与领取辅助插件。

---

## 解决证书报错问题

中国电信 APP（`CtClient`）对原生 API 域名（如 `client.189.cn`、`api.189.cn`、`*.189.cn`）启用了严格的 **SSL Pinning（证书锁定）** 安全机制。如果将这些域名加入 MITM 解密列表，电信 APP 在检测到第三方伪造证书后会主动断开并提示“证书错误”。

该功能经过专门优化：
- **零干扰原生业务**：针对山西电信只解密活动 H5 页面专用域名 `wx.sx.189.cn`，电信 APP 的原生登录、首页、AI 搜索等网络请求直连通行，彻底根除证书报错。
- **活动容器友好**：`wx.sx.189.cn` 运行在 WebKit 网页容器中，完美兼容 Loon 根证书，安全捕获活动凭据与活动代码。

---

## 使用说明

1. 在 Loon 中导入 [`loon/CookieCenter.plugin`](../../loon/CookieCenter.plugin) 并开启「山西电信·凭证捕获」。
2. 在 BoxJS 中添加 [`boxjs/CookieCenter.boxjs.json`](../../boxjs/CookieCenter.boxjs.json) 订阅，可在面板中配置月度权益目标与 Cookie。
3. 打开中国电信 APP 首页，AI 搜索“领福利”，点击卡片进入活动页面。
4. 首次捕获到新批次凭据时，Loon 会推送单次通知；同批次后续进入只静默刷新，不再打扰。

> 原先独立的 `SxAiBenefit.plugin` 已合并进 `loon/CookieCenter.plugin`，不再单独发布。

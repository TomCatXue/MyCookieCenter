# 微信读书 · 防强更与全弹窗净化

> 专为 8.2.6 等具备无限制 VALL-E AI 大模型免费听书特性的老版本微信读书打造。通过对服务端下发配置的深度递归遍历与多端点阻断，彻底解决“过一段时间就蹦出版本更新弹窗”的问题。

---

## 🎯 痛点根因与解决原理

### 为什么之前过一段时间就会蹦出“发现新版本”弹窗？
1. **拦截端点单一漏网**：微信读书检查版本更新不仅通过 `/feature`，还会通过 `/config`、`/reconf`、`/mobileSync`（移动端增量配置同步）等多路接口协同轮询；
2. **字段名称多变**：服务端在不同接口或不同活动期，使用的字段名不仅有 `upgrade`，还有 `forceUpdate`、`has_new_version`、`updateInfo`、`notice_msg` 等；如果仅对特定固定字段置零，一旦接口返回其他升级结构，App 就会解析出更新提示；
3. **域名覆盖不全**：部分请求会发往 `weread.qq.com` 而非 `i.weread.qq.com`。

### 升级后的 4 重防御机制
- **全端点协同拦截**：全面覆盖 `/(feature|config|reconf|app/upgrade|mobileSync)`；
- **全域名 MITM 解密**：同时支持 `i.weread.qq.com` 与 `weread.qq.com`；
- **通用正则递归深度遍历**：脚本内置 `deepSanitize` 引擎，无论是根节点还是嵌套子节点，只要命中升级、强更、版本更新、公告弹窗的字段，全自动将其强制归零、置空或剔除；
- **特性特别锁定**：在 `feature` 节点强制注入 `VIPRightTimerSeconds = 8640000`、`disableUpgrade = 1`、`closeUpgrade = 1`，消除客户端内嵌的倒计时检查。

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

# 翼支付 · 权益币与签到秒刷助手

进入翼支付 App 的“赚钱专区 / 绿色能量”页面瞬间，全自动一键秒收所有权益币与能量球、自动完成每日签到打卡并开启每日宝箱。

---

## 核心功能

- **一键全收**：自动触发底层 `starReceive`，一秒收光树上所有漂浮的权益币与绿色能量球。
- **自动签到**：自动调用 `distributePrize` 完成每日签到打卡并领取签到奖励。
- **自动开宝箱**：自动调用 `openTreasureBox` 领取每日福利宝箱。
- **双重拟态反馈**：
  - 页面顶部优雅的深色玻璃拟态 HUD，实时呈现执行进度并自动淡出。
  - 全部完成后推送 iOS 系统横幅通知。

---

## 为什么这种方式最稳？

翼支付客户端基于阿里/蚂蚁 mPaaS 原生容器开发，网络接口使用了国密 SM2 双向非对称加密。本插件采用**安全无感的前端注入模式**：
- 借助 App 自身已授权的原生 JSBridge（`AlipayJSBridge`）执行；
- **100% 官方正规通道发包**，零风控、零封号风险、绝不引发任何“证书错误”。

---

## 使用方法

### 方式 A：通过 BoxJS 统一管理（推荐）
在 Loon 中安装 [`loon/CookieCenter.plugin`](../../loon/CookieCenter.plugin)，在 BoxJS 中订阅 [`boxjs/CookieCenter.boxjs.json`](../../boxjs/CookieCenter.boxjs.json)，即可在“翼支付·权益币助手”面板中管理开关。

> 原先独立的 `BestpayCoin.plugin` 已合并进 `loon/CookieCenter.plugin`，不再单独发布。

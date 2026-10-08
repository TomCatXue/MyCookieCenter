# BoxJS 订阅

本目录存放 BoxJS 面板订阅文件，负责**签到、羊毛等任务**的配置与管理——Cookie 持久化、偏好参数设置、任务查看与手动运行入口等。

> 架构遵循 Cookie 抓取与签到执行彻底分离模式：[`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) 专职负责 MITM 凭据捕获；本目录的 BoxJS 订阅统一提供 Cookie 持久化、偏好参数配置、各任务查看、手动一键执行与定时任务调度。

---

## 订阅文件

| 文件 | 说明 | 包含核心应用 |
|---|---|---|
| [`CookieCenter.boxjs.json`](./CookieCenter.boxjs.json) | 统一配置面板订阅 | **微信读书**（阅读奖励、翻牌抽奖、限免好书）<br>**中国电信**（周三会员日双抽奖、幸运抽奖、等级话费秒杀、山西领福利） |

---

## 订阅地址

在 BoxJS 中添加订阅，填入以下地址：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/CookieCenter.boxjs.json
```

## 面板功能

| 应用 | 覆盖模块 | 说明 |
|---|---|---|
| **微信读书** | 每日阅读奖励、周二翻牌抽奖、每周限免好书 | 自动脱机换票更新凭据，偏好设置灵活切换 |
| **中国电信** | 周三双抽奖、幸运抽奖、等级话费抢兑、山西福利 | 整合中国电信全系业务，进小程序即时全自动秒领，内置 C005 混合加解密 |

# BoxJS 订阅

本目录存放 BoxJS 面板订阅文件，负责**签到、羊毛等任务**的配置与管理——Cookie 持久化、偏好参数设置、任务查看与手动运行入口等。

> 架构遵循 Cookie 抓取与签到执行彻底分离模式：[`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) 专职负责 MITM 凭据捕获（零 Cron）；本目录的 BoxJS 订阅统一提供 Cookie 持久化、偏好参数配置、各任务查看、手动一键执行与定时任务调度。
> `plugins/` 下的独立功能插件是无状态的请求/响应改写，通过各自的 Loon 插件 `#!switch` 管理，不纳入 BoxJS；`plugins/sx_ai_benefit/`、`plugins/bestpay_coin/` 属于 CookieCenter 体系，脚本与任务已纳入本订阅。

---

## 职责分工

| 职责 | 位置 | 说明 |
|---|---|---|
| **凭据抓取** | `loon/CookieCenter.plugin` | 专职 Cookie 抓取插件（无 Cron），各应用独立开关控制 |
| **任务与订阅** | `boxjs/CookieCenter.boxjs.json` | 统一管理定时任务（Cron）、Cookie 持久化、偏好设置与手动运行 |
| **解锁/净化** | `plugins/` + `loon/*.plugin` | 无状态请求/响应改写，独立开关 |

---

## 订阅文件

| 文件 | 说明 |
|---|---|
| [`CookieCenter.boxjs.json`](./CookieCenter.boxjs.json) | 微信读书 / 山西电信 / 翼支付的统一配置面板 |

---

## 订阅地址

在 BoxJS 中添加订阅，填入以下地址：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/CookieCenter.boxjs.json
```

## 面板功能

每个 App 对应一组 BoxJS 设置，通常包含：

| key 类型 | 说明 |
|---|---|
| `<脚本名>_data` | Cookie / 鉴权信息（自动捕获，也可手动粘贴） |
| `<脚本名>_clear` | 开启后下次运行会清空已存数据，强制重新抓取 |
| `<脚本名>_debug` | 打印完整 headers / body 到 console |
| `<脚本名>_sign_time` | 签到 cron 时间记录 |

具体参数见各脚本子目录的 README。

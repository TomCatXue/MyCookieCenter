# BoxJS 订阅

本目录存放 BoxJS 面板订阅文件，负责**签到、羊毛等任务**的配置与管理——Cookie 持久化、偏好参数设置、任务查看与手动运行入口等。

> [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) 负责 MITM 凭据捕获与 Loon cron 后台自动定时任务；本目录的 BoxJS 订阅提供 Cookie 持久化、参数配置与手动运行入口（BoxJS 本身无后台守护进程，后台定时执行必须依赖 Loon 的 cron 引擎）。
> `plugins/` 下的独立功能插件是无状态的请求/响应改写，通过各自的 Loon 插件 `#!switch` 管理，不纳入 BoxJS；`plugins/sx_ai_benefit/`、`plugins/bestpay_coin/` 属于 CookieCenter 体系，脚本与任务已纳入本订阅。

---

## 职责分工

| 职责 | 位置 | 说明 |
|---|---|---|
| **MITM + cron** | `loon/CookieCenter.plugin` | 凭据捕获规则 + Loon 后台 cron 定时任务，各 App 独立开关 |
| **BoxJS 面板** | `boxjs/CookieCenter.boxjs.json` | Cookie 持久化、偏好设置、任务查看与手动运行 |
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

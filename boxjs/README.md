# BoxJS 订阅

本目录存放 BoxJS 面板订阅文件，负责**签到、羊毛等 cron 定时任务**的管理——Cookie 持久化、签到时间、调试开关等。

> Cookie **抓取**由 [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) 负责（纯 http-request，每个 App 独立开关）。
> `plugins/` 下的解锁/净化插件是无状态的请求/响应改写，通过 Loon 插件自身的 `#!switch` 开关管理，不纳入 BoxJS。

---

## 职责分工

| 职责 | 位置 | 说明 |
|---|---|---|
| **抓 Cookie** | `loon/CookieCenter.plugin` | http-request 被动拦截，整合 60+ App |
| **签到/羊毛** | `boxjs/CookieCenter.boxjs.json` | cron 定时执行，Cookie 持久化 |
| **解锁/净化** | `plugins/` + `loon/*.plugin` | 无状态请求/响应改写，独立开关 |

---

## 订阅文件

| 文件 | 说明 |
|---|---|
| [`CookieCenter.boxjs.json`](./CookieCenter.boxjs.json) | 签到合集订阅，包含所有 `app/` 脚本的签到配置面板 |

---

## 订阅地址

在 BoxJS 中添加订阅，填入以下地址：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/CookieCenter.boxjs.json
```

## 面板功能

每个 App 签到脚本对应一组 BoxJS 设置，通常包含：

| key 类型 | 说明 |
|---|---|
| `<脚本名>_data` | Cookie / 鉴权信息（自动捕获，也可手动粘贴） |
| `<脚本名>_clear` | 开启后下次运行会清空已存数据，强制重新抓取 |
| `<脚本名>_debug` | 打印完整 headers / body 到 console |
| `<脚本名>_sign_time` | 签到 cron 时间记录 |

具体参数见各脚本子目录的 README。

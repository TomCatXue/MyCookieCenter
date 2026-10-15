# BoxJS 订阅

本目录存放 BoxJS 面板订阅文件，负责**凭据持久化、完备度诊断、一键复制到青龙**等管理功能。

> 架构遵循 Cookie 抓取与签到执行彻底分离模式：[`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) 专职负责真机 MITM 凭据捕获；本目录的 BoxJS 订阅统一提供凭据持久化回显与一键复制青龙环境变量，所有定时签到任务全面收归青龙面板调度。清空凭据使用 BoxJS 原生「清除数据」即可，无需额外开关。

---

## 订阅文件

| 文件 | 说明 | 包含核心应用 |
|---|---|---|
| [`CookieCenter.boxjs.json`](./CookieCenter.boxjs.json) | 统一凭据捕获与导出订阅 | **微信读书**（WEREAD_AUTH 完整凭证）<br>**中国电信**（5G会员抽奖 SessionKey、营业厅等级权益秒杀、山西福利）<br>**扫描全能王**（camscanner_data） |

---

## 订阅地址

在 BoxJS 中添加订阅，填入以下地址：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/CookieCenter.boxjs.json
```

## 面板功能

| 应用 | 覆盖模块 | 说明 |
|---|---|---|
| **微信读书** | 微信读书 App 凭据与翻牌 H5 Cookie | 支持「我」的页面 +「周二翻牌」双向自动补全；数据查看器原生复制按钮一键取用 |
| **中国电信** | 5G会员抽奖、营业厅等级权益秒杀、山西福利 | 拆分独立模块，凭据字段采用 textarea 自适应排版，便于长按全选 |
| **扫描全能王** | 用户属性凭据 (token / client_id / cs_ept_d) | 捕获回显，供外部签到脚本取用 |

> **复制凭据**：点击任意数据行会打开 BoxJS 原生「数据查看器」，其中 key / value 各带复制按钮；应用卡片右上角 ⋮ 还提供「复制数据」。**清空凭据**：同菜单下的「清除数据」，或数据行右侧 ✕。

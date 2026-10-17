<h1 align="center">MyCookieCenter</h1>

<p align="center">
  <b>签到自动化 · Cookie 捕获 · 网络代理增强</b><br>
  Loon / Surge / Quantumult X / Stash · 青龙面板
</p>

<p align="center">
  <a href="https://github.com/TomCatXue/MyCookieCenter/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/TomCatXue/MyCookieCenter?style=flat-square&color=4285dd" /></a>
  <a href="https://github.com/TomCatXue/MyCookieCenter/issues"><img alt="issues" src="https://img.shields.io/github/issues/TomCatXue/MyCookieCenter?style=flat-square&color=4285dd" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/github/license/TomCatXue/MyCookieCenter?style=flat-square&color=4285dd" /></a>
  <img alt="Loon" src="https://img.shields.io/badge/Loon-✔-22c55e?style=flat-square" />
  <img alt="Qinglong" src="https://img.shields.io/badge/青龙-✔-f97316?style=flat-square" />
</p>

自用的签到自动化、Cookie 抓取与代理增强脚本合集，**有什么需求、建议、问题直接提 [Issues](https://github.com/TomCatXue/MyCookieCenter/issues/new)**，觉得好用请点个 ⭐ 鼓励一下~

> [!TIP]
> **抓取与执行彻底分离**：`.plugin` 只负责抓 Cookie 并通知，业务执行全部交给青龙面板。
> 抓完凭据即可关掉对应 MITM 开关，不占代理资源。

## 脚本列表

> 点击表格中的 **[安装]** 直接导入 Loon 插件；**[说明]** 查看该模块的详细文档。

|     | 名称 | 功能 | 安装 / 说明 |
| :-: | :--- | :--- | :---: |
| <img src="icons/icon.png" height="16" /> | **Cookie 抓取合集** | 微信读书 / 中国电信 / 扫描全能王 凭据捕获，抓到即通知 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin)** / **[说明](./loon/README.md)** |
| <img src="icons/weread.png" height="16" /> | **微信读书 增强** | 去广告、去更新弹窗、解除试听限制 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/WeReadEnhance.plugin)** / **[说明](./scripts/tools/wxread_enhance/)** |
| <img src="icons/qq.png" height="16" /> | **QQ空间 清净** | 屏蔽空间广告与营销内容 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/QzoneAdBlock.plugin)** / **[说明](./loon/README.md#qq空间-清净)** |
| <img src="https://github.githubassets.com/favicons/favicon.png" height="16" /> | **GitHub 星标时间** | 星标列表显示最近推送时间 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/GitHubPushTime.plugin)** / **[说明](./scripts/tools/github/)** |
| <img src="icons/pixiv.png" height="16" /> | **Pixiv 全局翻译** | 日文深度汉化 · AI 漫画翻译 · 设置中心 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/PixivEnhanced.plugin)** / **[说明](./scripts/tools/pixiv/)** |
| <img src="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c5/8d/9c/c58d9cbb-7d9c-8e05-4b81-74a950b559c9/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/64x64bb.jpg" height="16" /> | **哔哩哔哩 𝕏** | 空降助手 · 分区修复 · 扫码登录 · 画质解锁 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/BilibiliFix.plugin)** / **[说明](./scripts/tools/bilibili/)** |
| <img src="https://raw.githubusercontent.com/luestr/IconResource/main/App_icon/120px/Loon.png" height="16" /> | **Loon 监控** | 为桌面小组件提供运行状态与流量数据 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/LoonMonitor.plugin)** / **[说明](./scripts/tools/loon/)** |
| <img src="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/26/ff/f2/26fff2c0-729b-5216-0c13-7d0499f10940/AppIconLite-0-0-1x_U007ephone-0-6-0-0-sRGB-85-220.png/64x64bb.jpg" height="16" /> | **扫描全能王 签到** | 抓取 Cookie + 每日签到（含外部签到脚本） | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/camscanner.plugin)** / **[说明](./scripts/tools/camscanner/)** |

## 青龙任务

> 在青龙「订阅管理」添加：`ql repo https://github.com/TomCatXue/MyCookieCenter.git "ql_script" "" "README" "main"`

| 任务 | 定时 | 功能 | 环境变量 |
| :--- | :--- | :--- | :--- |
| **微信读书 · 全功能** | `0 23 * * 0` | 阅读领卡 + 翻牌抽奖 + 限免入架，内置脱机换票 | `WEREAD_AUTH` |
| **中国电信 · 每日聚合** | `0 9 * * *` | 签到金豆 + 周三双抽奖 + 幸运抽奖 + 权益包 + AI 赢 Pad | `dxlin` |
| **中国电信 · 0 点权益** | `59 23 * * *` | 每日限量 102 份，毫秒级抢兑等级权益 | `dxlin` |
| **中国联通 · 每日聚合** | `30 10 * * *` | 签到红包 + 爱听积分 + 权益超市 + 云盘 | `chinaUnicom_data` |

`dxlin` 格式：`手机号#服务密码#AndroidID[#SessionKey]`，多账号换行或 `&` 分隔。

## 如何安装

**1. 安装代理工具**

推荐 [Loon](https://apps.apple.com/app/loon/id1373567447)（本仓库 `.plugin` 为 Loon 格式），或 Surge / Quantumult X / Stash。

**2. 导入插件**

Loon →「插件」→ 右上角 **+** → 粘贴上表中的 **[安装]** 链接。

**3. 抓取凭据**

打开 `Cookie 抓取合集` 中对应 App 的开关 → 进入该 App 触发一次请求 → 收到 `✅ Cookie 获取成功` 即完成。

> [!IMPORTANT]
> **微信读书**需要走两步：先进「我」的页面，再去「周二翻牌」页，这样 App 票据和 Web 票据才完整。

**4. 复制到青龙**

BoxJS 添加订阅 `https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/boxjs/CookieCenter.boxjs.json`，
点击数据行 → 在**数据查看器**中复制该值 → 粘贴为青龙环境变量。

> [!NOTE]
> `loon/camscanner.plugin` 与 `CookieCenter.plugin` 含相同抓取规则，同时开启会重复通知，**只保留一个即可**。

## 常见问题

<details>
<summary><b>抓到了 Cookie 但没收到通知？</b></summary>

先确认插件里对应开关已打开，再检查 App 是否走到了规则匹配的接口。同一页面并发请求会在 10 秒内去重，属正常现象；换新凭据时必定通知。
</details>

<details>
<summary><b>BoxJS 里能看到凭据，但青龙跑不起来？</b></summary>

电信脚本读的是 `dxlin`，不是单独的手机号或 SessionKey。请按 `手机号#服务密码#AndroidID` 拼装，SessionKey 可选作第 4 段。
</details>

<details>
<summary><b>更新插件后代码没变化？</b></summary>

每个插件带 `#!version` 与分钟级 `#!date`，脚本 URL 带 `?v=` 缓存参数。Loon 里删除后重新导入即可穿透缓存。
</details>

## 目录

| 目录 | 内容 |
| :--- | :--- |
| [`loon/`](./loon/) | Loon 插件（`.plugin`） |
| [`boxjs/`](./boxjs/) | BoxJS 订阅配置 |
| [`ql_script/`](./ql_script/) | 青龙面板脚本 |
| [`scripts/`](./scripts/) | 脚本源码（weread / telecom / tools） |
| [`icons/`](./icons/) | 图标资源 |

## 状态说明

✅ 已验证 ｜ 🧪 待验证 ｜ ⚠️ 受限 ｜ 📦 已归档

## License

[MIT](./LICENSE)

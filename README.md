<h1 align="center">MyCookieCenter</h1>

<p align="center">
  <b>签到自动化 · Cookie 捕获 · 网络代理增强</b><br>
  Loon / Surge / Quantumult X / Stash · 青龙面板
</p>

<p align="center">
  <a href="https://github.com/TomCatXue/MyCookieCenter/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/TomCatXue/MyCookieCenter?style=flat-square&color=4285dd" /></a>
  <a href="https://github.com/TomCatXue/MyCookieCenter/issues"><img alt="issues" src="https://img.shields.io/github/issues/TomCatXue/MyCookieCenter?style=flat-square&color=4285dd" /></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/github/license/TomCatXue/MyCookieCenter?style=flat-square&color=4285dd" /></a>
</p>

把散落在各个 App 里的签到、领券和抓包配置收拢到一处：
Loon 负责抓 Cookie，青龙负责跑任务，BoxJS 负责查看和复制凭据。

遇到问题、想加新站点，欢迎提 [Issues](https://github.com/TomCatXue/MyCookieCenter/issues/new)；用着顺手的话，点个 ⭐ 就好。

## 脚本列表

|     | 名称 | 功能 | 安装 / 说明 |
| :-: | :--- | :--- | :---: |
| <img src="icons/icon.png" height="16" /> | **Cookie 抓取合集** | 微信读书 / 中国电信 / 扫描全能王 凭据捕获，抓到即通知 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/CookieCenter.plugin)** / **[说明](./loon/README.md)** |
| <img src="icons/weread.png" height="16" /> | **微信读书 增强** | 去广告、去更新弹窗、解除试听限制 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/WeReadEnhance.plugin)** / **[说明](./scripts/tools/wxread_enhance/)** |
| <img src="icons/qq.png" height="16" /> | **QQ空间 清净** | 屏蔽空间广告与营销内容 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/QzoneAdBlock.plugin)** / **[说明](./loon/README.md)** |
| <img src="https://github.githubassets.com/favicons/favicon.png" height="16" /> | **GitHub 星标时间** | 星标列表显示最近推送时间 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/GitHubPushTime.plugin)** / **[说明](./scripts/tools/github/)** |
| <img src="icons/pixiv.png" height="16" /> | **Pixiv 全局翻译** | 日文深度汉化 · AI 漫画翻译 · 设置中心 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/PixivEnhanced.plugin)** / **[说明](./scripts/tools/pixiv/)** |
| <img src="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/c5/8d/9c/c58d9cbb-7d9c-8e05-4b81-74a950b559c9/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/64x64bb.jpg" height="16" /> | **哔哩哔哩 𝕏** | 空降助手 · 分区修复 · 扫码登录 · 画质解锁 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/BilibiliFix.plugin)** / **[说明](./scripts/tools/bilibili/)** |
| <img src="https://raw.githubusercontent.com/luestr/IconResource/main/App_icon/120px/Loon.png" height="16" /> | **Loon 监控** | 为桌面小组件提供运行状态与流量数据 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/LoonMonitor.plugin)** / **[说明](./scripts/tools/loon/)** |
| <img src="https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/26/ff/f2/26fff2c0-729b-5216-0c13-7d0499f10940/AppIconLite-0-0-1x_U007ephone-0-6-0-0-sRGB-85-220.png/64x64bb.jpg" height="16" /> | **扫描全能王 签到** | 抓取 Cookie + 每日签到 | **[安装](https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/camscanner.plugin)** / **[说明](./scripts/tools/camscanner/)** |

> `Cookie 抓取合集` 的开关默认全关，按需开启；微信读书要先打开「我」的页面，再打开「周二翻牌」页面才能捕获完整凭据。
> `camscanner.plugin` 与 `CookieCenter.plugin` 含相同抓取规则，只保留一个即可。

## 青龙任务

```text
ql repo https://github.com/TomCatXue/MyCookieCenter.git "ql_script" "" "README" "main"
```

|     | 任务 | 功能 | 定时 · 变量 |
| :-: | :--- | :--- | :---: |
| <img src="icons/weread.png" height="16" /> | **微信读书** | 阅读领卡 + 翻牌抽奖 + 限免入架，内置脱机换票 | `0 23 * * 0` · `WEREAD_AUTH` |
| <img src="icons/189.png" height="16" /> | **中国电信 · 每日** | 签到金豆 + 周三双抽奖 + 幸运抽奖 + 权益包 + AI 赢 Pad | `0 9 * * *` · `dxlin` |
| <img src="icons/189.png" height="16" /> | **中国电信 · 0 点** | 每日限量 102 份，毫秒级抢兑等级权益 | `59 23 * * *` · `dxlin` |
| <img src="https://github.com/ChinaTelecomOperators/ChinaUnicom/releases/download/Prerelease-Alpha/icon.png" height="16" /> | **中国联通** | 签到红包 + 爱听积分 + 权益超市 + 云盘 | `30 10 * * *` · `chinaUnicom_data` |

> `dxlin` 格式：`手机号#服务密码#AndroidID[#SessionKey]`，多账号换行或 `&` 分隔。

## License

[MIT](./LICENSE)

## 免责声明

本项目仅供**个人学习研究与自用自动化**，请勿用于商业用途、批量操作或违反平台服务条款的行为。

脚本会接触你的账号凭据，但全部只保存在**你自己的设备与面板**中，本仓库不上传、不收集任何数据。

使用所产生的账号异常、积分变动、服务受限等后果由使用者自行承担。部分脚本改编自社区开源项目，版权归原作者所有；如认为内容侵权，请提 Issue 联系删除。

完整条款见 [DISCLAIMER.md](./DISCLAIMER.md)。

# 特殊功能插件

本目录收录两类内容：

1. **CookieCenter 受管权益脚本**（`sx_ai_benefit/`、`bestpay_coin/`）：由 [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) 与 [`boxjs/CookieCenter.boxjs.json`](../boxjs/CookieCenter.boxjs.json) 统一管理；
2. **独立功能插件**：解锁会员、首页净化、请求改写等非签到类脚本，与 CookieCenter 体系相互独立。

---

## 与 `app/` 的区别

| 维度 | `app/`（签到体系） | `plugins/`（功能插件） |
|---|---|---|
| 目的 | 抓 Cookie + 定时签到 | 改写请求/响应，实时生效 |
| 触发 | `http-request` 抓取 + `cron` 签到 | 仅 `http-request` 或 `http-response` 被动拦截 |
| 状态 | 需 BoxJS / `$persistentStore` 持久化 | 一般无状态 |
| Loon 插件 | `loon/CookieCenter.plugin` 聚合 | 每插件独立 `loon/<Name>.plugin` |
| BoxJS | ✅ 纳入 `boxjs/` 订阅 | ❌ 不纳入，通过插件自身 `#!switch` 管理 |
| 开关粒度 | 插件仅保留凭据捕获开关，定时任务由 BoxJS 订阅管理 | 每插件单开关 |

---

## 插件清单

| 目录 | 名称 | 功能 | Loon 插件 | 状态 |
|---|---|---|---|---|
| — | QQ空间·清净 | 广告退散，空间清净（纯规则型，无需脚本） | [`loon/QzoneAdBlock.plugin`](../loon/QzoneAdBlock.plugin) | ✅ 已验证 |
| [`wxread/`](./wxread/) | 微信读书·优雅收录 | 轻触订阅人数，好书即刻入架 | [`loon/WeReadEnhance.plugin`](../loon/WeReadEnhance.plugin) | ✅ 已验证 |
| [`bilibili/`](./bilibili/) | 哔哩哔哩·增强版 𝕏 | 空降助手、分区修复、扫码登录、画质解锁 | [`loon/BilibiliFix.plugin`](../loon/BilibiliFix.plugin) | ✅ 已验证 |
| [`github_push_time/`](./github_push_time/) | GitHub·星标推送时间 | 在 GitHub App 星标列表语言后显示最近推送时间 | [`loon/GitHubPushTime.plugin`](../loon/GitHubPushTime.plugin) | ✅ 已验证 |
| [`pixiv_novel_translate/`](./pixiv_novel_translate/) | Pixiv·小说翻译 | 在 Pixiv 小说阅读页注入翻译按钮，支持 Google / 微软 / 百度 | [`loon/PixivNovelTranslate.plugin`](../loon/PixivNovelTranslate.plugin) | ✅ 已验证 |

---

## CookieCenter 受管目录

| 目录 | 名称 | 功能 | Loon 入口 | BoxJS |
|---|---|---|---|---|
| [`sx_ai_benefit/`](./sx_ai_benefit/) | 山西电信·体验AI领福利 | 凭证捕获 + 每月 1~8 号放水探针监控 | [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) | [`boxjs/CookieCenter.boxjs.json`](../boxjs/CookieCenter.boxjs.json) |
| [`bestpay_coin/`](./bestpay_coin/) | 翼支付·权益币与绿色能量 | 进页面自动收币、签到与开宝箱 | [`loon/CookieCenter.plugin`](../loon/CookieCenter.plugin) | [`boxjs/CookieCenter.boxjs.json`](../boxjs/CookieCenter.boxjs.json) |

> 这两个目录原本作为独立 `.plugin` 发布；现其 MITM 捕获/注入规则已并入 `CookieCenter.plugin`，定时任务规则由 BoxJS 订阅维护，不再单独提供 Loon 插件入口。

## 新增插件规范

1. 在 `plugins/` 下新建 `<插件名>/` 子目录，放入 `<插件名>.js` 与 `README.md`
2. 在 `loon/` 下新建对应的 `<Name>.plugin` 独立插件文件（命名采用 PascalCase，便于在 Loon 插件库区分）
3. `.plugin` 必须含 `#!name` / `#!desc` / `#!author` / `#!homepage` / `#!icon` / `#!tag` 元信息
4. `[Argument]` 至少提供一个总开关，默认 `false`（与签到体系一致，默认全关、按需打开）
5. 更新本目录 `README.md` 的插件清单表格
6. 在根目录 `README.md` 的"已支持"章节追加一行

commit message 建议：

```
feat(plugins): 新增 <插件名> 插件(<一句话功能>)
```

---

## 致谢

- `QzoneAdBlock` 广告屏蔽规则源自 [zqzess/rule_for_quantumultX](https://github.com/zqzess/rule_for_quantumultX)（MIT License）
- `wxread/` 微信读书优雅收录脚本，基于社区脚本重构整合

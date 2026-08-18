# 特殊功能插件

本目录收录**解锁会员、首页净化、请求改写**等非签到类脚本，与 [`app/`](../app/) 签到体系完全独立。

> **签到体系**（`app/`）：抓 Cookie + cron 执行，需持久化、跨平台运行框架。
> **功能插件**（`plugins/`）：通常无状态、被动拦截请求头/响应体，每个插件独立开关，实时生效。

---

## 与 `app/` 的区别

| 维度 | `app/`（签到体系） | `plugins/`（功能插件） |
|---|---|---|
| 目的 | 抓 Cookie + 定时签到 | 改写请求/响应，实时生效 |
| 触发 | `http-request` 抓取 + `cron` 签到 | 仅 `http-request` 或 `http-response` 被动拦截 |
| 状态 | 需 BoxJS / `$persistentStore` 持久化 | 一般无状态 |
| Loon 插件 | `loon/CookieCenter.plugin` 聚合 | 每插件独立 `loon/<Name>.plugin` |
| BoxJS | ✅ 纳入 `boxjs/` 订阅 | ❌ 不纳入，通过插件自身 `#!switch` 管理 |
| 开关粒度 | 每脚本 capture + sign 双开关 | 每插件单开关 |

---

## 插件清单

| 目录 | 名称 | 功能 | Loon 插件 | 状态 |
|---|---|---|---|---|
| — | QQ空间·清净 | 广告退散，空间清净（纯规则型，无需脚本） | [`loon/QzoneAdBlock.plugin`](../loon/QzoneAdBlock.plugin) | ✅ 已验证 |
| [`wxread/`](./wxread/) | 微信读书·优雅收录 | 轻触订阅人数，好书即刻入架 | [`loon/WeReadEnhance.plugin`](../loon/WeReadEnhance.plugin) | ✅ 已验证 |
| [`weread_claim/`](./weread_claim/) | 微信读书·自动领取 | 定时领取阅读奖励（书币/体验卡）+ 每周翻牌 | [`loon/WeReadClaim.plugin`](../loon/WeReadClaim.plugin) | ✅ 已验证 |
| [`weread_vip/`](./weread_vip/) | 微信读书·会员解锁 | v6.x 会员解锁 + 付费墙 + 屏蔽更新 | [`loon/WeReadVip.plugin`](../loon/WeReadVip.plugin) | ⚠️ 待修（仅 v6.x） |
| [`github_push_time/`](./github_push_time/) | GitHub·星标推送时间 | 在 GitHub App 星标列表仓库名称下方显示最近推送时间 | [`loon/GitHubPushTime.plugin`](../loon/GitHubPushTime.plugin) | 🧪 待验证 |

---

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

# GitHub 星标推送时间

在 GitHub 官方 App 的星标列表星标数/语言行后显示每个仓库的最近推送时间。

## 功能

- 自动给 `StarredRepositoriesForUser` GraphQL 查询补充 `pushedAt` / `updatedAt`
- 在星标列表每个仓库的星标数/语言行后追加 `· x分钟前 / x小时前 / x天前`，例如 `Python · 2小时前`
- `pushedAt` 缺失时自动使用 `updatedAt` 兜底
- 只改展示内容，不改变列表排序；不再修改 `name`，点击跳转不受影响

## 安装

1. Loon → 插件 → 导入 `loon/GitHubPushTime.plugin`
2. 确认已安装并信任 Loon CA 证书
3. 打开插件里的「星标推送时间」开关
4. 打开 GitHub App，进入 Stars 页面查看

## 文件

| 文件 | 用途 |
|---|---|
| `github_push_time.js` | 请求查询增强 + 响应展示注入 |
| `GitHubPushTime.plugin` | Loon 插件配置入口 |

## 已知限制

- 仅针对 GitHub 官方 App 的星标列表 GraphQL 请求，不处理网页端
- 需要 MITM `api.github.com`；若 App 启用证书固定或改走 QUIC，可能失效
- 显示位置为星标数/语言行（通过 `primaryLanguage.name` 追加），不改变列表排序
- 使用 `primaryLanguage.name` 追加，`RepoProfile` 不请求该字段，返回星标页仍稳定显示；请求侧仍保留旧缓存后缀清理
- 状态：已验证

## 版本历史

- 2026-08-18 v1.0.6 去掉“最近推送”文案，改为 `· 2小时前` 紧凑格式
- 2026-08-18 v1.0.5 改为星标数/语言行后追加，位置更贴近仓库行（已验证）
- 2026-08-18 v1.0.4 改为仓库名称下方的独立优雅标签，原简介保留
- 2026-08-18 v1.0.3 改为简介前高亮标签，避免 name 被 RepoProfile 缓存覆盖
- 2026-08-18 v1.0.2 修复点击仓库进不去：请求侧剥离 name 展示后缀
- 2026-08-18 v1.0.1 推送时间改为显示在仓库名称后
- 2026-08-18 v1.0.0 初版，基于 348_1787021746810.har 抓包实现

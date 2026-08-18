# GitHub 星标推送时间

在 GitHub 官方 App 的星标列表固定区域直接显示每个仓库的最近推送时间。

## 功能

- 自动给 `StarredRepositoriesForUser` GraphQL 查询补充 `pushedAt` / `updatedAt`
- 在星标列表每个仓库的简介固定区域追加 `最近推送 · x分钟前 / x小时前 / x天前`
- `pushedAt` 缺失时自动使用 `updatedAt` 兜底
- 只改展示内容，不改变列表排序

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
- 显示位置为仓库简介区域（`shortDescriptionHTML`），不改变列表排序
- 状态：待真机验证

## 版本历史

- 2026-08-18 v1.0.0 初版，基于 348_1787021746810.har 抓包实现
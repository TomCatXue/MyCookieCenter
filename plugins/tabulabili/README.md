# 初见哔哩 (TabulaBili)

> 剥离 B 站首页推荐流请求的 Cookie，强制下发大盘默认热门流，打破信息茧房。

## 功能

- 拦截 `api.bilibili.com/x/web-interface/.../index/top/.../rcmd`（首页推荐流接口）
- 删除请求头中的 Cookie 字段，让后端将你识别为"全新匿名访客"
- 推荐流按大盘热门分发，而非基于你个人行为的推荐

## 不影响

| 功能 | 说明 |
|------|------|
| 视频播放 | `playurl` 接口仍带 Cookie，登录态与 1080P 画质不受影响 |
| 用户中心 | 动态、收藏、关注等接口不受影响 |
| App 端 | 仅作用于 Web 端（`bilibili.com` 网页），B 站 App 不受影响 |
| 弹幕 | 弹幕相关接口不受影响 |

## 使用方式

1. 在 Loon 插件管理中导入 `loon/TabulaBili.plugin`
2. 打开 Loon 设置 → 找到"初见哔哩净化"开关 → 开启
3. 在 iOS Safari / Chrome 中打开 `bilibili.com` 首页刷新
4. 观察推荐流是否变为大盘热门内容

## 注意事项

| 项目 | 说明 |
|------|------|
| MITM | 必须对 `api.bilibili.com` 开启 MITM，并安装 Loon 根证书 |
| 平台限制 | Web 端仅适用于 iOS（Safari / Chrome），Android 因 HTTP/2 限制可能无法生效 |
| 规则精确性 | 仅匹配首页 `rcmd` 接口，不影响其他所有 B 站 API |
| 信息茧房打破程度 | 效果取决于 B 站服务端匿名推荐逻辑，并非完全不推荐你兴趣相关内容 |

## 原始项目

灵感与规则源自 [wangdaodaodao/TabulaBili](https://github.com/wangdaodaodao/TabulaBili)（MIT License）。
原版为 Chrome MV3 扩展，本项目是代理工具版本（Loon / Surge / Stash / QX）。

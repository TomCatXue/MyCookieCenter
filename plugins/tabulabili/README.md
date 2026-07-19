# 初见哔哩 (TabulaBili)

> Web 端剥离整条 Cookie，App 端剥离 buvid3，双重策略打破信息茧房。

## 功能

| 端 | 接口 | 策略 | 效果 |
|----|------|------|------|
| **Web** | `api.bilibili.com/x/web-interface/.../index/top/.../rcmd` | 整条删除 Cookie | 后端识别为匿名访客，下发大盘热门流 |
| **App** | `app.bilibili.com/x/v2/feed/timeline` | 仅删除 buvid3，保留 SESSDATA | 维持登录态，降低推荐精准度 |

### 策略说明

- **Web 端**：整条 Cookie 删除后，B 站后端无法识别你的账号，返回的是"全新访客"看到的热门内容，效果最明显。
- **App 端**：App 端删除整条 Cookie 会导致接口报错。只删 buvid3（用户画像标识）可以让推荐算法的画像维度缺失，但仍保留登录态，App 不会闪退。

## 不影响

| 功能 | 说明 |
|------|------|
| 视频播放 | `playurl` 接口仍带 Cookie，登录态与 1080P 画质不受影响 |
| 用户中心 | 动态、收藏、关注等接口不受影响 |
| 弹幕 | 弹幕相关接口不受影响 |
| App 登录态 | App 端只删 buvid3，不影响登录 |

## 使用方式

1. 在 Loon 插件管理中导入 `loon/TabulaBili.plugin`
2. 打开 Loon 设置 → 找到"初见哔哩净化"开关 → 开启
3. **Web 端**：在 iOS Safari / Chrome 中打开 `bilibili.com` 首页刷新
4. **App 端**：打开 B 站 App，下滑刷新首页，观察推荐内容变化

## 注意事项

| 项目 | 说明 |
|------|------|
| MITM | 必须对 `api.bilibili.com` 和 `app.bilibili.com` 开启 MITM，并安装 Loon 根证书 |
| 平台限制 | Web 端仅适用于 iOS（Safari / Chrome），Android 因 HTTP/2 限制可能无法生效 |
| 规则精确性 | 仅匹配首页推荐流接口（rcmd / timeline），不影响其他所有 B 站 API |
| App 端效果 | App 端只删 buvid3，效果温和；需要多次刷新对比才能感知推荐内容变化 |
| 信息茧房打破程度 | Web 端效果明显；App 端效果取决于 B 站服务端对用户画像的依赖程度 |

## 原始项目

灵感与规则源自 [wangdaodaodao/TabulaBili](https://github.com/wangdaodaodao/TabulaBili)（MIT License）。
原版为 Chrome MV3 扩展，本项目是代理工具版本（Loon / Surge / Stash / QX）。

# 初见哔哩 (TabulaBili)

> Web 端和 App 端均剥离整条 Cookie，让后端无法识别用户身份，返回匿名热门/默认内容，效果立竿见影。

## 功能

| 端 | 接口 | 策略 | 效果 |
|----|------|------|------|
| **Web** | `api.bilibili.com/x/web-interface/.../index/top/.../rcmd` | 整条删除 Cookie | 后端识别为匿名访客，下发大盘热门流 |
| **App** | `app.bilibili.com/x/v2/feed/index` | 整条删除 Cookie + 删除 3 个画像请求头 | 后端无法识别用户，返回匿名内容 |

### App 端删除的字段（抓包确认 + 实测验证）

| 位置 | 删除字段 | 说明 |
|------|---------|------|
| HTTP 头 | `Cookie`（整条） | 包含 SESSDATA / DedeUserID 等，删后后端无法识别用户 |
| HTTP 头 | `x-bili-mid` | 直接暴露用户 mid |
| HTTP 头 | `x-bili-ticket` | JWT token，内含 buvid |
| HTTP 头 | `buvid` | 设备标识 |

### v4 策略变更说明

早期版本只删除 buvid 系字段但保留 SESSDATA/DedeUserID，**实测证明后台仍可通过 SESSDATA 识别用户，推荐内容变化不明显**。v4 改为整条删除 Cookie（与 Web 端一致），实测对比：

| 配置 | 推荐内容 | 与有身份的差异 |
|------|---------|--------------|
| 有身份（x-bili-mid + Cookie） | 个性化推荐 | — |
| 删全部（无 Cookie、无 x-bili-mid） | 完全匿名 | ✅ 完全不同 |
| 删 buvid 仅留 SESSDATA | 仍为个性化 | ❌ 差异很小 |

**结论**：只有整条删除 Cookie，才能看到明显的效果。

## 不影响

| 功能 | 说明 |
|------|------|
| 视频播放 | `playurl` 接口不匹配规则，仍带 Cookie，登录态与 1080P 画质不受影响 |
| 用户中心 | 动态、收藏、关注等接口不受影响 |
| 弹幕 | 弹幕相关接口不受影响 |
| App 登录态 | **App 端整条删除 Cookie 会导致推荐流接口无 Cookie**，但不影响 App 本身的登录态（App 下次请求仍会带自己的 Cookie） |

## 使用方式

1. 在 Loon 插件管理中导入 `loon/TabulaBili.plugin`
2. 打开 Loon 设置 → 找到"初见哔哩净化"开关 → 开启
3. **Web 端**：在 iOS Safari / Chrome 中打开 `bilibili.com` 首页刷新
4. **App 端**：打开 B 站 App，下滑刷新首页，**推荐内容应立即变成热门/新人内容**

## 注意事项

| 项目 | 说明 |
|------|------|
| MITM | 必须对 `api.bilibili.com` 和 `app.bilibili.com` 开启 MITM，并安装 Loon 根证书 |
| 平台限制 | Web 端仅适用于 iOS（Safari / Chrome），Android 因 HTTP/2 限制可能无法生效 |
| 规则精确性 | 仅匹配首页推荐流接口（rcmd / feed/index），不影响其他所有 B 站 API |
| gRPC 流量 | App 部分流量走 `grpc.biliapi.net`（gRPC 协议），http-request 脚本无法拦截 |
| App 端效果 | 整条删除 Cookie 后效果立竿见影，刷新即可看到不同内容 |
| App 端登录态 | 推荐流接口无 Cookie 不影响 App 整体登录，App 下次请求仍带自己的 Cookie |

## 原始项目

灵感与规则源自 [wangdaodaodao/TabulaBili](https://github.com/wangdaodaodao/TabulaBili)（MIT License）。
原版为 Chrome MV3 扩展，本项目是代理工具版本（Loon / Surge / Stash / QX）。

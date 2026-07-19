# 初见哔哩 (TabulaBili)

> Web 端剥离整条 Cookie（匿名热门流），App 端精确删除账号 Cookie 字段 + 删除画像请求头，打破信息茧房，同时避免触发 CDN 固定缓存。

## 功能

| 端 | 接口 | 策略 | 效果 |
|----|------|------|------|
| **Web** | `api.bilibili.com/x/web-interface/.../index/top/.../rcmd` | 整条删除 Cookie | 后端识别为匿名访客，下发大盘热门流 |
| **App** | `app.bilibili.com/x/v2/feed/index` | 从 Cookie 删除账号字段 + 删除 3 个画像请求头 | 后端无法识别你的账号，但仍能通过设备指纹返回内容 |

### App 端删除的字段（v5 策略）

| 位置 | 删除字段 | 说明 |
|------|---------|------|
| Cookie | `SESSDATA`、`DedeUserID`、`bili_jct`、`DedeUserID__ckMd5`、`sid` | 账号相关字段，删后后台无法识别用户 |
| HTTP 头 | `x-bili-mid` | 直接暴露用户 mid |
| HTTP 头 | `x-bili-ticket` | JWT token，内含 buvid |
| HTTP 头 | `buvid` | 设备标识 |

**保留**：`buvid3` / `Buvid` / `buvid_fp`（设备指纹），避免触发 CDN 固定缓存。

### 策略演进

| 版本 | 策略 | 效果 | 问题 |
|------|------|------|------|
| v3 | 只删 buvid 系字段，保留 SESSDATA/DedeUserID | 无效 | 后台通过 SESSDATA 识人 |
| v4 | 整条删 Cookie + 删 3 个请求头 | 有效 | 完全匿名可能触发 CDN 固定缓存 |
| **v5** | 精确删账号字段 + 保留设备指纹 + 删 3 个请求头 | **有效** | **兼顾破圈和稳定性** |

## 不影响

| 功能 | 说明 |
|------|------|
| 视频播放 | `playurl` 接口不匹配规则，仍带完整 Cookie，登录态与 1080P 画质不受影响 |
| 用户中心 | 动态、收藏、关注等接口不受影响 |
| 弹幕 | 弹幕相关接口不受影响 |
| App 登录态 | App 端推荐流删除的是账号字段，不影响 App 整体登录 |

## 使用方式

1. 在 Loon 插件管理中导入 `loon/TabulaBili.plugin`
2. 打开 Loon 设置 → 找到"初见哔哩净化"开关 → 开启
3. **Web 端**：在 iOS Safari / Chrome 中打开 `bilibili.com` 首页刷新
4. **App 端**：打开 B 站 App，下滑刷新首页，推荐内容应立即变化

## 验证方式

1. **看日志**：Loon 控制台应出现 `[TabulaBili] App端已剥离...` 的日志
2. **看内容**：刷新首页后推荐视频标题应明显不同于未开启时

## 注意事项

| 项目 | 说明 |
|------|------|
| MITM | 必须对 `api.bilibili.com` 和 `app.bilibili.com` 开启 MITM，并安装 Loon 根证书 |
| 平台限制 | Web 端仅适用于 iOS（Safari / Chrome），Android 因 HTTP/2 限制可能无法生效 |
| 规则精确性 | 仅匹配首页推荐流接口（rcmd / feed/index），不影响其他所有 B 站 API |
| gRPC 流量 | App 部分流量走 `grpc.biliapi.net`（gRPC 协议），http-request 脚本无法拦截 |
| App 端效果 | v5 策略既打破个性化，又避免 CDN 固定缓存，效果稳定 |

## 原始项目

灵感与规则源自 [wangdaodaodao/TabulaBili](https://github.com/wangdaodaodao/TabulaBili)（MIT License）。
原版为 Chrome MV3 扩展，本项目是代理工具版本（Loon / Surge / Stash / QX）。

## 原始项目

灵感与规则源自 [wangdaodaodao/TabulaBili](https://github.com/wangdaodaodao/TabulaBili)（MIT License）。
原版为 Chrome MV3 扩展，本项目是代理工具版本（Loon / Surge / Stash / QX）。

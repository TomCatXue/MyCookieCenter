# B站分区接口重写

## 背景

B站旧版分区接口 `app.bilibili.com/x/v2/channel/region/list` 已下线（返回 404 Not Found），导致 App 内分区页面无法加载内容。

新接口为 `app.bilibili.com/x/v2/region`，参数格式完全相同。

## 原理

用 Loon 的 http-request 脚本拦截旧 URL，把路径从 `/x/v2/channel/region/list` 改为 `/x/v2/region`，query 参数（`access_key`、`appkey`、`sign` 等）原样保留。

## 使用

在 Loon 中添加插件：

```
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/plugins/bilibili_region/bilibili_region.js
```

导入后即可生效，无需额外配置。

## 验证

添加插件后打开 B站 App 分区页面，能看到内容正常加载即说明生效。也可在 Loon 日志中搜索该请求，确认 URL 已被重写为 `/x/v2/region`。

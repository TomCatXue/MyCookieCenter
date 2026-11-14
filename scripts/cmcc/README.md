# 中国移动 · 移动爱家净化

配合 [`ChinaMobile.plugin`](../../../loon/ChinaMobile.plugin) 使用。移除中国移动 App 内的广告与营销内容。

## 文件

| 文件 | 作用 |
| :--- | :--- |
| `remove_ads.js` | 49.8 KB 主体脚本。覆盖首页轮播、智能爱家、发现页音视频/文章、钱包充话费、借钱与信息流 |

## 净化范围

脚本头部注释列出的范围：

```
@Description: 中国移动 · 移动爱家全方位净化增强脚本
（含首页轮播、智能爱家、发现页音视频/文章、钱包充话费、借钱与信息流）
@Author: Yuheng0101, anker1209, ccyykk666, sooyaaabo; 轮播与专区全方位净化 TomCatXue
@Updated: 2026-10-25 13:48
@Version: v1.1.7
```

## 插件开关

在 Loon 插件参数里，`HideCarousel` 是轮播总控，另有各专区的细分开关。

## 注意

这个目录的脚本**只服务于 `ChinaMobile.plugin`**（广告净化）。

中国移动的**自动续期/每日任务**是另一套东西，走远程 Cloudflare Worker，插件是 `loon/ChinaMobileRenew.plugin`（本地留存，不进公开仓库）。

## 相关

- 插件：[`loon/ChinaMobile.plugin`](../../../loon/ChinaMobile.plugin) (v1.0.16)
- 原作者：Yuheng0101、anker1209、ccyykk666、sooyaaabo；轮播与专区净化 TomCatXue

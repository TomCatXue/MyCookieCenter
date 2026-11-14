# 咪咕音乐 去广告权益

配合 [`MiguMusic.plugin`](../../../loon/MiguMusic.plugin) 使用。

## 文件

| 文件 | 作用 |
| :--- | :--- |
| `migu.js` | 拦截 `/member/api/rights/user/have/` 响应，把 `rightsAlias === "no_ads"` 的 `hasRights` 置为 `true` |

## 边界说明（重要）

这个脚本**只改客户端本地判断**，不做伪造鉴权：

> 仅将客户端本地判断的 `no_ads`（去广告）权益置为 `true`，用于配合插件关闭开屏与营销广告。
> 曲库、演唱会、专区、视频 1080P 等真实版权内容由服务端按账号真实会员态校验，**本脚本不触碰**。

所以它只影响广告展示，不会解锁任何付费内容。这是有意的设计取舍。

## 插件开关

规则型，无需开关。

## 相关

- 插件：[`loon/MiguMusic.plugin`](../../../loon/MiguMusic.plugin) (v1.0.0)
- 作者：TomCatXue

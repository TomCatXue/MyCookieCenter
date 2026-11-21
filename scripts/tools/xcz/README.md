# 西窗烛 · 会员解锁

将西窗烛鉴权接口响应里的 `Membership` 标记由 `false` 改写为 `true`，让客户端本地鉴权分支判定为会员。

## 来源与留存说明

| 项 | 内容 |
| :--- | :--- |
| 原作 | ddgksf2013（插件作者）、Cuttlefish 墨鱼手记（原始思路，脚本头部署名） |
| 上游插件 | `deezertidal/private` → `plugallery/xcz.plugin` |
| 上游脚本 | `deezertidal/private/master/js-backup/Crack/xcz.js` |
| 上游状态 | **已下架**。2026-09-24 提交 [`40b7b98c`](https://github.com/deezertidal/private/commit/40b7b98c) 一次性删除 283 个文件，`plugallery/` 与 `js-backup/` 目录整体移除，master 分支也已在后续合并中消失 |
| 本仓库定位 | 原样逻辑的持久化留存版，加上**降级守卫与 JSON 校验**，避免上游彻底失联后无脚本可用 |

上游原脚本逻辑只有一行核心改写：

```js
var body = $response.body.replace(/Membership":false/g, 'Membership":true');
$done({ body });
```

本仓库版本在原逻辑外增加三层保护，语义完全一致：

1. **非文本 / 无关键字段直接放行** —— 二进制响应不会被当成字符串处理；
2. **改写后 `JSON.parse` 校验** —— 万一上游 JSON 结构变化导致替换破坏语法，自动放弃改写、原样返回，App 不会因解析失败白屏；
3. **顶层 try-catch 兜底** —— 任何异常都 `$done({})` 放行原报文，全分支闭环。

## 生效范围

仅改写 `lchttpapi.xczim.com` 的响应体。以下内容**不受影响、仍由服务端校验**：

- 诗词库、注释、赏析等真实内容资源
- AI 创作、导出、离线下载等需要服务端额度的功能
- 账号本身的会员有效期与订阅记录

换言之，本插件只影响客户端「我是不是会员」这一层本地判定，不改写任何服务端资产。

## 安装

Loon → 插件 → 右上角 **+** → 粘贴：

```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/XczCandle.plugin
```

## 自检

如果打开 App 后会员标识没变化，按下面顺序排查：

1. **MITM 是否生效** —— Loon 首页证书状态为「已安装 + 已信任」；
2. **脚本是否命中** —— Loon 的「脚本」日志里搜索 `西窗烛·会员解锁`，正常会打印 `Membership 已置为 true`；
3. **字段是否还在** —— 若日志显示 `未命中 Membership:false（已是会员或字段结构变更）`，说明接口已不再用该字段，需要重新抓包确认新的会员标记字段；
4. **域名是否变更** —— 上游接口域名若从 `lchttpapi.xczim.com` 迁移，需同步修改插件里的 `[Script]` 与 `[MITM]`。

## 回退

插件设置里关闭开关，或直接删除插件即可恢复原生直连，无残留改动。

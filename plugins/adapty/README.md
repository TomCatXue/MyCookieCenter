# Adapty 合集解锁 (AdaptyCrack)

> 通过修改 Adapty SDK 响应，解锁 15 个 App 的会员/订阅。
> 已从 QX 原版重写为 Loon 原生兼容。

## 支持的 App

| App | 说明 |
|-----|------|
| Yomu | 漫画阅读器 |
| Logo Maker (LogoShop) | Logo 设计软件 |
| Luminar | 手机照片编辑器 |
| Genie | Chatbot |
| Flight Tracker | 飞机追踪 |
| AvA (Momo) | — |
| PlantApp | 植物识别 |
| KeyboardGPT | AI 键盘 |
| SketchAR | AR 画图应用 |
| universal (TVRemote) | 万能遥控器 |
| Lingvist | 学习英语 |
| ChatAI (Nova) | Chat 机器人 |
| FacePlus (Retouch) | AI FaceEditor |
| Batched | 多量图片编辑器 |

## 文件

- `adapty.js` — http-response 脚本，拦截 Adapty API 并注入永久会员数据

## 使用方式

1. 在 Loon 中导入 `loon/AdaptyCrack.plugin`
2. 确保已对 `api.adapty.io` 开启 MITM 并安装证书
3. 打开 Loon 插件管理 → 开启"Adapty 合集解锁"开关
4. 打开目标 App，会员应自动解锁

## 为什么原脚本在 Loon 中不生效

| 问题 | 原因 | 本版修复 |
|------|------|---------|
| 显示成功但不解锁 | `typeof $rocket !== 'undefined'` 检测 → Loon 无此变量 → 主逻辑被跳过 | 移除平台检测 |
| BoxJS 开关默认关 | `adapty_switch` 不存在 → 脚本直接 $done() 退出 | 移除开关依赖 |
| window ReferenceError | 混淆代码末尾 `(function(...)(window))` → Loon 无 window | 去混淆重写 |

## 验证方式

1. 打开 Loon 控制台日志
2. 启动目标 App，触发任意会员相关操作
3. 应看到 `[AdaptyCrack] ✅ 已匹配: XXX → 注入永久会员` 日志
4. 若看到 `⚠️ 未匹配任何 App`，请反馈 UA 前缀以便添加支持

## 原始项目

灵感与脚本逻辑源自 [chxm1023/Rewrite/adapty.js](https://github.com/chxm1023/Rewrite/blob/main/adapty.js)。

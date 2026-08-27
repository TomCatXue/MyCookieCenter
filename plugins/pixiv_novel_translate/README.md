# Pixiv 小说翻译

在 Pixiv 小说阅读页右下角注入一个“译”按钮，点击后弹出翻译面板，支持三种翻译源：

- **Google 免费接口**：`translate.google.hk/translate_a/single`，无需 Key，有频率限制
- **微软翻译**：Azure Translator 文本翻译 API，需要 `Ocp-Apim-Subscription-Key`
- **百度翻译**：通用文本翻译 API，需要 AppID 和密钥

## 安装

1. 在 Loon 中添加 [`PixivNovelTranslate.plugin`](../../loon/PixivNovelTranslate.plugin)
2. 安装并信任 Loon 的 MITM 证书，开启 HTTPS 解密
3. 开启插件总开关 `小说翻译`
4. 打开任意 Pixiv 小说阅读页，点击右下角“译”

## 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `translator` | `google` | 默认翻译源：`google` / `microsoft` / `baidu` |
| `target` | `zh-CN` | 目标语言：`zh-CN` / `zh-TW` / `en` / `ja` / `ko` |
| `ms_key` | 空 | 选择微软翻译时填写订阅 Key |
| `baidu_appid` | 空 | 选择百度翻译时填写应用 ID |
| `baidu_secret` | 空 | 选择百度翻译时填写密钥 |

页面面板内也可临时切换翻译源和目标语言；需要 Key 的翻译源只有配置了对应参数才会可用。

## 目标语言

| 参数值 | 简体 | 繁体 | English | 日本語 | 한국어 |
|---|---|---|---|---|---|
| `zh-CN` | ✅ | | | | |
| `zh-TW` | | ✅ | | | |
| `en` | | | ✅ | | |
| `ja` | | | | ✅ | |
| `ko` | | | | | ✅ |

## 原理

- `http-response` 匹配 `app-api.pixiv.net/webview/v2/novel`，往页面注入样式和客户端脚本
- 客户端脚本读取 `window.pixiv.novel.text`，按段落分块，通过同源 `POST /pxtrans` 发送给 Loon 脚本
- `http-response` 匹配 `app-api.pixiv.net/pxtrans` 的上游 404 响应，由 Loon 脚本直接调用翻译接口，并改写为本地 JSON 响应
- 翻译结果按“原文置灰 + 译文正文”的双语形式展示，“恢复原文”可还原阅读器

## 注意

- Google 免费接口是网页版接口，非商用 API，调用过于频繁可能被限流
- 微软翻译与百度翻译为付费/限额 API，密钥只在 Loon 脚本侧使用，不会下发到页面
- 需要 Loon 保持脚本最新版，插件内已带 `?v=20260827-r3` 版本参数
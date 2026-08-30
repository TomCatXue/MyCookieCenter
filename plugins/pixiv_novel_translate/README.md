# Pixiv 小说翻译

在 Pixiv 小说阅读页右下角注入一个“译”按钮，点击后弹出翻译面板，支持四种翻译源：

- **Google 免费接口**：`translate.googleapis.com/translate_a/t`（多段批量），无需 Key，有频率限制
- **微软翻译**：Azure Translator 文本翻译 API，需要 `Ocp-Apim-Subscription-Key`
- **百度翻译**：通用文本翻译 API，需要 AppID 和密钥
- **DeepSeek AI**：兼容 OpenAI 格式的 Chat Completions 接口，需要 API Key

## 安装

1. 在 Loon 中添加 [`PixivNovelTranslate.plugin`](../../loon/PixivNovelTranslate.plugin)
2. 安装并信任 Loon 的 MITM 证书，开启 HTTPS 解密
3. 开启插件总开关 `小说翻译`
4. 打开任意 Pixiv 小说阅读页，点击右下角“译”

## 参数

| 参数 | 默认值 | 说明 |
|---|---|---|
| `translator` | `google` | 默认翻译源：`google` / `microsoft` / `baidu` / `deepseek` |
| `target` | `zh-CN` | 目标语言：`zh-CN` / `zh-TW` / `en` / `ja` / `ko` |
| `ms_key` | 空 | 选择微软翻译时填写订阅 Key |
| `baidu_appid` | 空 | 选择百度翻译时填写应用 ID |
| `baidu_secret` | 空 | 选择百度翻译时填写密钥 |
| `deepseek_api_url` | `https://api.deepseek.com/v1/chat/completions` | 选择 DeepSeek 时填写接口地址（兼容 OpenAI 格式即可） |
| `deepseek_api_key` | 空 | 选择 DeepSeek 时填写 API Key |
| `deepseek_model` | `deepseek-v4-flash` | 选择 DeepSeek 时填写模型名；`deepseek-v4-flash` 快速便宜，`deepseek-v4-pro` 更强更贵 |
| `chunk` | 按翻译源 | 单批最大字符数，范围 100~3000；不填时 google 2000、微软 4500、百度 2000、deepseek 1500。每批会自动合并多段一次请求（google 20 段 / 微软 50 段 / 百度 10 段 / deepseek 6 段），请求次数大幅减少 |
| `google_proxy_url` | 空 | Google 翻译走 Cloudflare Worker 代理（不填则直连 Google）。部署说明见 [worker/README.md](./worker/README.md) |
| `google_proxy_token` | 空 | Worker 鉴权 Token（部署 Worker 时设置的 `WORKER_TOKEN`） |

页面面板内可切换翻译源和目标语言；未配置密钥的翻译源会标注“（未配置）”，选中后点击“翻译全文”会提示到 Loon 插件参数中填写对应密钥。整篇按“批”翻译：最多 3 批并发，每批完成即显示（边翻边显示），段落级缓存让重复段落/整篇重翻直接命中。

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
- 客户端脚本读取 `window.pixiv.novel.text`，按段落分批（每批多段），通过同源 `POST /pxtrans` 发送 `{"texts":[...]}` 给 Loon 脚本；最多 3 批并发，每批完成立即显示
- `http-request` 匹配 `app-api.pixiv.net/pxtrans`，请求不会发往 Pixiv 上游，直接由 Loon 脚本调用翻译接口并返回 JSON 响应（脚本用 `$done({response:{...}})` 直接返回）；Google 一次请求带多个 `q`，DeepSeek 一次请求用 JSON segments 翻多段，从根上减少请求次数
  - 早期版本用 `http-response` 改写上游 404 响应，但上游被 Cloudflare 拦截时可能返回 HTML（响应头却是 JSON），Loon 在脚本执行前解析响应体即报 `JSON Parse error: Unrecognized token '<'`；改为 `http-request` 后完全不依赖上游响应
  - 易踩坑：Loon 的 `http-request` 中 `$done({status,headers,body})` 会被当作“修改请求”发往上游，必须用 `$done({response:{status,headers,body}})` 才能直接返回响应给客户端
- 翻译结果按“原文置灰 + 译文正文”的双语形式展示，“恢复原文”可还原阅读器

## 注意

- Google 免费接口是网页版接口，非商用 API，调用过于频繁会被限流（返回 429 + HTML 页面，Loon 侧会显示 `JSON Parse error: Unrecognized token '<'`）。已内置多层防御：多段合并一次请求（`translate_a/t` 多 `q`，请求数量减少约一个数量级）+ `translate.googleapis.com` 优先 + 三条域名轮换 + 段落级本地缓存（重复段落不打 Google）+ 限流识别与 60 秒持久化退避（**仅当全部域名都 429 才进入窗口**，单个域名 429 会继续尝试下一个可用域名）+ 窗口内快速失败并停止整篇翻译。429 属于 IP 维度风控，若经常触发，最有效的手段是更换代理节点（换个出口 IP）
- 微软翻译、百度翻译与 DeepSeek 为付费/限额 API，密钥只在 Loon 脚本侧使用，不会下发到页面
- 需要 Loon 保持脚本最新版，插件内已带 `?v=20260828-r15` 版本参数
- DeepSeek 等 AI 接口响应较慢（单次可能 5~10 秒），脚本已把 `$httpClient` 请求超时从 Loon 默认的 5 秒提升到 60 秒，并默认把 DeepSeek 分块降到 1500 字以加快单次响应；若仍超时可在插件参数里继续调小 `chunk`
- 如果您之前在插件参数里填过很小的 `chunk`（如 200），请清空或调大：现在 `chunk` 表示“每批最大字符数”，默认值已经按翻译源调优，过小的值会让每批装不下多段、重新变慢
- 若面板仍显示“（未配置）”：确认 Loon 已导入最新插件、参数已保存、小说页已刷新；可在 Loon 脚本日志中搜索 `[pxtc] 注入配置`，确认脚本读到的密钥状态（只输出是否已配置，不含密钥明文）

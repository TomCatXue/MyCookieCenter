# Pixiv 全局增强翻译 (Pixiverse Enhanced)

适配 Pixiv 8.9.2 等版本：实现**全页面日文深度汉化**、**AI 视觉多模态漫翻**，并对标 Biliverse 在 App 内置 **PreferencePanes 原生样式设置中心**。

---

## 🌟 核心特性

1. **全页面 REST API 深度汉化**：
   - 拦截推荐流（`recommended`）、排行榜（`ranking`）、作品详情（`detail`）、评论区（`comments`）、画师主页（`user`）、搜索与特辑（`spotlight`）；
   - 动态识别日文并批量打包装载翻译，客户端无感呈现中文。
2. **2500+ 高频 Pixiv Tag 离线字典（0ms 响应）**：
   - 内置海量热门动漫、原神、碧蓝档案、FGO、画风、题材日文 Tag 映射；
   - 查表即翻，无需网络请求，0 流量消耗，120Hz 滑动极致流畅。
3. **iOS SF Symbols「文/A」毛玻璃悬浮按钮**：
   - 适配苹果原生毛玻璃视觉质感与自适应深色模式；
   - 支持手势拖拽自由贴边、单击触发翻译、长按 0.5 秒直接唤起设置面板。
4. **AI 视觉多模态漫画翻译 (HUD Mode A)**：
   - 无需本地解压沉重图片，仅向视觉大模型（GPT-4o-mini / DeepSeek-VL）发送图片链接；
   - 毫秒级返回对白坐标，在画面上方覆盖半透明气泡字幕框，**保留 100% 原始超清画质，0 内存膨胀风险**。
5. **App 内部 PreferencePanes 设置面板（对标 Biliverse）**：
   - 劫持 App 内「帮助中心」或长按悬浮球，直接在 App 内弹出原生 iOS Grouped 样式的设置页；
   - 支持热切换翻译源（Google / DeepSeek / 微软 / 百度 / OpenAI）、勾选自动翻译范围与填写 API Key；
   - 配置实时保存并同步至 Loon `$persistentStore`，无需依赖外部 BoxJS。

---

## 🚀 安装与启用指南

1. **导入 Loon 插件**：
   - 在 Loon 中添加插件：
     `https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/PixivEnhanced.plugin`
2. **安装并信任证书**：
   - 开启 Loon MITM，并确保信任证书，Hostname 包含：
     `app-api.pixiv.net, app.pixiv.help, policies.pixiv.net`
3. **唤出设置中心进行配置**：
   - 打开 Pixiv App，进入「我的」-> 右上角「设置」-> 点击「帮助中心」；
   - 或者在任意小说阅读页长按右下角的毛玻璃「文/A」悬浮按钮；
   - 页面将自动跳转加载 **Pixiv 增强设置 (PreferencePanes)**，您可在此开启自动翻译、切换翻译源或填入 DeepSeek API Key。
4. **开启使用**：
   - 刷新 Pixiv 首页或点进任意插画/漫画/小说，全界面日文将自动完成汉化！

---

## ⚙️ 设置面板选项明细 (PreferencePanes)

| 设置项 | 类型 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| **[全局] 启用 Pixiv 增强翻译** | 开关 | `开启` | 总控制开关 |
| **[自动] 默认自动翻译** | 开关 | `开启` | 进入页面后是否自动替换日文 |
| **[范围] 翻译生效模块** | 多选 | 全选 | 可自由勾选：标题 / 简介 / 标签 / 评论 / 画师资料 / 小说 / 特辑 |
| **[文本] 翻译引擎切换** | 单选 | `Google 免费` | `google`（免配置/极速）、`deepseek`（文学润色）、`microsoft`、`baidu`、`openai` |
| **[语言] 目标语言** | 单选 | `简体中文` | 简体中文 / 繁体中文 / 英语 / 日语 / 韩语 |
| **[性能] 标签优先离线字典** | 开关 | `开启` | 开启内置 2500+ Tag 映射，0 延迟秒翻 |
| **[漫翻] 启用图片/漫画 AI 翻译** | 开关 | `开启` | 挂载「文/A」悬浮球及 HUD 漫翻能力 |
| **[漫翻] 视觉漫翻模型** | 单选 | `DeepSeek-VL` | `deepseek_vl` / `gpt4o_mini` / `manga_translator` |
| **[漫翻] 展现样式** | 单选 | `HUD 气泡覆盖` | HUD 气泡覆盖（保留原画） / AI 抹字整图替换 |
| **[密钥] DeepSeek API Key** | 文本 | 空 | DeepSeek 开放平台密钥 |
| **[密钥] OpenAI API Key** | 文本 | 空 | OpenAI 兼容接口密钥 |
| **[密钥] 微软 / 百度密钥** | 文本 | 空 | 对应平台的翻译 API Key / AppID |
| **[服务] 自建漫画重绘服务 URL** | 文本 | `http://127.0.0.1:5000` | 自建 manga-image-translator 服务端地址 |

---

## 🛠️ 底层拦截路由架构

```
Loon [Rewrite] & [Script]
├── 帮助中心劫持: ^https?:\/\/app\.pixiv\.help\/hc -> https://app-api.pixiv.net/settings/Enhanced
├── 设置页面提供: https://app-api.pixiv.net/settings/Enhanced -> NSNanoCat/PreferencePanes (HTML/MJS)
├── 设置契约加载: https://app-api.pixiv.net/api/Enhanced -> Pixiv.Enhanced.PreferencePanes.json
├── 设置数据存取: https://app-api.pixiv.net/api/(get|set|delete) -> api.js -> Loon $persistentStore
├── 核心数据汉化: https://app-api.pixiv.net/v1/(illust|novel|user|search|spotlight) -> pixiv_enhanced.js
└── 漫翻中转代理: https://app-api.pixiv.net/pxtrans -> pixiv_enhanced.js (批量与多模态分发)
```

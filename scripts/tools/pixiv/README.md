# Pixiv 全局增强翻译 (Pixiverse Enhanced)

适配 Pixiv 8.9.2 等版本：深度融合 **Pix-Scripting** 与 **Biliverse** 的设计哲学，实现**全页面日文深度汉化**、**AI 视觉多模态漫翻**，并在 App 内置 **PreferencePanes 苹果原生样式设置中心**。

---

## 🌟 核心特性

1. **全页面 REST API 深度就地汉化**：
   - 拦截首页全景流（`POST /v1/home/all`）、推荐流（`recommended`）、排行榜（`ranking`）、作品详情（`detail`）、评论区（`comments`）、画师主页（`user`）、搜索与特辑（`spotlight`）；
   - **双重模型写回**：同时汉化外层数据与底层 `t.app_model`，首页大标题与简介 100% 呈现中文，彻底消除“点击查看更多弹窗”；
   - **评论区全语种就地翻译**：日文、韩文（Hangul）、英文等多语种自动转为中文呈现。
2. **2500+ 高频 Pixiv Tag 离线字典（0ms 响应）**：
   - 内置海量热门动漫、原神、排球少年、咒术回战、碧蓝档案、FGO、画风日文 Tag 映射；
   - 主标签改写为中文，副标签自动置空，彻底消除上下两行文字复读堆叠问题。
3. **出版级小说阅读排版（对标 Pix-Scripting NovelTypographySheet）**：
   - **字体自由定制**：支持系统默认（苹方 PingFang）、经典宋体（纸书质感）、优美楷体（古雅排版）、柔和圆体；
   - **自动净化作者声明规约**：智能识别并剔除小说文本前后的商用授权、禁止转载、台本规约等杂物，专注小说沉浸式阅读；
   - **原版字号完全继承**：100% 动态继承用户在 Pixiv 原生设置里的字号、行距、暗黑/羊皮纸背景色，绝不生硬变色。
4. **悬浮按钮完美定位与 100% 灵敏触控**：
   - 悬浮按钮位置精确锁定在右侧 `right: 10px; bottom: 150px`，坐落于原生喜欢按钮上方，绝不重叠；
   - 彻底移除了拖拽误判干扰，轻点即触发翻译/还原，长按 500ms 呼出设置中心；翻译中微透明静止不打转，完成后变绿；纯中文小说自动隐身不打扰。
5. **AI 视觉多模态漫画翻译 (HUD Mode A)**：
   - 仅向视觉大模型（GPT-4o-mini / DeepSeek-VL）发送图片链接；
   - 毫秒级返回对白坐标，在画面上方覆盖半透明气泡字幕框，**保留 100% 原始超清画质，0 内存膨胀风险**。
6. **App 内部 PreferencePanes 设置面板（对标 Biliverse）**：
   - 劫持 App 内「帮助中心」或长按悬浮球，直接在 App 内弹出原生 iOS Grouped 样式的设置页；
   - 支持热切换翻译源（Google 免费切片并发 / DeepSeek / 微软 / 百度 / OpenAI）、勾选自动翻译范围与填写 API Key；
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
   - 或者在任意小说阅读页长按右下角的悬浮按钮；
   - 页面将自动跳转加载 **Pixiv 增强设置 (PreferencePanes)**，您可在此开启自动翻译、切换排版字体、切换翻译源或填入 DeepSeek API Key。
4. **开启使用**：
   - 刷新 Pixiv 首页或点进任意插画/漫画/小说，全界面日文将自动完成汉化！

---

## ⚙️ 设置面板选项明细 (PreferencePanes)

| 设置项 | 类型 | 默认值 | 说明 |
| :--- | :---: | :---: | :--- |
| **[全局] 启用 Pixiv 增强翻译** | 开关 | `开启` | 总控制开关 |
| **[自动] 默认自动翻译** | 开关 | `开启` | 进入页面后是否自动替换日文为中文 |
| **[范围] 翻译生效模块** | 多选 | 全选 | 作品标题 / 简介 / 标签 / 评论 / 画师资料 / 小说 / 特辑 |
| **[过滤] 智能跳过纯中文内容** | 开关 | `开启` | 纯中文作品自动免翻，节省 API 配额并消除延迟 |
| **[小说] 阅读排版字体** | 单选 | `系统默认` | 苹方 / 经典宋体 / 优美楷体 / 柔和圆体 |
| **[小说] 自动净化作者免责声明** | 开关 | `开启` | 自动过滤小说中的台本规约、商用免责等杂物文本 |
| **[文本] 翻译引擎切换** | 单选 | `Google 免费` | `google`（切片并发/极速）、`deepseek`（文学润色）、`openai` |
| **[语言] 目标语言** | 单选 | `简体中文` | 简体中文 / 繁体中文 / 英语 / 日语 / 韩语 |
| **[性能] 标签优先离线字典** | 开关 | `开启` | 开启内置 2500+ Tag 映射，0 延迟秒翻且净空副标题 |
| **[漫翻] 启用图片/漫画 AI 翻译** | 开关 | `开启` | 启用 HUD 气泡字幕视觉漫翻能力 |
| **[漫翻] 视觉漫翻模型** | 单选 | `DeepSeek-VL` | `deepseek_vl` / `gpt4o_mini` / `manga_translator`（独立于文本翻译引擎） |
| **[漫翻] 展现样式** | 单选 | `HUD 气泡覆盖` | HUD 气泡覆盖（保留原画） / AI 抹字整图替换 |
| **[密钥] DeepSeek API Key** | 文本 | 空 | DeepSeek 开放平台密钥 |
| **[密钥] OpenAI API Key** | 文本 | 空 | OpenAI 兼容接口密钥 |
| **[密钥] 微软 / 百度密钥** | 文本 | 空 | 对应平台的翻译 API Key / AppID |
| **[服务] 自建漫画重绘服务 URL** | 文本 | `http://127.0.0.1:5000` | 自建 manga-image-translator 服务端地址 |

---

## 🛠️ 底层拦截路由架构

```
Loon [Rewrite] & [Script]
├── 帮助中心劫持: ^https?:\/\/app\.pixiv\.help(?:\/.*)?$ -> https://app-api.pixiv.net/settings/Enhanced
├── 设置页面提供: https://app-api.pixiv.net/settings/Enhanced -> NSNanoCat/PreferencePanes (HTML/MJS)
├── 设置契约加载: https://app-api.pixiv.net/api/Enhanced -> Pixiv.Enhanced.PreferencePanes.json
├── 设置数据存取: https://app-api.pixiv.net/api/(get|set|delete) -> api.js -> Loon $persistentStore
├── 核心数据汉化: https://app-api.pixiv.net/v[1-3]/(illust|manga|novel|user|search|trending-tags|spotlight|home) -> pixiv_enhanced.js
└── 漫翻中转代理: https://app-api.pixiv.net/pxtrans -> pixiv_enhanced.js (批量切片与多模态分发)
```

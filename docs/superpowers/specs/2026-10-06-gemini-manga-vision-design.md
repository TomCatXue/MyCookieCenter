# Pixiv 增强翻译 - Gemini 2.0 Flash 空间视觉漫翻引擎设计规格

## 1. 概述与背景

当前 Pixiv 增强翻译插件的漫画查看器已具备全屏阅读、底栏控制岛与气泡字幕覆盖机制，但底层视觉模型在处理日本漫画竖排文本（纵书）和复杂对白框时，存在坐标漂移、漏检、语境生硬等问题。

为了在**不改动任何现有运行逻辑**的前提下大幅提高漫画气泡定位精准度与译文质量，本设计引入 **Google Gemini 2.0 Flash** 空间视觉定位模型作为主力漫翻引擎之一。Gemini 2.0 拥有领先的 2D 空间坐标（Spatial Grounding）能力与日漫多模态识别水平，且 Google AI Studio 官方提供每日 1500 次永久免费额度。

---

## 2. 设计原则与兼容性保证

1. **纯增量开发，零侵入性**：
   * 严禁修改现有小说双语排版、首页双层卡片汉化、离线 Tag 字典以及作品简介漫翻入口逻辑。
   * 保留所有现有漫翻引擎（`DeepSeek-VL`、`GPT-4o-mini`、`manga_translator`），用户可随意切换。
2. **纯原生 OpenAI 协议复用**：
   * Google 官方原生提供 `https://generativelanguage.googleapis.com/v1beta/openai/` 兼容层，复用标准 Chat Completions `image_url` 协议，代码结构高度清晰、健壮。
3. **免防盗链直传**：
   * 复用现有 `i.pixiv.re` 免防盗链镜像大图，直接交由 Gemini 云端多模态引擎抓取分析，手机端 0 转码延迟。

---

## 3. 技术规格与接口规范

### 3.1 接口与鉴权
* **请求端点**：`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
* **模型标识**：`gemini-2.0-flash`
* **请求头**：
  * `Content-Type: application/json`
  * `Authorization: Bearer <Gemini API Key>`
* **超时时间**：30000ms

### 3.2 空间气泡定位专属提示词（Prompt）
```text
Detect every dialogue bubble in this manga image.
Return ONLY a valid JSON array of objects without Markdown code fence formatting.
Each object must have:
- "box": [ymin, xmin, ymax, xmax] as normalized percentages (numbers from 0 to 100),
- "ja": original detected Japanese text,
- "zh": natural Simplified Chinese translation in anime/manga style.
Order the list by manga reading flow (right-to-left, top-to-bottom).
```

### 3.3 响应解析与数据结构
后端将 Gemini 返回的 JSON 数据解析为标准化气泡对象：
```typescript
interface BubbleItem {
  box: [number, number, number, number]; // [top, left, bottom, right] 百分比
  ja: string; // 日文原句
  zh: string; // 中文译文
}
```
若 Gemini 响应中外层包裹了 Markdown 标记（如 ````json`），解析函数自动清洗后反序列化。

---

## 4. 前端设置中心规格 (`settings.html`)

### 4.1 选项扩展
在 `#cfg-manga-engine` 下拉列表中增加选项：
* `value="gemini_vl"`：`Gemini 2.0 Flash (推荐·官方免费空间视觉)`
* 设置为默认首选引擎。

### 4.2 专属配置块 (`#manga-gemini-block`)
仅在 `#cfg-manga-engine` 选中 `gemini_vl` 时显示：
* **Gemini API Key 输入框**：
  * DOM ID: `cfg-gemini-key`
  * 类型：带明文/掩码眼睛切换的密码输入框
  * Placeholder: `AIzaSy...`
* **指引文案**：
  * `🌟 Google AI Studio (aistudio.google.com) 免费申请 API Key，每日 1500 次永久免费额度，对白定位毫米级贴合。`

### 4.3 测速与状态联动
* 点击【测试漫翻服务连接与测速】按钮时，若当前引擎为 `gemini_vl`，将向 `/api/test_manga?engine=gemini_vl&gemini_key=...` 发送请求；
* 后端使用测试小图或轻量请求调用 Gemini 接口，成功后上报真实网络延迟（毫秒）并展示 `🟢 漫翻正常 · XXXms`。

---

## 5. 后端脚本实现规格 (`pixiv_enhanced.js`)

1. **配置存储字段扩充**：
   * 存储键名：`@Pixiv.Enhanced.Settings.Auth.GeminiKey`
   * `handleApiGet` 读取白名单同步纳入该键名，保证设置持久化。
2. **`translateMangaImage` 引擎分支**：
   * 增加 `if (engine === "gemini_vl")` 逻辑分支；
   * 读取 `cfg.geminiKey`，验证缺失时提示用户前往设置中心填写；
   * 发起请求并解析气泡数据，输出给前端阅读器。
3. **`handleApiTestManga` 测速分支**：
   * 增加 `gemini_vl` 测试逻辑，验证 Key 的有效性及网络连通性。

---

## 6. 验证与回归测试计划

1. **语法与格式检查**：
   * `node --check scripts/tools/pixiv/pixiv_enhanced.js` 语法验证通过；
   * `settings.html` 标签平衡检查通过；
   * `pixiv_enhanced.js` 内置 `SETTINGS_HTML` 字符串保持 100% 同步。
2. **多引擎兼容性测试**：
   * 切换至 `DeepSeek-VL`、`GPT-4o-mini`、`manga_translator`，确认既有引擎功能不受任何影响。
3. **真实网络测试**：
   * 测试连通性与延迟汇报正常；
   * 验证查看器中气泡坐标 `[ymin, xmin, ymax, xmax]` 渲染在页面对应位置。

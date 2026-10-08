# Pixiv 增强翻译 - Gemini 2.0 Flash 空间视觉漫翻引擎实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在不触动任何现有功能与模块的前提下，增量引入 Google 官方免费 Gemini 2.0 Flash 空间视觉定位模型，彻底解决漫画对白气泡定位漂移与竖排日文识别难题。

**架构：** 前端在【漫画与图片翻译】中增添 Gemini 引擎选择、Key 配置与测速联调；后端在 `translateMangaImage` 与 `handleApiTestManga` 中接入 Google 官方 OpenAI 兼容层（`generativelanguage.googleapis.com`），利用 2D Grounding 提示词进行精准气泡识别与动漫风格中文汉化。

**技术栈：** JavaScript (ES6+), Loon Script/Plugin API, HTML5/CSS3 (iOS Grouped System), Google Gemini OpenAI Compatibility API.

---

### 文件修改清单
1. `scripts/tools/pixiv/settings.html`：前端设置中心，增加 `gemini_vl` 选项、专属 Key 输入面板与前端存取/测速逻辑。
2. `scripts/tools/pixiv/pixiv_enhanced.js`：核心代理脚本，增加 `gemini_vl` 请求分支、配置读写白名单、测速函数并同步内置 `SETTINGS_HTML`。
3. `loon/PixivEnhanced.plugin`：版本号递增至 `v4.5.3` 并刷新脚本加载防缓存时间戳。

---

### 任务 1：前端设置中心扩展与 Key 持久化对齐

**文件：**
- 修改：`scripts/tools/pixiv/settings.html`
- 测试：`scripts/tools/pixiv/test_settings_sync.js` (新建临时测试脚本)

- [ ] **步骤 1：编写配置项一致性测试脚本**

创建测试脚本 `scripts/tools/pixiv/test_settings_sync.js`：
```javascript
const fs = require('fs');
const html = fs.readFileSync('scripts/tools/pixiv/settings.html', 'utf8');

// 1. 检查 DEFAULT_CONFIG 是否包含 GeminiKey
const defMatch = html.match(/const DEFAULT_CONFIG = \{([\s\S]*?)\};/);
if (!defMatch) throw new Error('未找到 DEFAULT_CONFIG');
if (!defMatch[1].includes('"@Pixiv.Enhanced.Settings.Auth.GeminiKey"')) {
  throw new Error('DEFAULT_CONFIG 缺少 @Pixiv.Enhanced.Settings.Auth.GeminiKey');
}

// 2. 检查下拉框是否包含 gemini_vl
if (!html.includes('value="gemini_vl"')) {
  throw new Error('下拉框缺少 gemini_vl 选项');
}

// 3. 检查 DOM 元素 cfg-gemini-key 是否存在
if (!html.includes('id="cfg-gemini-key"')) {
  throw new Error('缺少 cfg-gemini-key 输入框');
}

// 4. 检查 div 开闭平衡
const opens = (html.match(/<div\b/g) || []).length;
const closes = (html.match(/<\/div>/g) || []).length;
if (opens !== closes) {
  throw new Error(`div 标签不平衡: open=${opens}, close=${closes}`);
}

console.log('Task 1 settings tests passed!');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node scripts/tools/pixiv/test_settings_sync.js`
预期：FAIL，提示缺少配置或控件。

- [ ] **步骤 3：在 `settings.html` 中实现 Gemini 控件与逻辑**

在 `settings.html` 中进行增量扩展：
1. `DEFAULT_CONFIG` 增加 `"@Pixiv.Enhanced.Settings.Auth.GeminiKey": ""`，并将默认漫翻引擎更新为 `gemini_vl`；
2. `#cfg-manga-engine` 下拉框首项插入：
   `<option value="gemini_vl">Gemini 2.0 Flash (推荐·官方免费空间视觉)</option>`；
3. 新增 `#manga-gemini-block` 专属输入区域（带眼睛切换图标与申请指引）；
4. `onMangaEngineChange` 中联动控制 `#manga-gemini-block` 的显隐；
5. `loadConfig` 与 `saveConfig` 读取并回写 `cfg-gemini-key`；
6. `testMangaConnection` 在引擎为 `gemini_vl` 时，带上 `gemini_key` 参数；
7. 更新版本号显示为 `v4.5.3`。

- [ ] **步骤 4：运行测试验证通过**

运行：`node scripts/tools/pixiv/test_settings_sync.js`
预期：PASS，输出 `Task 1 settings tests passed!`

- [ ] **步骤 5：清理测试脚本并 Commit**

```bash
rm scripts/tools/pixiv/test_settings_sync.js
git add scripts/tools/pixiv/settings.html
git commit -m "feat(pixiv): add Gemini 2.0 Flash configuration UI to settings center"
```

---

### 任务 2：核心代理脚本接入 Gemini 漫翻视觉推理与白名单

**文件：**
- 修改：`scripts/tools/pixiv/pixiv_enhanced.js`
- 测试：`scripts/tools/pixiv/test_gemini_engine.js` (新建临时测试脚本)

- [ ] **步骤 1：编写解析与鉴权单元测试脚本**

创建测试脚本 `scripts/tools/pixiv/test_gemini_engine.js`：
```javascript
const fs = require('fs');
const js = fs.readFileSync('scripts/tools/pixiv/pixiv_enhanced.js', 'utf8');

// 1. 验证 handleApiGet 包含 GeminiKey
if (!js.includes('"@Pixiv.Enhanced.Settings.Auth.GeminiKey"')) {
  throw new Error('handleApiGet 白名单未包含 @Pixiv.Enhanced.Settings.Auth.GeminiKey');
}

// 2. 验证 translateMangaImage 包含 gemini_vl 分支
if (!js.includes('engine === "gemini_vl"')) {
  throw new Error('translateMangaImage 缺少 gemini_vl 逻辑分支');
}

// 3. 验证端点使用 Google 官方 OpenAI 兼容层
if (!js.includes('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')) {
  throw new Error('未正确使用 Google 官方 OpenAI 兼容端点');
}

// 4. 验证 handleApiTestManga 包含 gemini_vl 分支
if (!js.includes('engine === "gemini_vl"')) {
  throw new Error('handleApiTestManga 缺少 gemini_vl 测速支持');
}

// 5. 语法检查
require('child_process').execSync('node --check scripts/tools/pixiv/pixiv_enhanced.js');

console.log('Task 2 engine tests passed!');
```

- [ ] **步骤 2：运行测试验证失败**

运行：`node scripts/tools/pixiv/test_gemini_engine.js`
预期：FAIL，报错提示缺少分支。

- [ ] **步骤 3：在 `pixiv_enhanced.js` 中实现 Gemini 逻辑与白名单**

1. `loadConfig()` 读取 `geminiKey`；
2. `handleApiGet()` 白名单加入 `"@Pixiv.Enhanced.Settings.Auth.GeminiKey"`；
3. `translateMangaImage` 增加 `engine === "gemini_vl"` 分支：
   * 端点：`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`；
   * 模型：`gemini-2.0-flash`；
   * 鉴权：`Authorization: Bearer <geminiKey>`；
   * 载荷：标准化空间定位 Prompt + `safeImageUrl`；
   * 气泡解析：清洗 Markdown 代码块，转换为标准 `[{ box, ja, zh }]`；
4. `handleApiTestManga` 增加 `gemini_vl` 测速分支；
5. 同步内置的 `SETTINGS_HTML` 字符串；
6. 头部版本号更新为 `v4.5.3`。

- [ ] **步骤 4：运行测试验证通过**

运行：`node scripts/tools/pixiv/test_gemini_engine.js`
预期：PASS，输出 `Task 2 engine tests passed!`

- [ ] **步骤 5：清理测试脚本并 Commit**

```bash
rm scripts/tools/pixiv/test_gemini_engine.js
git add scripts/tools/pixiv/pixiv_enhanced.js
git commit -m "feat(pixiv): implement Gemini 2.0 Flash vision translation and speed test"
```

---

### 任务 3：Loon 插件更新与全量回归校验

**文件：**
- 修改：`loon/PixivEnhanced.plugin`

- [ ] **步骤 1：更新 Loon 插件版本号与时间戳**

1. 将 `#!version` 升级为 `4.5.3`；
2. 将 `#!date` 更新为当前时间（如 `2026-10-06 15:00`）；
3. 将所有脚本 URL 的缓存控制参数统一刷新为 `?v=202610061500`。

- [ ] **步骤 2：运行全仓库语法与配置一致性自检**

运行：
```bash
node --check scripts/tools/pixiv/pixiv_enhanced.js
node -e "JSON.parse(require('fs').readFileSync('boxjs/CookieCenter.boxjs.json','utf8')); console.log('JSON_OK')"
```
预期：全部通过，输出 `JSON_OK`。

- [ ] **步骤 3：Commit 插件配置**

```bash
git add loon/PixivEnhanced.plugin
git commit -m "chore(pixiv): bump plugin version to v4.5.3 with fresh cachebuster"
```

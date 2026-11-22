# Pixiv 漫画原位翻译 · 图片代理 Worker

让 Pixiv App 的**原生阅读器**直接显示中文译文。不用打开额外查看器，不用离开软件。

```
Pixiv 阅读器请求 i.pximg.net/.../p0_master1200.jpg
        ↓ Loon MITM 解密
        ↓ Loon 脚本改写 URL
https://<worker>/img?src=<原图URL>&lang=zh-CN
        ↓
本 Worker：抓原图 → 视觉模型识别气泡 → SVG 合成译文 → 返回图片
        ↓
Pixiv 阅读器当普通图片渲染 —— 用户直接看到汉化页
```

---

## 一、先做链路验证（关键，别跳过）

这一步是为了确认 **Pixiv 是否接受代理返回的图片**。如果它校验了图片域名或签名，整个方案就得换。

1. 部署 Worker（见第二节），先保持 `PASSTHROUGH_ONLY = "1"`
2. 装 `loon/PixivImgTranslate.plugin`，把 `WORKER_HOST` 改成你的域名
3. 开启 MITM 并信任证书
4. 打开 Pixiv 看任意漫画

**结果判读：**

| 现象 | 含义 | 下一步 |
|---|---|---|
| 图片正常显示 | 链路通 | 把 `PASSTHROUGH_ONLY` 改 `0`，继续第三节 |
| 图片空白/转圈 | Pixiv 拒绝代理图 | 停，告诉我，换方案 |
| 报错或闪退 | MITM 有问题 | 检查证书信任、QUIC 是否关闭 |

排查时可以看 Worker 日志：

```bash
npx wrangler tail
```

---

## 二、部署 Worker

### 1. 装依赖

```bash
cd scripts/tools/pixiv/imgproxy
npm install
```

### 2. 登录 Cloudflare

```bash
npx wrangler login
```

### 3. 建 KV 缓存

```bash
npx wrangler kv namespace create TRANSLATE_CACHE
```

把输出里的 `id` 填进 `wrangler.toml` 的 `[[kv_namespaces]]`。

### 4. 配视觉模型

任选一个，用 `wrangler secret put` 设置（不要写进 toml，避免泄露）：

| 引擎 | 必填 |
|---|---|
| Gemini（推荐） | `GEMINI_KEY` |
| OpenAI 兼容 | `OPENAI_KEY`，可选 `OPENAI_URL` / `OPENAI_MODEL` |
| 自建/第三方 | `CUSTOM_URL`、`CUSTOM_KEY`、`CUSTOM_MODEL` |

```bash
npx wrangler secret put GEMINI_KEY
```

同时把 `wrangler.toml` 的 `VISION_ENGINE` 改好（`gemini` / `openai` / `custom`）。

### 5. 配字体

Worker 里不能塞 9.7MB 的 `simhei.ttf`。用网络字体最省事：

```toml
[vars]
FONT_URL = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.3.1/files/noto-sans-sc-chinese-simplified-400-normal.woff2"
```

> 注意：resvg 需要能解析字体格式。如果 woff2 报错，改用 TTF 版本，
> 或用 `tools/prepare-font.mjs` 把本地字体压成 woff2 后自己托管。

### 6. 部署

```bash
npx wrangler deploy
```

部署完访问 `/health` 检查配置：

```bash
curl https://<你的域名>/health
```

应该返回 `{ ok: true, mode: "passthrough", engine: "gemini", hasKey: true, hasFont: true }`。

---

## 三、开启翻译

1. `wrangler.toml` 里 `PASSTHROUGH_ONLY = "0"`
2. 重新 `npx wrangler deploy`
3. 打开 Pixiv 看漫画，第一页会比平时慢 2-5 秒（要跑视觉模型），之后走缓存

**响应头会告诉你发生了什么：**

| 头 | 值 | 含义 |
|---|---|---|
| `X-Pixiv-Translate` | `passthrough` | 透传模式 |
| | `hit` | 命中缓存，秒出 |
| | `miss` | 新翻译 |
| | `no-dialogue` | 这页没有对白，返回原图 |
| | `fail-passthrough` | 翻译失败，降级原图 |
| `X-Pixiv-Bubbles` | 数字 | 识别到几个气泡 |

---

## 四、可调参数

`wrangler.toml` 的 `[vars]`：

| 变量 | 默认 | 说明 |
|---|---|---|
| `STYLE_VERSION` | `v1` | 改渲染逻辑时递增，自动作废旧缓存 |
| `DEFAULT_TARGET_LANG` | `zh-CN` | 目标语言 |
| `VISION_ENGINE` | `gemini` | 视觉引擎 |
| `THEME_FILL` | `#fffdf8` | 遮罩底色（纸色比纯白自然） |
| `THEME_TEXT` | `#111111` | 文字颜色 |
| `THEME_STROKE` | `#ffffff` | 文字描边 |
| `THEME_OPACITY` | `0.97` | 遮罩不透明度（低于 0.95 日文会透出来） |

**深色漫画页**建议：`THEME_FILL=#1a1a1a`、`THEME_TEXT=#eeeeee`、`THEME_STROKE=#000000`

---

## 五、成本与性能

一次翻译 = 1 次视觉模型调用 + 1 次 resvg 渲染。

- **缓存命中后 0 成本**：同一页（同 URL + 语言 + 引擎 + 样式版本）只算一次
- 漫画一话 20 页，首次看约 20 次模型调用
- Gemini Flash 单页成本大致在小数点后三位的量级（按各自定价算）
- 渲染耗时 resvg 约 100-300ms，主要瓶颈是模型往返

**想省钱：**
- 别开 `TRANSLATE_ALL`（会把封面、头像全翻了）
- 缓存 TTL 给足（默认 7 天）
- 用更便宜的引擎跑列表页

---

## 六、渲染实现要点

这部分代码在 `src/render.js`，几个踩过的坑：

1. **遮罩必须实色**。日文字形笔画密，`opacity: 0.9` 都会透出来。
2. **模型返回的是「气泡本体」框**，不是文字框。prompt 里明确要求了这一点，否则遮罩盖不住竖排长句。
3. **字号要自适应**。短句在大气泡里要放大，长句要折行。逻辑是「先试单行 → 再试折行 → 都放不下就用最小字号」。
4. **避免孤字断行**。最后一行只剩一个字时换更小的字号重排。
5. **文字垂直居中**用基线计算：`中心 - 总高/2 + 半行高 + 0.36em`。
6. **双层描边**让文字在复杂画面上不糊：`paint-order="stroke"` + `stroke-width = 0.13em`。

---

## 七、已知限制

- **只对 Pixiv App 生效**。走的是 MITM 改图片请求，其他 App 要看别的域名。
- **Pixiv 可能改图片路径**。如果某天失效，先抓包看 `i.pximg.net` 的路径变没变。
- **竖排日文识别不完美**。模型对竖排的框定位会偏，必要时在 prompt 里再强调。
- **拟声词不处理**。SFX 是画在图上的艺术字，盖掉会毁画面，所以 prompt 里明确跳过了。
- **首次看新漫画有延迟**。2-5 秒/页，视模型速度。缓存后就秒开。

---

## 八、目录结构

```
imgproxy/
├── src/
│   ├── index.js      Worker 入口：路由、抓图、缓存、降级
│   ├── vision.js     视觉模型层：识别气泡 + 翻译 + JSON 容错解析
│   └── render.js     SVG 合成层：遮罩 + 排版 + resvg 渲染
├── tools/
│   └── prepare-font.mjs   字体压缩工具
├── wrangler.toml
└── package.json
```

配套：

- `loon/PixivImgTranslate.plugin` —— Loon 插件定义
- `scripts/tools/pixiv/pixiv_imgproxy.js` —— Loon 请求改写脚本

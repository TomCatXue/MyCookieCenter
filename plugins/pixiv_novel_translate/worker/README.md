# Cloudflare Worker 部署指南

## 作用

Google 免费翻译接口会按 IP 维度限流（429）。Worker 的价值：

- **换 IP**：把 Google 请求从你的设备/代理节点 IP 转移到 Cloudflare Worker IP
- **服务端缓存**：KV 缓存译文，重复段落 0 上游请求

## 部署步骤

### 1. 创建 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → Create
2. 随便取个名字（如 `pxtc-translate`），点 **Deploy**
3. 点 **Edit Code**，把 [`worker.js`](./worker.js) 的内容粘贴进去，覆盖默认代码
4. 点 **Save and Deploy**

### 2. 设置鉴权 Token（可选但建议）

在 Worker 编辑页 → **Settings** → **Variables** → 添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `WORKER_TOKEN` | 自定义一串随机字符串 | 鉴权 Token，防止他人盗用 |

> 如果不设置，Worker 用默认值 `CHANGE_ME_PLEASE`，此时**不鉴权**，任何人都能调用。正式使用建议设置。

### 3. 创建 KV 缓存（可选）

1. Dashboard → Workers & Pages → **KV** → Create a namespace，取名 `PXTC_CACHE`
2. 回到 Worker → **Settings** → **Bindings** → Add binding
3. Variable name 填 `PXTC_CACHE`，KV namespace 选刚创建的

> 不绑定 KV 也能用，只是没有服务端缓存。

### 4. 获取 Worker 地址

部署后 Worker 的地址形如：

```
https://pxtc-translate.<你的子域>.workers.dev/translate
```

（注意末尾带 `/translate`）

### 5. 在 Loon 插件中配置

打开 Loon → 插件 → Pixiv 小说翻译 → 参数设置：

| 参数 | 填什么 |
|---|---|
| `Google代理地址` | 上面的 Worker 地址（含 `/translate`） |
| `Google代理Token` | 步骤 2 中设置的 `WORKER_TOKEN`（没设置就留空） |

保存后重新导入插件、刷新小说页即可。**不填代理地址则直连 Google**（原有行为不变）。

## 验证

在浏览器或终端发一条测试请求：

```bash
curl -X POST "https://pxtc-translate.xxx.workers.dev/translate?t=google&l=zh-CN" \
  -H "Content-Type: application/json" \
  -H "x-worker-token: 你的TOKEN" \
  -d '{"texts":["こんにちは","テスト"]}'
```

正常返回：

```json
{"ok":true,"translation":"","translations":["你好","测试"],"src":"google","error":""}
```

## 架构

```
没有 Worker：
  Pixiv 页面 → Loon 脚本 → 直连 Google → 429（你的 IP 被限流）

有 Worker：
  Pixiv 页面 → Loon 脚本 → Worker → Google
                                ↑ KV 缓存命中时直接返回，不打 Google
```

## 注意

- Worker 免费版每天 10 万次请求，小说翻译一般够用
- Worker 的 Google 接口用的是 `/translate_a/single`（单段 GET），不像 Loon 脚本直连用 `/translate_a/t`（多段 POST）。因此 Worker 模式下批量翻译是逐段调用 Google，请求数比直连多。好处是 Worker IP 不容易被 429
- 如果 Worker 也被 429，可以在 Worker 代码里调整 `hosts` 数组顺序或添加更多 Google 域名
- `google_proxy_url` 只对 Google 翻译源生效，微软/百度/DeepSeek 不走 Worker

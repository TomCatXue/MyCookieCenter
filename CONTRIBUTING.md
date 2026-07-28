# 贡献规范

本仓库采用 **"一脚本一文件夹"** 的组织方式，任何新增脚本请遵循以下规范。

---

## 📁 文件夹结构

每个脚本应该是一个独立子目录，放在对应的分类目录下：

```
app/
├── README.md           ← 分类索引(已有,只需更新表格)
└── <脚本名>/           ← 新建这个文件夹
    ├── <脚本名>.js     ← 脚本主体(抓 Cookie + 签到合一)
    └── README.md       ← 该脚本的详细文档
```

例如新增 App 脚本 `jd`（京东）：

```
app/
├── README.md           ← 在表格里加一行 jd
└── jd/
    ├── jd.js
    └── README.md
```

如脚本包含独立的 Cookie 抓取脚本，统一用点号风格命名（见下方"命名规范"）：

```
app/jd/
├── jd.js
├── jd.cookie.js
└── README.md
```

---

## 📝 添加步骤

### 1. 创建脚本目录

在 `app/` 下创建目录，放入脚本文件：

```
app/jd/jd.js
```

### 2. 写脚本 README

在脚本目录下创建 `README.md`，直接复制下方模板填写。

### 3. 更新分类索引

打开 `app/README.md`，在脚本清单表格里追加一行：

| [`jd/`](./jd/) | 京东 - 每日签到 | 🧪 待验证 |

### 4. 提交

commit message 建议：

```
feat: 新增 jd 脚本(京东每日签到)
```

---

## 📄 脚本 README 模板

直接复制下面这段，把所有 `<...>` 占位符替换成实际值。
**章节顺序固定**：图标预览 → 标题 → 简介 → 文件 → 使用步骤 → Loon → Surge → Quantumult X → Stash → 维护记录 → 已知限制 →（致谢，仅改造他人脚本时保留）。

> **README 只面向普通用户，只写「怎么用」。** 逆向过程、签名算法、密钥/盐/appSecret、接口路径、ret 码、解包/反汇编等实现原理**一律不写进 README，也不写进 `.js` 头注释** —— 这些放本地 `project.md`（被 git ignore，不进公开仓库）。用户相关的配置开关放 `BoxJS 参数` 表、注意事项放 `已知限制`。

````markdown
<p align="center">
  <img src="<图标 URL>" width="80" alt="<显示名>" />
</p>

# <显示名>

<一句话功能介绍：签到/领券，送什么>。

## 文件

- `<脚本名>.js` — 既是重写抓 Cookie 也是 cron 签到，根据 `$request` 是否存在区分
- `<脚本名>.cookie.js` — <如有独立 Cookie 抓取脚本则保留此行，否则删掉>

## 使用步骤

1. 按下方对应平台配置，开启重写脚本 + cron
2. 打开 <APP 名> → 进入 <触发页面>，触发 <触发接口>
3. 收到 `✅ <显示名> Cookie 获取成功` 通知即抓取成功
4. cron 会按计划自动签到

## BoxJS 参数

| key | 类型 | 说明 |
|---|---|---|
| `<脚本名>_clear` | bool | 开启后下次跑会清空已存鉴权(强制重抓) |
| `<脚本名>_debug` | bool | 打印完整 headers/body 到 console |
| `<脚本名>_task_<xxx>` | bool | 单任务开关(默认全开) |

## Loon

```ini
[MITM]
hostname = <域名>

[Script]
http-request <重写正则> tag=<显示名> Cookie, script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js, requires-body=false, img-url=<图标 URL>

cron "0 9 * * *" script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js, tag=<显示名>签到, img-url=<图标 URL>, enable=true
```

## Surge

```ini
[MITM]
hostname = <域名>

[Script]
<显示名> Cookie = type=http-request,pattern=<重写正则>,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js,img-url=<图标 URL>

<显示名>签到 = type=cron,cronexp=0 9 * * *,timeout=60,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js,img-url=<图标 URL>
```

## Quantumult X

```ini
[MITM]
hostname = <域名>

[rewrite_local]
<重写正则> url script-request-header https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js

[task_local]
0 9 * * * https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js, tag=<显示名>签到, img-url=<图标 URL>, enabled=true
```

## Stash

```yaml
cron:
  script:
    - name: <显示名>签到
      cron: '0 9 * * *'
      timeout: 60

http:
  mitm:
    - "<域名>"
  script:
    - match: <重写正则>
      name: <显示名> Cookie
      type: request
      require-body: false

script-providers:
  <显示名>签到:
    url: https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/<脚本名>/<脚本名>.js
    interval: 86400
```

## 维护记录

| 日期 | 变更 |
|---|---|
| YYYY-MM-DD | 初版 / 适配 / 修复 |

## 已知限制

- <列出已知问题、token 有效期、需手动刷新的场景等>
````

---

## 🧩 脚本头部规范

`.js` 脚本头部统一格式，新脚本直接套骨架改占位符。

### 主脚本头部

```js
/**
 * <显示名> · <一句话功能，送什么>
 *
 * 抓取：<打开哪个 APP → 进哪页 → 触发什么 → 抓什么凭据>
 * 签到：cron <做什么>（<可选提示；细节见 README>）
 *
 * @Author: <自研写维护者名 <url>；改造他人脚本写原作者，带 @>
 * @Updated: YYYY-MM-DD
 *
 * ===== Loon =====
 * ...(4 段平台配置，与本脚本 README 的四平台逐字一致)
 * ===== Surge =====   ===== Quantumult X =====   ===== Stash =====
 */

const $ = new Env("<显示名>");

const SCRIPT_VERSION = "YYYY-MM-DD.r1"; // 改一次 +1，确认拉到最新版
$.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}`);
```

### 规则要点

- 描述区两行对仗：`抓取：` + `签到：`（全角冒号）
- `SCRIPT_VERSION`：主脚本必带 + 首行 `$.log` 打印
- 入口判断统一 `if (typeof $request !== "undefined")`（双引号、`!==`）；若是 http-response 抓取则判 `$response`
- 4 段平台配置注释保留在头部，与 README 的四平台逐字一致
- 底部内联 `Env` 类，用 `// prettier-ignore` 标注

---

## 🏷️ 状态徽章约定

清单表格里"状态"列建议使用以下徽章：

| 徽章 | 含义 |
|---|---|
| ✅ 维护中 | 当前可用，定期验证 |
| 🧪 待验证 | 新增/改造完成，token 时效与稳定性尚未实测 |
| ⚠️ 待修 | 已知问题，暂未修复 |
| ❌ 已失效 | 接口下线或风控，无法使用 |
| 🔜 计划中 | 占位，尚未开发 |
| 📦 已归档 | 不再维护，仅保留历史 |

---

## 🧹 命名规范

- **脚本目录与文件名**：全小写，英文单词或缩写，如 `bilibili` / `weibo` / `wps`
- 单一标识不使用空格、驼峰、下划线、连字符，直接小写连写
- 副文件命名（cookie/api 等）用点号：`<脚本名>.<role>.js`
  - 例：`weibo.cookie.js` / `wps.cookie.js`
  - 不要用下划线（`xxx_cookie.js`）或连字符（`xxx-cookie.js`）
- README 标题可以用中文 + emoji，但**路径必须全英文**
- **脚本 tag 命名**：
  - 抓 Cookie 重写脚本：`<显示名> Cookie`（中文名与 Cookie 之间一个空格）
  - cron 签到脚本：`<显示名>签到`（纯中文直接拼接，不加空格）

---

## 📋 Commit Message 约定

简单遵守 conventional commits：

| 类型 | 含义 | 示例 |
|---|---|---|
| feat | 新增脚本/功能 | feat: 新增 jd 脚本(京东每日签到) |
| fix | 修复 bug | fix(bilibili): 修复签到接口失效 |
| docs | 仅改文档 | docs(wps): 更新已知限制说明 |
| refactor | 重构(行为不变) | refactor: 拆分到独立子目录 |
| chore | 杂项(依赖、配置) | chore: 更新 .gitignore |

---

## 📖 经验总结（基于实战踩坑）

以下经验来自本仓库微信读书系列插件的实际开发历程，适用于所有签到脚本和 VIP 破解脚本。

### 签到脚本经验

#### ✅ 成功实践

**1. 抓取 + 签到合一**

一个 `.js` 文件同时承载抓取和签到两个功能，入口用 `$request` 判断走哪条路：

```js
(async () => {
    if (typeof $request !== "undefined") {
        saveAuth();   // 抓取凭据
        $done({});
        return;
    }
    await runClaim();  // cron 签到
    $done({});
})();
```

好处：用户只需配置一个 script-path，减少配置项和出错面。

**2. http-request 被动捕获 + 去重写入**

`http-request` 匹配 App 流量后被动捕获凭据。但要**先比对再写入**，避免每次请求都写持久化存储：

```js
function saveAuth() {
    // 先提取 vid/skey
    // → 读取已存储的值
    // → 相同则直接 return（不做任何写入）
    // → 不同才提取全部字段并保存
}
```

**3. 请求头 key 大小写兼容**

不同代理平台（Loon/Surge/QX）回传的 header key 大小写不一致，必须用 `.toLowerCase()` 遍历匹配：

```js
for (let k in headers) {
    let key = k.toLowerCase();
    if (key === "vid") vid = headers[k];
    if (key === "skey") skey = headers[k];
}
```

**4. 通知要告诉用户「领了什么」**

签到完成的通知不能只写「成功领取 N 个」，要列出具体奖励内容：

```
WeRead · 领取完成
成功领取 2 个奖励
阅读时长·书币、阅读天数·体验卡
```

**5. Base64 body 编解码**

微信读书 App 所有接口的 request/response body 都是 Base64 编码（Content-Type 仍是 `application/json`），需要统一封装 `encode()` / `decode()`：

```js
function encode(obj) {
    let str = JSON.stringify(obj);
    if (typeof $base64 !== "undefined") return $base64.encode(str);
    return str;
}
```

#### ❌ 踩坑记录

**坑 1：Unicode 转义写中文**

早期在通知文案里用了 `\u2699\uFE0F`（齿轮 emoji）等 Unicode 转义，可读性极差、维护困难。后改为直接写中文。

> **规范**：脚本里的中文、emoji 一律直接写原文，不用 `\uXXXX` 转义。

**坑 2：http-request 匹配范围过宽**

`^https://i.weread.qq.com/` 匹配了该域名下**所有**请求（121 次/天），每次都触发 `saveAuth()`。虽然加了去重后开销小了，但更好的做法是收窄到特定接口（如 `/user/profile`）。

> **规范**：`http-request` 正则尽量收窄到「登录后必请求、且携带完整凭据」的单一接口，不要匹配整域。

**坑 3：`requires-body` 参数遗漏**

Loon 的 `http-request` 配置中 `requires-body=false` 被误删，导致脚本无法正常触发。

> **规范**：Loon `.plugin` 文件中 `requires-body=false` 对纯抓 header 的脚本不可省略。

**坑 4：Cookie vs vid/skey 认证体系混用**

早期版本用 Cookie 抓取，后改为 vid/skey 请求头。逆向笔记发现常规 API 其实只需要 `Cookie: wr_vid`（长期有效），skey 可能是多余的。

> **规范**：抓包分析阶段要搞清楚目标 App 的认证体系：是 Cookie、请求头、还是 Token。优先用长期有效的凭据，减少刷新依赖。

**坑 5：skey 无法自动刷新**

App 的 `/login` 接口有 `signature` 签名保护，无法在脚本中主动刷新 skey。导致领取脚本是「半自动」——cron 自动领，但 skey 过期后需手动开 App 重新捕获。

> **规范**：签到脚本设计阶段就要评估凭据有效期。如果凭据短期过期且无法自动刷新，要在通知里明确提示用户「请打开 App 刷新」。

**坑 6：一次性调试脚本残留**

开发期间写了 `_check_js.py`（Loon 兼容性检查）、`_check_cookie.py`（HAR 分析）等一次性脚本，完成后忘记清理，残留在仓库根目录。

> **规范**：逆向分析用的临时脚本不进仓库。如需保留分析过程，写入 `notes/` 目录并附结论，脚本本身用完即删。

### VIP 破解脚本经验

#### ✅ 成功实践

**1. http-response 拦截 + 递归清洗**

VIP 破解走的是 http-response 拦截，修改服务端返回的 JSON。用递归函数统一清洗所有嵌套层级的更新/版本字段：

```js
function deepStrip(obj) {
    var kill = ["forceUpdate", "needUpdate", "mustUpdate", ...];
    for (var i = 0; i < kill.length; i++) {
        if (obj[kill[i]] !== undefined) delete obj[kill[i]];
    }
    for (var key in obj) {
        if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
            deepStrip(obj[key]);
        }
    }
}
```

**2. 区分签名接口与非签名接口**

逆向分析发现接口分两类：
- **无签名接口**（`/pay/balance`、`/weekly/exchange`）：可直接修改响应，难度低
- **有签名接口**（`/pay/memberCardSummary`）：有 `signature` + `random` + `timestamp` 三重校验，无法伪造

策略：**绕过签名接口，直接改无签名接口的响应**。如果 App 拿到的余额是 99999、会员过期时间被改成 30 天后，前端就不会触发付费墙。

**3. feconfig 不拦截只洗字段**

`/feconfig/getBundles` 等配置接口不要直接拦截返回假数据，会让 App 崩溃。正确做法是**让它正常过，只递归洗掉更新字段**。

**4. 老格式会员兼容**

新版 App 可能用新格式存储会员状态，但老格式（固定 `signature` 值 + 固定字段结构）仍然被前端兼容。直接构造老格式响应比逆向新签名更简单可靠。

#### ❌ 踩坑记录

**坑 7：尝试逆向签名接口（死路）**

曾尝试逆向 `/pay/memberCardSummary` 的 `signature` HMAC Key，需要从 IPA 二进制中定位，难度极高且不可维护（App 更新后 Key 可能变）。

> **规范**：签名接口不要逆向，绕过它去改无签名接口的响应。如果核心状态接口有签名，改它依赖的下游展示接口。

**坑 8：修改 `canExchange` 字段无效**

尝试修改 `/pay/membercardexitems` 的 `canExchange` 字段来解锁兑换，但 App 实际走的是 IAP（Apple 内购）流程，服务端二次验证，改前端字段无法白嫖。

> **规范**：涉及实际付费/兑换的接口，客户端修改无法绕过服务端验证。只改「展示类」字段（余额数字、会员天数、过期时间），不改「交易类」字段。

**坑 9：阅读时长无法通过 HTTP 伪造**

`/app/onlineTime` 接口虽然无签名（请求体仅 `{"time": 60}`），但服务端有「行为特征联合判断」反作弊，且真实上报是持续渐进的（每几秒一次），Loon cron 脚本有超时限制无法模拟。

> **规范**：阅读时长、在线时长等「服务端累加 + 行为分析」类数据，无法通过 Loon 脚本伪造。这类需求需走网页版方案（如 [midpoint/weread](https://github.com/midpoint/weread)，部署在 GitHub Action 长时运行）。

### 通用规范清单

| 类别 | 规范 | 来源 |
|------|------|------|
| 通知文案 | 直接写中文，不用 `\uXXXX` 转义 | 坑 1 |
| http-request | 正则收窄到单一接口，不匹配整域 | 坑 2 |
| Loon 配置 | `requires-body=false` 不可省略 | 坑 3 |
| 认证设计 | 优先用长期有效凭据，减少刷新依赖 | 坑 4 |
| 凭据过期 | 无法自动刷新时，通知明确提示用户 | 坑 5 |
| 临时脚本 | 不进仓库，用完即删，结论写 notes | 坑 6 |
| VIP 破解 | 绕过签名接口，改无签名展示接口 | 坑 7 |
| 交易字段 | 只改展示类，不改交易类 | 坑 8 |
| 时长伪造 | 服务端累加型数据不碰，走网页版方案 | 坑 9 |
| Env 类 | 内联在脚本底部，用 `// prettier-ignore` 标注 | 成功 1 |
| 版本号 | 主脚本带 `SCRIPT_VERSION` + 首行 `$.log` 打印 | 头部规范 |
| commit | 写有意义的 message，不用「更新」「22」 | 全历史 |

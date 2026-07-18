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

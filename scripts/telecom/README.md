# 中国电信 · 凭据捕获与执行专区

> 聚合中国电信全系福利与自动化服务，覆盖：**周三会员日双抽奖 + 幸运抽奖**、**营业厅 0 点等级话费偷跑秒杀**、**山西电信体验 AI 月初领福利**。本专区严格遵循「抓取与执行彻底分离」：Loon 侧只负责捕获凭据并即时通知，全部业务执行由青龙面板调度。

---

## 📂 业务架构与脚本矩阵

| 业务板块 | 抓取脚本 (Loon) | 执行侧 (青龙) | 核心机制与特性 |
| :--- | :--- | :--- | :--- |
| **会员抽奖凭据** | [`telecom_cookie.js`](./telecom_cookie.js) | `ql_script/telecom_daily.py` | 专职捕获 32 位 SessionKey、11 位手机号与批次活动号，抓到即通知，仅落盘不执行。覆盖山西甄选周三会员日 (`hd76690472`)、每周三次 (`hd92859166`)、权益商城幸运抽奖 (`A20250114...`)。 |
| **等级话费凭据** | [`telecom_rights.js`](./telecom_rights.js) | `ql_script/telecom_midnight_equity.py` | 进营业厅 App 捕获 sign/Cookie/accId 并回填；0 点抢兑由青龙执行。 |
| **山西福利凭据** | [`telecom_benefit.js`](./telecom_benefit.js) | `ql_script/telecom_daily.py` | 自动侦测月初放水批次代码并捕获 Ticket，新批次更新即通知，仅落盘不执行。 |

---

## 🛠️ 核心逆向技术揭秘

### 1. C005 混合加解密链路 (周三会员日与幸运抽奖)
电信权益专区与翼支付通信采用了 **C005 一机一密加解密规范**：
- **动态公钥获取**：会话调用 `https://mapi-h5.bestpay.com.cn/gapi/mapi-gateway/applyLoginFactor` 获取动态 RSA 公钥；
- **临时会话密钥**：客户端随机生成 16 位 AES Key，经 RSA (PKCS#1 v1.5) 加密置于请求体 `key` 字段；
- **业务数据加密**：业务参数序列化后经 AES-128-CBC (IV全0、PKCS7 Padding) 加密置于 `data` 字段；
- **消息摘要校验**：原始业务 JSON 经 MD5 运算生成 32 位大写签名置于 `sign` 字段；
- **零依赖移植**：脚本内嵌完整纯 JS 加密引擎，无外部 npm 依赖，在 Loon/Surge 纯 JS 解释器中原生直跑。

### 2. 毫秒级偷跑与阶梯突发秒杀 (等级权益抢兑)
- **23:59:59.750 提前扣动扳机**：提前 250ms 直发第一枪，对冲 50~100ms 空口网络传输与系统调度延迟，确保请求在 00:00:00.000 瞬间精准撞线；
- **4 枪阶梯并发**：750ms 黄金窗口内密集发射 4 枪（23:59:59.750、23:59:59.950、00:00:00.200、00:00:00.500），只要任意一枪中奖立即安全收拢。

---

## 📱 使用与全自动配置指南

### 1. 统一插件订阅安装
在 Loon 中直接订阅一站式插件合集：
```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/CookieCenter.plugin
```
在插件设置中按需开启对应开关：**`telecom_draw`**（会员抽奖）、**`telecom_rights`**（等级权益）、**`telecom_benefit`**（山西福利），三者独立控制。

### 2. 统一 BoxJS 订阅面板
在 BoxJS 中添加订阅：
```text
https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/boxjs/CookieCenter.boxjs.json
```
BoxJS 中按业务拆分为三个应用卡片，可查看已捕获的凭据。点击数据行会打开原生「数据查看器」，其中 value 右侧有复制按钮，可直接取出粘贴到青龙。

### 3. 凭据捕获
- **会员抽奖**：打开微信小程序「中国电信5G会员」任意页面，即自动捕获 SessionKey 与手机号，并弹出「会员凭据已就绪」通知。抓取脚本不发起任何抽奖请求。
- **等级话费**：打开「中国电信营业厅」App ->「我」->「签到」或「等级权益」页，捕获 sign / Cookie / accId 并通知。
- **山西福利**：打开山西活动页即捕获批次凭证；检测到新批次时通知，同批次 10 秒内去重。

> 抽奖、秒杀与领奖全部由青龙面板执行，Loon 侧不含任何业务执行逻辑。

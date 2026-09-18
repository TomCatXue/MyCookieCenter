# 微信读书 · 全功能自动化任务（青龙 / Loon 双栖聚合版）

> 一站式聚合：**每日阅读时长领卡**、**每周二翻牌抽奖**、**每周五限免图书自动入架**。内嵌 100% 逆向还原的 `/login` 签名换票引擎，实现真正的**全自动脱机自愈换票**，支持青龙面板（Node.js）与 Loon / Surge / Quantumult X 双栖部署。

---

## 📂 极简配置设计

我们遵循“最少心智负担”原则，**青龙面板只需配置 1 个环境变量（凭据本身），所有子任务开关直接在脚本顶部修改 `true` / `false` 即可**：

```javascript
// 位于 scripts/weread/weread.js 顶部最前方：
const CONFIG = {
    ENABLE_CLAIM: true,   // 1. 每日阅读时长与签到领卡 (每天 23:00)
    ENABLE_FLIP:  true,   // 2. 每周二翻牌抽奖 (每周二自动触发，非周二自动跳过)
    ENABLE_FREE:  true,   // 3. 每周五限免好书入架 (每周五自动触发，非周五自动跳过)
    PREFER_COIN:  true,   // 4. 奖励偏好：true=优先书币 (推荐)，false=优先体验卡
    FORCE_RUN:    false,  // 5. 调试模式：平时 false。为 true 时无视星期几，强制跑完所有任务
    MANUAL_AUTH:  ""      // 6. [可选] 如果不想配环境变量，也可直接把 JSON 粘在此处
};
```

---

## 🐲 青龙面板配置（只需 1 分钟）

### 1. 添加定时任务
在青龙面板「定时任务」中新建任务：
- **名称**：`微信读书 · 全功能自动化任务`
- **命令**：`task weread.js`
- **定时规则**：`0 23 * * *`（每晚 23:00 执行一次）

### 2. 添加环境变量（仅需这 1 个！）
在青龙面板「环境变量」中新建变量：
- **名称**：`WEREAD_AUTH`
- **值**：填入从 BoxJS 或手机 Loon 导出的完整 JSON 凭据，形如：
  ```json
  {"vid":"12345678","skey":"...","refreshToken":"...","deviceId":"..."}
  ```
> **多账号支持**：如有多个账号，直接在变量值中**换行**粘贴下一个账号的 JSON 即可。

---

## 🔑 核心灵魂：如何实现“100% 永久脱机换票”？

微信读书虽然短期 `skey`（App端）和 `wr_skey`（网页端）几天就会失效，但其底层拥有一套标准的 OAuth 刷新机制：
1. **冷启动捕获长效种子（仅需做一次）**：
   - 在手机端使用 Loon 挂载 `CookieCenter.plugin`；
   - 打开微信读书 App，**退出当前账号并重新登录一次**；
   - 此时 Loon 会拦截 `/login` 接口，并捕获保存 **`refreshToken`** 和 **`deviceId`**；
2. **导入青龙**：
   - 从 BoxJS 中导出 `weread_auth_v2` 的 JSON 凭证，填入青龙的 `WEREAD_AUTH` 环境变量；
3. **脱机闭环自动运转**：
   - 脚本在青龙中运行，当发现 `skey` 或 `wr_skey` 过期返回 401 时；
   - 脚本自动在青龙本地调用内置的 `computeLoginSignature` 纯 JS 算法，携带 `refreshToken` 和 `deviceId` 向微信读书官方 `/login` 发起换票；
   - 换票成功后，**自动获取新 skey、新 accessToken（同步为 wr_skey）与新 refreshToken**；
   - 脚本自动将最新会话回写到青龙本地 `./weread_session.json` 缓存文件中，下一次定时运行时无缝继承；
   - **从此彻底脱机，无需再打开手机 App！**

---

## 📱 本地 Loon 插件配置

如果需要在手机 Loon 中运行，可以直接在插件中挂载：
```ini
[Script]
# 每日 23:00 全自动执行（自动识别星期几翻牌与领书）
cron "0 23 * * *" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/scripts/weread/weread.js, tag=微信读书·全功能任务, img-url=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/icons/weread.png, enable=true
```

---

## 📂 文件清单说明

| 文件名 | 用途 |
| :--- | :--- |
| **`weread.js`** | **【推荐】全功能三合一主任务脚本（青龙 / Loon 双栖，支持脱机自愈换票）** |
| `weread_cookie.js` | 专用凭证捕获脚本（由 Loon / Surge 调用，手机端抓取各业务线凭据） |
| `weread_claim.js` | 历史独立单体：仅每日签到与阅读奖励 |
| `weread_flip.js` | 历史独立单体：仅每周二翻牌抽奖 |
| `weread_free.js` | 历史独立单体：仅每周五限免图书入架 |

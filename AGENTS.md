# Repository Guidelines

## Project Structure & Module Organization

- `scripts/`: Core proxy automation scripts grouped by ecosystem (`weread/`, `telecom/`, `tools/` for standalone utilities like `bilibili`, `pixiv`, `github`).
- `ql_script/`: Qinglong panel tasks (`weread.js`, `telecom_wednesday.py`) with embedded `@cron` headers, single-variable configuration, and self-healing token renewal.
- `loon/`: Loon `.plugin` configuration files (`CookieCenter.plugin` for central auth/cron, plus standalone tool plugins).
- `boxjs/`: BoxJS subscription schemas (`CookieCenter.boxjs.json`) for credential persistence and app settings.
- `notes/` & `docs/`: Technical reversing notes, protocol analyses, and onboarding guides (`add-app.md`, `add-plugin.md`).
- `icons/`: Image assets for plugins and BoxJS apps.

## Build, Test, and Development Commands

This repository contains standalone JavaScript and Python automation scripts; no compilation step is required.

- `node --check <script.js>`: Verifies JavaScript syntax and parse readiness.
- `python -m py_compile <script.py>`: Verifies Python script syntax.
- `node -e "JSON.parse(require('fs').readFileSync('boxjs/CookieCenter.boxjs.json','utf8')); console.log('JSON_OK')"`: Validates BoxJS JSON syntax.
- `python ql_script/telecom_wednesday.py`: Executes the Qinglong script locally using configured environment variables.
- `git status --short`: Confirms the working directory is clean before committing.

## Coding Style & Naming Conventions

- **JavaScript / Python**: Use 2-space or 4-space indentation consistently. Normalize HTTP headers with `.toLowerCase()`. Avoid Unicode escaping for Chinese and emojis.
- **Naming**: Directory and script names must be lowercase English identifiers (`bilibili`, `telecom`). Secondary helper scripts use dot notation (`<name>.<role>.js`).
- **Script Headers**: Main scripts must define `SCRIPT_VERSION = "YYYY-MM-DD.rX"` logged on launch and include the inlined `Env` multi-platform adapter at the bottom.
- **Loon Plugins**: Files in `loon/` must include `#!version` and a timestamped `#!date = YYYY-MM-DD HH:mm` (minute precision is required on every change).

## Testing Guidelines

- Run syntax validation (`node --check`, `py_compile`) and JSON validation prior to commit.
- Test credential capture and task execution inside proxy clients (Loon, Surge, Quantumult X, Stash) or a Qinglong instance using sandbox accounts.
- Verify notification formatting, ensuring specific reward names are reported rather than vague counts.

## Commit & Pull Request Guidelines

- **Commit Format**: Conventional Commits `<type>(<scope>): <subject>`.
  - Common types: `feat`, `fix`, `refactor`, `chore`, `docs`.
  - Example: `feat(telecom): add prize history readout (v1.3.0)` or `fix(weread): handle skey refresh`.
- **Pull Requests**: Explain the target platform, verify syntax, link any related issues, and bump `SCRIPT_VERSION` or `.plugin` metadata when modifying scripts. Never commit active session tokens or one-off reverse-engineering scratch scripts.

## Telecom & iMusic Automation Guidelines

中国电信官方网关与爱音乐（iMusic）活动协议开发的沉淀经验与核心规范：

### 1. 电信网关登录与风控防线
- **严禁循环重登**：电信官方 0716 登录网关（`appgologin.189.cn:9031/login/client/userLoginNormal` 以及 `/map/clientXML` 获取 Ticket）短时间内连续调用会直接触发反爆破风控（`[登录失败] 操作过于频繁，请稍后再试`）。每个账号单次任务运行中只允许执行一次初始登录。
- **Ticket 单次消费属性**：电信网关下发的 SSO Ticket 为一次性票据，在调用 `sso_login_v2` 成功后服务端即将其标记为已核销。严禁在后续流程中重复复用旧 Ticket，若发生会话异常不可盲目反复置换。
- **Token 超长生命周期**：爱音乐平台换发的活动鉴权 JWT Token（`h5Authorization`）实测有效期长达 72 小时（3天）。当后续业务接口返回 `0007` 或 `10013` 时，绝大部分是因为 Cookie 缺失、接口废弃或参数污染，切勿误判为 Token 过期而触发重新登录。

### 2. 爱音乐网关加密与鉴权机制
- **Cookie 强依赖性（`user118100cn`）**：爱音乐 `/au/`（已鉴权接口）以及活动相关 `/hapi/en/api` 网关实行“Header Bearer Token + Session Cookie”双重校验。实测表明，即使 Token 有效，若缺少 Cookie `user118100cn`，网关必报 `{"code":"0007","desc":"Token授权验证失败"}`。因此在 `sso_login_v2` 响应后，必须捕获 `user118100cn` 并牢牢注入 `requests.Session`（跨 `ai.imusic.cn` 与 `.imusic.cn` 域）。
- **动态 AES-128-CBC 加密规范**：前端请求采用动态时间戳和随机盐（`imtimestamp`, `imrandomnum`, `imencryptkey`）。加密前必须调用 `refresh()` 保证时间戳与密钥对实时同步，请求 URL 以 `?formData=<urlencode(enc_data)>` 方式发起，解密严格对应响应 Base64 密文。
- **制作接口标准与备用通道**：
  - 现网生产标准制作接口为 **`POST /hapi/diy_video/au/template_make_add`**。
  - 过时的 `template_make_add_v2` 包含过时废弃参数（如 `autoOrderUgc`, `fromType`, `sessionId`, `voice` 等），会触发 `10013 网络异常`。
  - 备用通道支持免鉴权网关接口 **`POST /hapi/en/api`**（`apiName: "diy/DiyVideoApi/unTemplateMake"`），主通道异常时自动降级 fallback。

### 3. 活动期数自适应与字段语义
- **动态期数感知**：跨期周期性活动（如每15天一期的AI奇遇赢Pad）严禁写死期数或模板（如 `ai119_4` / `ve_3949`）。必须先调用 `act/LaborApi/getOperationCurrentIssueInfo` 动态读取当前有效期数标识（如 `ai119_5`）与模板列表（如 `ve_4352 福满中秋`），杜绝跨期无效制作。
- **制作资格字段真实语义**：
  - `queryAiMakePkgInfo` 返回的 `privilegeVrbtAIVideoLeftNum`（及 `balanceMakeTimesTip` 标签）包含用户抽奖获得、活动权益转化的真实可用制作券。每次成功制作均能正常获得 20 积分与 Pad 券码，不可因字段名带 `privilegeVrbt` 误判为无关彩铃配额而漏做。
  - 活动期数上限：官方规则设定每期 AI 制作最多获得 340 点数（17次），每期最多获得 3 张 Pad 券码。通过 `act/LaborApi/getOperationRecordList` 汇总当前期数已入账点数，触顶 340 点后安全停机，避免无意义请求。

### 4. 真实资产驱动与积分兑换策略
- **消除假加点与盲目汇报**：严禁在接口返回 `0000` 时单方面假定已获得积分。必须在制作前后通过 `act/LaborApi/getOperationTotalScoreOrRemainingScore` 查验服务端真实积分差值（`earned = after - before`），仅在 `earned > 0` 时确认成功，未增点时明确标注“已达本期上限”。
- **优先攒点与禁止默认抽奖**：默认策略必须聚焦于长线跨期累计积分（直至满 1000 点兑换 10 元话费）。坚决禁止将 20 点抽奖设为自动循环消耗，防止蚕食已积累积分资产。
- **1000点兑换话费防重保护**：兑换前必须向官方重新查验实时可用积分 >= 1000。严格识别返回结果，明确成功方更新状态，遇“库存不足 / 已兑完 / 活动结束”立即停止尝试，遇网络超时记录为“待确认”，严禁自动盲目重试导致重复扣点。

### 5. 隐私合规与微信读书极简排版
- **内置活动/邀请链接脱敏**：脚本内部使用的固定活动入口链接（包含 `invitationCode`、`isshare` 等关键参数）必须作为代码常量静默用于 Referer 与内部路由。**严禁在日志输出、控制台打印、通知推送中泄露该 URL、邀请码或邀请相关文案**。
- **极简单行 Bullet 通知**：统一采用微信读书单行 Bullet（`• `）极简结构汇报，准确汇报“制作状态”、“券码持有量”、“话费兑换进展”、“当前点数余额”，保持界面整洁清晰。


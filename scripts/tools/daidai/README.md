# 呆呆面板 · 凭据自动同步

把 BoxJS / Loon 已捕获的凭据写入呆呆面板环境变量，实现“抓取即同步”，彻底免去手动复制。

## 它是怎么工作的

呆呆面板提供 Open API：

1. 用 `App Key + App Secret` 调用 `POST /api/open-api/token`，换取 24 小时 Bearer Token。
2. 用 Token 调用 `GET /api/envs?names=<变量名>&all=1` 查询同名变量。
3. 变量不存在则 `POST /api/envs` 创建；只存在一条则 `PUT /api/envs/<id>` 更新；
4. 存在多条同名变量时，通过账号唯一标识（微信读书 `vid`、中国移动 `phone`、扫描全能王 `client_id`）精准定位并更新对应变量；若未匹配到当前账号，主动触发熔断拒绝覆盖，杜绝误伤和多账号串号！

## 安装与配置

1. 在呆呆面板「Open API」创建应用，至少勾选 `envs`（环境变量）权限。
2. 安装 Loon 插件 [`DaiDaiPanel.plugin`](../../../loon/DaiDaiPanel.plugin)。
3. 配置面板连接（以下两种方式任选其一，自动双向同步）：
   - **方式一（Loon 插件直接配置）**：安装插件时直接在参数中填写 `daidai_url`、`daidai_key`、`daidai_secret`；
   - **方式二（BoxJS 配置）**：订阅 BoxJS [`DaiDaiPanel.boxjs.json`](../../../boxjs/DaiDaiPanel.boxjs.json)，进入「呆呆面板 · 凭据自动同步」卡片填入面板地址与密钥。
4. 在 Loon 插件中点「呆呆面板·手动一键同步」测试连接；验证成功后即可放心使用。

> 手机必须能访问面板地址；若面板部署在内网宿主机，请填入局域网 IP（例如 `http://192.168.1.10:5700`），不要填 `127.0.0.1`。

## 默认同步映射

| BoxJS 键 | 面板环境变量名 | 默认状态 | 账号标识特征 |
| :--- | :--- | :---: | :--- |
| `weread_auth_v2` | `WEREAD_AUTH` | ✅ 开启 | `vid` (自动携带 prefer_coin) |
| `cmcc_auth` | `CMCC_AUTH` | ✅ 开启 | `phone` (长期 app_token) |
| `camscanner_data` | `camscanner_data` | ✅ 开启 | `client_id` |
| `telecom_draw_session_key` | `TELECOM_DRAW_SESSION_KEY` | ❌ 关闭 (本地留存) | 电信主脚本读取复合变量 `dxlin` |
| `telecom_rights_auth` | `TELECOM_RIGHTS_AUTH` | ❌ 关闭 (本地留存) | 0点秒杀脚本读取 `dxlin` 自行登录 |
| `sx_benefit_cookie` | `SX_BENEFIT_COOKIE` | ❌ 关闭 (本地留存) | 暂无对应自动化脚本 |

若你需要自定义目标变量名，可在 BoxJS 的「映射（高级）」中配置 JSON 数组：

```json
[
  {"key":"weread_auth_v2","name":"WEREAD_AUTH","group":"微信读书","enabled":true},
  {"key":"cmcc_auth","name":"CMCC_AUTH","group":"中国移动","enabled":true},
  {"key":"camscanner_data","name":"camscanner_data","group":"扫描全能王","enabled":true}
]
```

## 触发机制

- **抓取即同步（单开关合一）**：在 `DaiDaiPanel.plugin` 中开启对应应用开关（如 weread、cmcc_mark、camscanner），进入对应 App 触发抓包成功写入后，就地异步推送到呆呆面板；内置 3.5s 熔断保护，不卡死 App 上网。
- **每日巡检兜底**：每天 `03:09` 定时自动同步一次，防止网络临时波动或漏触发。
- **手动全量同步**：在 Loon 插件管理页点击「呆呆面板·手动一键同步」，即可随时触发全量检测与推送。

## 验证与调试

```powershell
node --check scripts/tools/daidai/sync.js
node -e "JSON.parse(require('fs').readFileSync('boxjs/DaiDaiPanel.boxjs.json','utf8')); console.log('JSON_OK')"
```

# TestFlight Relay · Loon

把 [ScriptingApp/Community-Scripts](https://github.com/ScriptingApp/Community-Scripts) 的 TestFlight 中转脚本适配到 Loon。账号上下文只保存在本机 Loon 持久化存储，不上传服务器，也不进入本仓库。

## 文件

| 文件 | 用途 |
| :--- | :--- |
| `TestFlight-Relay.js` | 上游跟随加载器：拉取原版、打 Loon 补丁、缓存 1 小时 |
| `../../loon/TestFlightRelay.plugin` | 一键导入的 Loon 插件 |
| `../../icons/testflight.png` | 原版 TestFlight App Store 图标 |

## 为什么不能直接填上游 raw 脚本

上游 `module/scripts/TestFlight-Relay.js` 是 Surge 写法，在 Loon 有两处不兼容：

1. `const req = this.$request ? ...`：模块作用域下 `this` 可能为空，HTTP 请求会被误判成定时任务，直接放行并断开连接。
2. `if (!globalThis.$task) return request;`：Loon 没有 `$task`，会把改写后的 `http://tf-relay.test/... → https://testflight.apple.com/...` 交回代理续发；Loon 不支持这种跨域 + http→https 续发，会切断连接。

直接使用上游 raw 链接会表现为 TestFlight 打开即「网络连接已断开」。因此插件不能把 `script()` 直接指向 raw，而是指向一个很小的加载器；加载器内部的源地址仍然是作者原版链接。

## 加载器如何跟随上游

1. 请求或 cron 触发 `TestFlight-Relay.js`；
2. 加载器请求作者原版 raw：

   ```text
   https://raw.githubusercontent.com/ScriptingApp/Community-Scripts/refs/heads/main/module/scripts/TestFlight-Relay.js
   ```

3. 只做两处文本补丁：
   - `this.$request` → 全局 `$request` 判定；
   - `if (!globalThis.$task) return request;` → Loon 同时具备 `$httpClient` 时走脚本代发；
4. 用 `eval` 执行修补后的原版脚本，业务逻辑仍由上游处理；
5. 补丁后的脚本缓存到 Loon 持久化 `tf.relay.loon.upstream.v1`，默认 1 小时。cron 每 5 分钟运行一次，缓存到期后自动拉新，所以作者更新后最长约 1 小时生效。

> 上游若改写这两处代码结构，加载器会打印 `warning: upstream patch pattern changed`，需要同步更新加载器；上游若已自行适配 Loon，补丁会自动变成 no-op。

> 加载器会下载并执行上游原版代码；请确认你信任该仓库。缓存只写入本机 Loon 持久化，不上传。

## 安装：插件

1. 先停用其他 TestFlight Relay 插件，避免两条规则同时命中；
2. Loon → 插件 → 右上角 `+` → 粘贴：

   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/loon/TestFlightRelay.plugin
   ```

3. 启用插件，确认脚本下载成功；
4. 后台划掉 TestFlight，回到 Scripting 脚本重新点「启动 TestFlight」。

要求 Loon `>= 3.5.1 (983)`（插件使用新版 `request if ... then script(...) with ...` 语法）。

> 插件里的脚本链接指向本仓库 `main`。首次使用前需要先把 `loon/TestFlightRelay.plugin` 与 `scripts/tools/testflight-relay/` 推送到 GitHub；未推送时请直接用下面的本地脚本方式。

## 安装：本地脚本（对应编辑脚本截图）

1. 把 `TestFlight-Relay.js` 放到 `iCloud/Loon/Script`；
2. Loon → 配置 → 本地脚本 → `+` → 脚本类型选「请求」；
3. 根条件组添加 URL：

   ```text
   ^http:\/\/tf-relay\.test(?::8799)?\/
   ```

4. 脚本位置选「本地」，脚本名称选 `TestFlight-Relay.js`；
5. 标签填 `TestFlight-Relay.js`，图标选 `icons/testflight.png`；
6. 超时填 `30000`（毫秒，即 30 秒）；
7. 「需要 Body」打开，「二进制 Body 模式」关闭，「调试」保持关闭；
8. 可选：再建一个「定时任务」条目，Cron 填 `0 */5 * * *`，同一脚本，超时 `300000`（5 分钟），标签 `TestFlight-Relay-Refresh`。

> 首次运行需要联网拉取上游；之后命中本地缓存。若拉取失败且无缓存，请求会收到 502 JSON 错误，不会静默断网。

## 自查

在设备上（Loon 开启）访问：

| 地址 | 期望 |
| :--- | :--- |
| `/api/v1/store-accounts` | 200 + 账号列表 JSON |
| `/api/v1/control/status` | 200 + 已记录的客户端协议版本 |
| `/api/v1/nothing` | 404 + `{"error":{"code":"not_found"}}` |
| `/v1/appCategories`、`/v4/accounts/<id>/apps` | 返回 JSON，而不是连接中断 |

不要用根路径 `http://tf-relay.test/` 判断健康度：脚本对 `/` 没有路由，会走转发分支。

## 图标

直接使用 TestFlight 原版 App Store 图标：

```text
https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b3/ed/fb/b3edfb91-3ac2-080e-f4a1-49b5f93c7f31/AppIcon-0-1x_U007epad-0-1-0-P3-85-220-0.png/512x512bb.jpg
```

## 来源与免责声明

- 脚本与协议实现：[@ScriptingApp/Community-Scripts](https://github.com/ScriptingApp/Community-Scripts) 的 `module/scripts/TestFlight-Relay.js`、`module/TestFlight-Relay.sgmodule`，版权归原作者。
- 本仓库仅做 Loon 兼容性适配，不改变业务逻辑。
- 仅供个人学习与自用。中转/多账号方案可能违反 Apple 的服务条款，账号风险由使用者自行承担；请勿粘贴 Cookie、AMD、kbSync、密码等任何凭据。

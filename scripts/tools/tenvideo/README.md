# 腾讯视频 · 抓取与签到

> 内化自 [MaYIHEI/paperclip · app/tenvideo](https://github.com/MaYIHEI/paperclip/tree/main/app/tenvideo)（原作者 [@WowYiJiu](https://github.com/WowYiJiu)），按需改造。

配套插件：[`TencentVideoCheckin.plugin`](../../../loon/TencentVideoCheckin.plugin)

## 两个开关

| 开关 | 默认 | 作用 |
| :--- | :---: | :--- |
| `capture` | 开 | 抓取 Cookie。打开腾讯视频 → 我的 → 点头像下的「视频VIP」进会员中心即可 |
| `checkin` | 开 | 每日 00:10 自动续期 + 签到领 V力值 |

两个开关互相独立：抓完 Cookie 后可以关掉 `capture`（续期不依赖 MITM），只留 `checkin` 跑定时。

## 为什么能从 App 直接抓

腾讯视频 App 的「会员中心」是个 WebView，拉任务列表时请求：

```
https://vip.video.qq.com/rpc/trpc.new_task_system.task_system.TaskSystem/ReadTaskList
```

这个请求的 `Cookie` 头就带着 `vqq_vuserid` / `vqq_vusession` / `vqq_refresh_token` 全套。

上游 `2026-10-28.r3` 把抓取正则收窄成了 `^https://pbaccess\.video\.qq\.com/`，
而 App 的会员中心不走 `pbaccess`（只有小程序走），所以只能靠微信小程序抓。

本版把范围放宽到 `vip | pbaccess | access | film | m` 五个域，App 直接抓。

## 自动续期的三个坑（已修）

`vusession` 只有 2 小时寿命，签到前必须用 `refresh_token` 换新的。

### 坑 1：整串覆盖会冲掉 `refresh_token`

```js
// 上游写法
const cookie = normalizeCookie($request.headers["cookie"]); // 只取这一次请求的
if (hasRT) $.setdata(cookie, CK);                           // 直接覆盖旧的
```

App 里不同请求带的 cookie 不一样。某个只带 `vqq_vusession` 的请求，
另一个只带 `vqq_access_token` 的请求 —— 谁最后到就把整串覆盖。
这是「抓到了但 cron 报缺 refresh_token」的根因。

**本版**：增量合并。旧 cookie 打底，新请求的非空字段覆盖，空字段不删旧值。

### 坑 2：字段名写死 QQ 那套

```js
cookie = setCookieVal(cookie, "vqq_vusession", newVusession);
cookie = setCookieVal(cookie, "v_vusession", newVusession); // 微信登录才用
```

微信登录账号里本来没有 `vqq_vusession`，这行会凭空塞一个进去。

**本版**：QQ（`vqq_*`）和微信（`v_*`）两套都认，写回时只写原本存在的那个字段。

### 坑 3：刷新令牌只看 body，漏掉 Set-Cookie

服务端把滚动后的令牌放 `Set-Cookie` 时，上游会漏掉 → 令牌不滚 → 过一阵失效。

**本版**：先吃 `Set-Cookie`，再用 body 覆盖，两处都收。

## 续期通道

| 通道 | 接口 | 说明 |
| :--- | :--- | :--- |
| A | `pbaccess…/Account/Refresh` | 只需 `vuid` + `vusession` + `vurefresh`，不要 qimei |
| B | `pbaccess…/WebLoginTrpc/NewRefresh` | A 失败时回放抓到的 body 兜底 |

另外，App 自己调续期接口时，`response` 规则会把滚动后的令牌顺手收下来（`capture` 开关控制）。

## 续期的边界

| 令牌 | 寿命 | 是否需要人工 |
| :--- | :--- | :--- |
| `vusession` | 2 小时 | 不需要，cron 每次先刷再签 |
| `refresh_token` | 服务端策略（经验 30~90 天滚动） | 不换设备、不反复登出登录就不用管 |

真失效时脚本会把状态标记为 `cookie` 并通知重抓。

## 通知

| 场景 | 通知 |
| :--- | :--- |
| 首次抓到 | `✅ 腾讯视频 Cookie 获取成功` |
| 换账号 / 令牌变了 | `✅ 腾讯视频 Cookie 已更新` |
| 同一账号会话轮换 | 静默（不打扰） |
| 签到成功 | `✅ 签到成功,获得 N V力值` |

## 文件

| 文件 | 说明 |
| :--- | :--- |
| `tenvideo.js` | 抓取 + 续期 + 签到三合一（靠 `$request` 是否存在区分阶段） |

## 使用

1. 装 `TencentVideoCheckin.plugin`，两个开关默认都开
2. 打开腾讯视频 → 我的 → 点「视频VIP」进会员中心
3. 收到 `✅ Cookie 获取成功` 后可关掉 `capture` 开关
4. `checkin` 保持开启，每天 00:10 自动跑

## 验证

脚本本地用 Loon 运行时模拟器跑了两组用例：

- **两开关**：开关独立生效、全关静默、不传参数默认开
- **回归（18 条）**：五域抓取、增量合并不冲 RT、无凭证不覆盖、续期双通道、响应收割、微信字段兼容、字段名不串

> ⚠️ 未验证项：真机 Loon 上 App 会员中心 WebView 能否解密。
> WebView 一般走系统网络栈能被 Loon 接管，但若腾讯对 `vip.video.qq.com` 做了 pinning 就会失败。
> 抓到第一次 Cookie 即说明通了。

# 腾讯视频 · 抓取与签到

> 内化自 [MaYIHEI/paperclip · app/tenvideo](https://github.com/MaYIHEI/paperclip/tree/main/app/tenvideo)（原作者 [@WowYiJiu](https://github.com/WowYiJiu)），按需改造。

配套插件：[`TencentVideoCheckin.plugin`](../../../loon/TencentVideoCheckin.plugin)

## 四个开关

| 开关 | 默认 | 作用 |
| :--- | :---: | :--- |
| `capture` | 开 | 抓取 Cookie。打开腾讯视频 → 我的 → 点头像下的「视频VIP」进会员中心即可 |
| `checkin` | 开 | 续期 + 签到领 V力值 |
| `lottery` | 开 | 抽奖，中奖推送 CDKey 与兑换链接 |
| `coupon` | 开 | 试领福利券（电影票 / 美团券包），有货就领 |

后三个在**同一次 cron 里依次执行**，跑完只发**一条**通知。

## 通知策略

**全部成功** → 合并成一条，首行是续期状态：

```
✅ 腾讯视频 · 每日任务完成
🔑 续期成功（App通道，令牌已滚动）
✅ 签到成功，获得 8 V力值
🎉 抽奖中奖：xxx
   CDKey：xxx
🎫 领券：嘿影电影票福利 成功
   券码：xxx
```

**有任一步失败** → 标题变成失败态，正文按「失败在前、成功在后」排列：

```
❌ 腾讯视频 · 有任务失败
❌ 签到鉴权失败: {...}
🎉 抽奖中奖：xxx
```

这样一眼能看出是哪一步出了问题，成功项也不会丢。

## 防风控

签到和抽奖脚本都带 **3~8 秒随机延迟**，在发第一个业务请求前 `await` 一次：

```js
function randomDelay() {
    const sec = 15 + Math.floor(Math.random() * 16); // 15..30
    return new Promise((r) => setTimeout(r, sec * 1000));
}
```

- 避免每天同一秒打同一接口，减少时间维度的风控特征
- **只加在 cron 路径上**，抓取（`request` 阶段）不加 —— 否则会卡住 App 的请求
- 同一脚本内多次请求不重复延迟，只延迟一次

## 抽奖（V力值首抽）

依据 2026-11-23 的真机 HAR 逆向：

| 动作 | 请求 |
| :--- | :--- |
| 抽奖 | `GET activity.video.qq.com/fcgi-bin/asyn_activity?platform=7&type=100143&option=100&act_id=<活动>&module_id=<奖池>` |
| 查资格 | `option=104` |
| 中奖返回 | `{ lotter_result:1, lotter_ext:"恭喜你，中奖了！", prize_list:[{ lotter_name, cdkey, lotter_url_h5 }] }` |
| 已抽过 | `{ ret:-904, msg:"很抱歉，您已经抽了没有资格再抽." }` |

**关键点：**

- `act_id` = `trr69dwle61dwisptr12gj12ja`（「新积分抽奖」活动）
- 每次抽奖只针对**一个** `module_id`（奖池），所以脚本逐个试已知奖池
- 抽中过的奖池会记住（`tenvideo_lottery_pool`），下次优先试它
- `ret:-904` = 该池今天已抽过 → 自动换下一个池
- 中奖会推送**完整 CDKey + 兑换链接**，直接点就能兑

## 领券

HAR 里还翻出两个 `type=100160` 的领券活动：

| 活动 ID | 名称 | 到期 |
| :--- | :--- | :--- |
| `tr607p8587ii7zp53eog20y565` | 嘿影电影票福利 | 2026-12-31 |
| `z4lpthi9h219lifagkksheez25` | 138元美团券包 | 2026-12-31 |

动作分工：

- `option=101` → 查状态，看 `data.has_right` / `data.left_times`
- `option=100` → 真正领取

**脚本先查状态、有资格才发领取请求**，避免每天两次无用请求。

> ⚠️ 手上没有「领取成功」的样本（抓包时两个券都已领完），
> 所以成功判定做成了保守策略：`ret===0` 且 `msg` 不含失败关键词就算领到，
> 同时把完整响应对到 Loon 日志里。第一次真领到时看日志确认字段名。

## 其他扫过但没做的

| 接口 | 为什么不做 |
| :--- | :--- |
| `credit_mall/cgi/getShelfTaskList` | 返回 `task_list:[]`，你的账号没有积分任务 |
| `CscoreWelfareSystem/GetHomePageAggregate` | 公益项目展示，纯信息展示无签到动作 |
| `DAGCommGateway/Do`（welfare_channel） | 会员福利页跳转，本身不发奖 |
| `RecvService/RecvState` | 东呈酒店福利，活动已过期（2025-12-31） |
| `comm_cgi`（get_cscore / bindphone / scoll） | 查询类与手机号绑定，无签到 |
| `film/x/magic-act/{7dhue0q…,106965}` | 一个是展示页，一个已过期 |

> ⚠️ 活动 ID 和奖池 ID 是活动期间的有效值。活动换期后会变，
> 届时需要重新抓一次 HAR 更新 `ACT_ID` 和 `POOLS` 常量。

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

### 坑 2：手机号登录的续期令牌叫 `v_vurefresh`，不叫 `*_refresh_token`

**这是「有 cookie 却一直报没有 refresh_token」的根因。**

腾讯视频三套登录方式的字段完全不同：

| 登录方式 | 用户 ID | 会话 | 续期令牌 |
| :--- | :--- | :--- | :--- |
| QQ | `vqq_vuserid` | `vqq_vusession` | `vqq_refresh_token` |
| 微信 | `vuserid` | `vusession` | `refresh_token` / `v_t_refresh_token` |
| **手机号** | `v_vuserid` | `v_vusession` | **`v_vurefresh`** ← 不在任何 `*_refresh_token` 里 |

上游只列了前两种的字段名。手机号登录账号的 `v_vurefresh` 是 118 字符的长令牌，
前端 `vplus.min.js` 里它和 `v_vusession` 归在同一组：
`["v_main_login","v_vuserid","v_vusession","v_vurefresh",...]`
—— 确认它就是续期令牌。

**本版**：别名表补上 `v_vurefresh` / `vurefresh`，手机号登录现在能正常续期。

### 坑 3：字段名写死 QQ 那套

```js
cookie = setCookieVal(cookie, "vqq_vusession", newVusession);
cookie = setCookieVal(cookie, "v_vusession", newVusession); // 微信登录才用
```

微信登录账号里本来没有 `vqq_vusession`，这行会凭空塞一个进去。

**本版**：QQ（`vqq_*`）和微信（`v_*`）两套都认，写回时只写原本存在的那个字段。

### 坑 4：刷新令牌只看 body，漏掉 Set-Cookie

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

## 抓取类通知

抓 Cookie 阶段只在这两种情况下弹通知，日常会话轮换是静默的：

| 场景 | 通知 |
| :--- | :--- |
| 首次抓到 | `✅ 腾讯视频 Cookie 获取成功` |
| 换账号 / 令牌变了 | `✅ 腾讯视频 Cookie 已更新` |
| 同一账号会话轮换 | 静默（不打扰） |

签到 / 抽奖 / 领券的通知见上面的「通知策略」。

## 文件

| 文件 | 说明 |
| :--- | :--- |
| `tenvideo.js` | 全功能单文件：抓取 / 续期 / 签到 / 抽奖 / 领券（靠 `$request` 是否存在区分阶段） |

## 使用

1. 装 `TencentVideoCheckin.plugin`，四个开关默认都开
2. 打开腾讯视频 → 我的 → 点「视频VIP」进会员中心
3. 收到 `✅ Cookie 获取成功` 后可关掉 `capture` 开关
4. 其余三个保持开启，每天 00:02 一次跑完全部任务，只弹一条通知

## 验证

脚本本地用 Loon 运行时模拟器跑了两组用例：

- **两开关**：开关独立生效、全关静默、不传参数默认开
- **回归（18 条）**：五域抓取、增量合并不冲 RT、无凭证不覆盖、续期双通道、响应收割、微信字段兼容、字段名不串

> ⚠️ 未验证项：真机 Loon 上 App 会员中心 WebView 能否解密。
> WebView 一般走系统网络栈能被 Loon 接管，但若腾讯对 `vip.video.qq.com` 做了 pinning 就会失败。
> 抓到第一次 Cookie 即说明通了。

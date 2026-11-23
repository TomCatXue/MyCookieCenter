# 多邻国 Duolingo 订阅解锁

配合 [`Duolingo.plugin`](../../../loon/Duolingo.plugin) 使用。

## 文件

| 文件 | 触发条件 | 作用 |
| :--- | :--- | :--- |
| `duolingo.batch.js` | `/<date>/batch`、`/users/<id>` | **主体**：注入 Gold 家庭订阅；同时承载经验加倍、解锁关卡、Max 标记三项玩法 |
| `duolingo.features.js` | `/available-features`、`/advertisable-features` | 补齐 `subscriptionFeatures` / `purchasableFeatures` |
| `duolingo.timer.js` | `/live-ops-challenges` + `timer_switch` | 改写限时挑战的初始倒计时 |
| `duolingo.clear.js` | `*/sessions`、`api2/stories` + `instant_clear` | 清空题目池直接通关 |

`batch.js` 一条规则同时吃两种响应形状，按形状分流：

- **完整用户对象**（有 `shopItems` 或 `trackingProperties`）→ 注入订阅 + 玩法
- **轻量对象**（只有 `subscriberLevel` 之类标量）→ **只改等级**，不塞 `shopItems` / `timerBoostConfig`

## 玩法开关

全部默认关闭，开箱行为与 v2.0.3 一致（纯订阅解锁）。

| 开关 | 类型 | 说明 |
| :--- | :--- | :--- |
| `xp_boost` | switch | 注入 `xp_boost_stackable`，1 小时有效，每次请求刷新到期时间 |
| `multiplier` | select | 经验倍数，2 或 3 |
| `unlock_all` | switch | 把 `currentCourse.pathSectioned` 里 `locked` 的关卡改成 `active` |
| `max_flags` | switch | 额外注入 `has_item_max_subscription` 等标记。**服务端不放行时点击会报错**，默认关 |
| `timer_switch` | switch | 是否改写限时挑战时长 |
| `timer_mins` | input | 挑战倒计时分钟数。脚本不设上限，能设多大由服务端判定 |
| `instant_clear` | switch | 清空题目池跳过作答，副作用见下 |

## 关键实测结论

> **真机实测：`subscriberLevel` 用 `"GOLD"` 才能触发完整解锁（`SUPER`/`PREMIUM` 仅改 UI）**

所以判等一律用 `GOLD`，不要"升级"成 `SUPER`。

## 设计约束（踩过坑，别改回去）

| 约束 | 原因 |
| :--- | :--- |
| 订阅注入必须幂等 | 早期版本每次响应无条件 `push`，同一会话会堆出多条 `gold_subscription` |
| 304 / 空 body 必须原样放行 | 改了就破坏客户端 etag 缓存，越用越慢 |
| 轻量响应不能塞订阅结构 | `{"subscriberLevel":"FREE"}` 追加 `shopItems` 会得到畸形半成品 |
| JSON 解析失败必须原样放行 | 早期 `level.js` 在解析失败时也返回假对象，把服务端响应整个吞掉 |
| 不臆造服务端上限 | `timer` 曾自作聪明夹 180 分钟上限，但那是编的，会让人误以为改了没生效 |
| 用户对象不假设在 `responses[0]` | 聚合响应里子响应顺序不固定，要逐条按特征识别 |

## instant_clear 的已知副作用

清空题目池依赖客户端「加载到空关卡即判定通过」的行为，已知情况：

- `MATCH_PRACTICE`、`SIDE_QUEST_RAMP_UP_PRACTICE` 清空后**会卡死在结算界面**，脚本已内置跳过
- 故事（`api2/stories`）清空 `elements` 后是否计入 daily quest 与服务端进度有关
- 章节末的传奇关卡（Legendary）有时需要真实作答才发奖

所以这个开关默认关，刷日常任务时再打开，打完就关。

## 与 lingoDuo（TAKAGIVEGETA/MyScripts）的关系

布局参考了它，但保留了自己的会员字段深度（家庭计划、`subscriptionConfigs`、10 年期限、功能清单接口）。具体差异见 `docs/` 下的对比记录。

## 相关

- 插件：[`loon/Duolingo.plugin`](../../../loon/Duolingo.plugin) (v2.2.0)
- 原作者：j4gm4g（原作） / TomCatXue（修复）

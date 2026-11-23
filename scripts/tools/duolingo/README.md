# 多邻国 Duolingo 订阅解锁

配合 [`Duolingo.plugin`](../../../loon/Duolingo.plugin) 使用。只做一件事：解锁 Gold 家庭订阅（免广告 / 无限心 / AI 功能）。规则型，无开关，装上即生效。

## 文件

| 文件 | 触发条件 | 作用 |
| :--- | :--- | :--- |
| `duolingo.batch.js` | `/<date>/batch`、`/users/<id>` | **主体**：注入 Gold 家庭订阅 |
| `duolingo.features.js` | `/available-features`、`/advertisable-features` | 补齐 `subscriptionFeatures` / `purchasableFeatures` |

`batch.js` 一条规则同时吃两种响应形状，按形状分流：

- **完整用户对象**（有 `shopItems` 或 `trackingProperties`）→ 注入订阅
- **轻量对象**（只有 `subscriberLevel` 之类标量）→ **只改等级**，不塞 `shopItems` / `timerBoostConfig`

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
| 用户对象不假设在 `responses[0]` | 聚合响应里子响应顺序不固定，要逐条按特征识别 |

## 注入的字段

`batch.js` 在用户对象上补这些：

- `shopItems` 追加一条 `gold_subscription`（带 `familyPlanInfo`：ownerId / 成员 / 邀请令牌）
- `subscriptionConfigs` 追加一条 `itemType: gold_subscription`
- `subscriberLevel` 改成 `GOLD`
- `trackingProperties`：gold / premium / immersive / live / max 五个标记 + `monetizable_status: free_trial_owner_max`
- `timerBoostConfig`：`timerBoosts: 8`

订阅期限 10 年，商品号 `com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.25Q2WB7D.Trial7.240`。

## 排查

如果装上后会员没生效，按顺序确认：

1. Loon 里 MITM 是否包含 `ios-api-*.duolingo.com` —— 不装证书什么都拦不到
2. `available-features` 和 `batch` 请求是否出现在 Loon 日志里。**没有 = 规则正则没命中实际 URL**
3. 请求命中了但界面没变 → 客户端不读这些字段，或服务端二次校验拦掉了

> **已知疑点（2026-11-23 验证）**：多邻国 Web 接口 `/2017-06-30/users` 返回的用户对象只有 38 个键，订阅状态是布尔值 `hasPlus`，**没有** `subscriberLevel`、`shopItems`、`trackingProperties`、`currentCourse`。iOS 侧的 `/batch` 聚合结构可能不同，但这说明字段名至少有一部分来自 2023 年的旧结构 —— 参考实现也把日期硬编码成了 `/2023-05-23/`。若真机验证不通过，优先怀疑字段名过期，而不是脚本逻辑。

## 相关

- 插件：[`loon/Duolingo.plugin`](../../../loon/Duolingo.plugin) (v3.0.0)
- 原作者：j4gm4g（原作） / TomCatXue（修复）

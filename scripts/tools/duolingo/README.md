# 多邻国 Duolingo 订阅解锁

配合 [`Duolingo.plugin`](../../../loon/Duolingo.plugin) 使用。

## 文件

| 文件 | 作用 |
| :--- | :--- |
| `duolingo.batch.js` | **主体**：拦截 `<date>/batch` 聚合响应，向 `users` 子响应注入 Gold 家庭订阅。同时补齐家庭计划字段与 `EXPLAIN_MY_ANSWER` 新功能 |
| `duolingo.features.js` | 拦截 `/available-features`，注入 `subscriptionFeatures` + `purchasableFeatures`。付费功能清单取自现网 `subscription-catalog` 的 `advertisableFeatures` |
| `duolingo.level.js` | 217 字节的最小实现：只返回 `{"subscriberLevel": "GOLD"}` |

## 关键实测结论

脚本注释里写了两条真机验证结果，值得保留：

> **真机实测：`subscriberLevel` 用 `"GOLD"` 才能触发完整解锁（`SUPER`/`PREMIUM` 仅改 UI）**

所以 `duolingo.level.js` 用的是 `GOLD`，不要"升级"成 `SUPER`。

```js
// 来自 duolingo.level.js
let obj = { "subscriberLevel": "GOLD" };
$done({ body: JSON.stringify(obj), status: 200 });
```

## 插件开关

规则型，无需开关。

## 相关

- 插件：[`loon/Duolingo.plugin`](../../../loon/Duolingo.plugin) (v2.0.3)
- 原作者：j4gm4g（原作） / TomCatXue（修复）

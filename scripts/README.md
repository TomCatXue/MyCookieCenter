# scripts/

脚本源码目录。

| 目录 | 内容 | 对应入口 |
| :--- | :--- | :--- |
| [`weread/`](./weread/) | 微信读书：捕获 + 领卡 + 翻牌 + 限免 | [`CookieCenter.plugin`](../loon/CookieCenter.plugin) · [`ql_script/weread.js`](../ql_script/weread.js) |
| [`telecom/`](./telecom/) | 中国电信：捕获 + 抽奖 + 0 点权益 + 山西福利 | [`CookieCenter.plugin`](../loon/CookieCenter.plugin) · [`ql_script/`](../ql_script/) |
| [`tools/`](./tools/) | 独立功能：B站 / Pixiv / GitHub / 扫描全能王 | 各自独立的 [`loon/*.plugin`](../loon/) |
| [`example/`](./example/) | 新脚本模板 | — |

> 捕获与执行分离：Loon 侧只抓凭据，业务执行在 [`ql_script/`](../ql_script/)。

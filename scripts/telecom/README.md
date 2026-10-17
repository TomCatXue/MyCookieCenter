# 中国电信

电信全系：会员抽奖、等级权益、山西福利。**Loon 只抓凭据，执行全在青龙。**

## 脚本

| 业务 | 抓取（Loon） | 执行（青龙） | 开关 |
| :--- | :--- | :--- | :--- |
| 会员抽奖 | [`telecom_cookie.js`](./telecom_cookie.js) | [`telecom_daily.py`](../../ql_script/telecom_daily.py) | `telecom_draw` |
| 等级权益 | [`telecom_rights.js`](./telecom_rights.js) | [`telecom_midnight_equity.py`](../../ql_script/telecom_midnight_equity.py) | `telecom_rights` |
| 山西福利 | [`telecom_benefit.js`](./telecom_benefit.js) | 暂无对应脚本 | `telecom_benefit` |

`telecom_draw.js` 为历史单体脚本，现仍可独立跑青龙任务，但 Loon 侧已改用轻量的 `telecom_cookie.js`。

## 抓取

| 业务 | 操作 | 通知 |
| :--- | :--- | :--- |
| 会员抽奖 | 微信小程序「中国电信5G会员」进任意页面 | 会员凭据已就绪 |
| 等级权益 | 营业厅 App → 我 → 签到 / 等级权益 | 等级权益凭据已锁定 |
| 山西福利 | 打开山西活动页 | 新批次凭据已更新 |

抓到即通知；同一页面并发请求 10 秒内去重，换新凭据必定通知。

## 青龙变量 `dxlin`

```text
手机号#服务密码#AndroidID[#SessionKey]
```

- 多账号换行或用 `&` 分隔
- SessionKey 可省略，脚本会自动走 SSO Ticket 换票
- 兼容变量名：`dxqy` / `CHINA_TELECOM_AUTH` / `TELECOM_WED_AUTH`

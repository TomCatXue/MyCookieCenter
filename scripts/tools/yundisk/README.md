# 移动云盘凭据捕获

## 文件

| 文件 | 作用 |
| :--- | :--- |
| [`yundisk.cookie.js`](./yundisk.cookie.js) | 拦截 `user-njs.yun.139.com/user/` 的 `Authorization` 并写入 BoxJS |

## 变量

| 变量 | 说明 |
| :--- | :--- |
| `ydyp_data` | 多账号 JSON 数组，可整段复制为青龙 `YDYP_AUTH` |
| `ydyp_device_id` | 全局设备 ID，由捕获结果维护 |
| `ydyp_cache` | 移动云盘 Token / deviceId 缓存 |

## 抓取方法

1. 启用 `YunDisk.plugin` 并信任 MITM 证书。
2. 打开移动云盘 App 首页。
3. BoxJS 中查看或复制 `ydyp_data`，或直接经取凭证网关同步到呆呆面板 `YDYP_AUTH`。

<p align="center">
  <img src="https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.png" width="80" alt="WPS" />
</p>

# WPS

每日签到 / 福利中心任务。

## 文件

- `wps.js` — 既是重写抓 Cookie 也是 cron 签到，根据 `$request` 是否存在区分

## 使用步骤

1. 按下方对应平台配置，开启重写脚本 + cron
2. 打开 WPS App → 个人中心，触发 v1mobile 接口
3. 收到 `✅ WPS Cookie 获取成功` 通知即抓取成功
4. cron 会按计划自动签到

## BoxJS 参数

| key | 类型 | 说明 |
|---|---|---|
| `wps_data` | text | Cookie（自动捕获，也可手动粘贴） |
| `wps_clear` | bool | 开启后下次跑会清空已存 Cookie（强制重抓） |
| `wps_debug` | bool | 打印完整 headers/body 到 console |

## Loon

```ini
[MITM]
hostname = *.wps.cn

[Script]
http-request ^https?:\/\/[a-z]*\.wps\.cn\/v1mobile tag=WPS Cookie, script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js, requires-body=false

cron "20 9 * * *" script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js, tag=WPS签到, enable=true
```

## Surge

```ini
[MITM]
hostname = *.wps.cn

[Script]
WPS Cookie = type=http-request,pattern=^https?:\/\/[a-z]*\.wps\.cn\/v1mobile,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js

WPS签到 = type=cron,cronexp=20 9 * * *,timeout=60,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js
```

## Quantumult X

```ini
[MITM]
hostname = *.wps.cn

[rewrite_local]
^https?:\/\/[a-z]*\.wps\.cn\/v1mobile url script-request-header https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js

[task_local]
20 9 * * * https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js, tag=WPS签到, enabled=true
```

## Stash

```yaml
cron:
  script:
    - name: WPS签到
      cron: '20 9 * * *'
      timeout: 60

http:
  mitm:
    - "*.wps.cn"
  script:
    - match: ^https?:\/\/[a-z]*\.wps\.cn\/v1mobile
      name: WPS Cookie
      type: request
      require-body: false

script-providers:
  WPS签到:
    url: https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/wps/wps.js
    interval: 86400
```

## 维护记录

| 日期 | 变更 |
|---|---|
| 2026-07-18 | 初版，骨架接入（签到接口待替换为真实） |

## 已知限制

- 签到接口为示例占位，需抓包替换为真实接口与成功判断
- `wps_sid` / `sid` 二选一即可，时效较短，过期后需在 BoxJS 打开 `wps_clear` 重新抓取

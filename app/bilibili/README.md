<p align="center">
  <img src="https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.png" width="80" alt="哔哩哔哩" />
</p>

# 哔哩哔哩

每日签到 / 领取直播银瓜子。

## 文件

- `bilibili.js` — 既是重写抓 Cookie 也是 cron 签到，根据 `$request` 是否存在区分

## 使用步骤

1. 按下方对应平台配置，开启重写脚本 + cron
2. 打开哔哩哔哩 App → 首页，触发 nav 接口
3. 收到 `✅ 哔哩哔哩 Cookie 获取成功` 通知即抓取成功
4. cron 会按计划自动签到

## BoxJS 参数

| key | 类型 | 说明 |
|---|---|---|
| `bilibili_data` | text | Cookie（自动捕获，也可手动粘贴） |
| `bilibili_clear` | bool | 开启后下次跑会清空已存 Cookie（强制重抓） |
| `bilibili_debug` | bool | 打印完整 headers/body 到 console |

## Loon

```ini
[MITM]
hostname = api.bilibili.com

[Script]
http-request ^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav tag=哔哩哔哩 Cookie, script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js, requires-body=false

cron "0 9 * * *" script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enable=true
```

## Surge

```ini
[MITM]
hostname = api.bilibili.com

[Script]
哔哩哔哩 Cookie = type=http-request,pattern=^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js

哔哩哔哩签到 = type=cron,cronexp=0 9 * * *,timeout=60,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js
```

## Quantumult X

```ini
[MITM]
hostname = api.bilibili.com

[rewrite_local]
^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav url script-request-header https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js

[task_local]
0 9 * * * https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enabled=true
```

## Stash

```yaml
cron:
  script:
    - name: 哔哩哔哩签到
      cron: '0 9 * * *'
      timeout: 60

http:
  mitm:
    - "api.bilibili.com"
  script:
    - match: ^https?:\/\/api\.bilibili\.com\/x\/web-interface\/nav
      name: 哔哩哔哩 Cookie
      type: request
      require-body: false

script-providers:
  哔哩哔哩签到:
    url: https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/bilibili/bilibili.js
    interval: 86400
```

## 维护记录

| 日期 | 变更 |
|---|---|
| 2026-07-18 | 初版，骨架接入（签到接口待替换为真实） |

## 已知限制

- 签到接口为示例占位，需抓包替换为真实接口与成功判断
- SESSDATA 时效较短，过期后需在 BoxJS 打开 `bilibili_clear` 重新抓取

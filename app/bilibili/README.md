<p align="center">
  <img src="https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.png" width="80" alt="哔哩哔哩" />
</p>

# 哔哩哔哩

每日签到 / 观看 / 分享 / 投币 / 银瓜子兑换。

## 文件

- `bilibili.js`：同一个脚本同时负责抓 Cookie 和 cron 签到

## 使用步骤

1. 在 Loon / Surge / Quantumult X / Stash 中按下方配置开启抓取和签到规则
2. 打开哔哩哔哩 App 首页，触发 `fingerprint` 请求
3. 收到 `✅ 哔哩哔哩 Cookie 获取成功` 通知后，Cookie 会自动保存到 BoxJS
4. 定时任务会按配置的 cron 表达式执行

## BoxJS 参数

| key | 类型 | 说明 |
|---|---|---|
| `bilibili_data` | text | Cookie，自动捕获，也可手动粘贴 |
| `bilibili_clear` | bool | 开启后下次运行会清空已存 Cookie，强制重新抓取 |
| `bilibili_sign_time` | text | 签到 cron 表达式，默认 `30 7 * * *` |

## Loon

```ini
[MITM]
hostname = app.bilibili.com

[Script]
http-request ^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\? tag=哔哩哔哩 Cookie, script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js, requires-body=false
cron "{bilibili_sign_time}" script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enable=true
```

## Surge

```ini
[MITM]
hostname = app.bilibili.com

[Script]
哔哩哔哩 Cookie = type=http-request,pattern=^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\?,requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
哔哩哔哩签到 = type=cron,cronexp=30 7 * * *,timeout=60,script-path=https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
```

## Quantumult X

```ini
[MITM]
hostname = app.bilibili.com

[rewrite_local]
^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\? url script-request-header https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js

[task_local]
30 7 * * * https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js, tag=哔哩哔哩签到, enabled=true
```

## Stash

```yaml
cron:
  script:
    - name: 哔哩哔哩签到
      cron: '30 7 * * *'
      timeout: 60

http:
  mitm:
    - "app.bilibili.com"
  script:
    - match: ^https?:\/\/app\.bilibili\.com\/x\/resource\/fingerprint\?
      name: 哔哩哔哩 Cookie
      type: request
      require-body: false

script-providers:
  哔哩哔哩签到:
    url: https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/refs/heads/main/app/bilibili/bilibili.js
    interval: 86400
```

## 已知限制

- `bilibili_sign_time` 需要和 Loon 插件里的签到时间保持一致
- `SESSDATA` 时效较短，过期后需要重新抓取

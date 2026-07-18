<p align="center">
  <img src="https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.png" width="80" alt="微博" />
</p>

# 微博

每日签到 / 积分领取。

## 文件

- `weibo.js` — 既是重写抓 Cookie 也是 cron 签到，根据 `$request` 是否存在区分

## 使用步骤

1. 按下方对应平台配置，开启重写脚本 + cron
2. 打开微博 App → 我的页面，触发 user/my 接口
3. 收到 `✅ 微博 Cookie 获取成功` 通知即抓取成功
4. cron 会按计划自动签到

## BoxJS 参数

| key | 类型 | 说明 |
|---|---|---|
| `weibo_data` | text | Cookie（自动捕获，也可手动粘贴） |
| `weibo_clear` | bool | 开启后下次跑会清空已存 Cookie（强制重抓） |
| `weibo_debug` | bool | 打印完整 headers/body 到 console |

## Loon

```ini
[MITM]
hostname = *.weibo.cn

[Script]
http-request ^https?:\/\/[a-z]*\.weibo\.cn\/(user|my) tag=微博 Cookie, script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js, requires-body=false

cron "10 9 * * *" script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js, tag=微博签到, enable=true
```

## Surge

```ini
[MITM]
hostname = *.weibo.cn

[Script]
微博 Cookie = type=http-request,pattern=^https?:\/\/[a-z]*\.weibo\.cn\/(user|my),requires-body=false,max-size=0,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js

微博签到 = type=cron,cronexp=10 9 * * *,timeout=60,script-path=https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js
```

## Quantumult X

```ini
[MITM]
hostname = *.weibo.cn

[rewrite_local]
^https?:\/\/[a-z]*\.weibo\.cn\/(user|my) url script-request-header https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js

[task_local]
10 9 * * * https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js, tag=微博签到, enabled=true
```

## Stash

```yaml
cron:
  script:
    - name: 微博签到
      cron: '10 9 * * *'
      timeout: 60

http:
  mitm:
    - "*.weibo.cn"
  script:
    - match: ^https?:\/\/[a-z]*\.weibo\.cn\/(user|my)
      name: 微博 Cookie
      type: request
      require-body: false

script-providers:
  微博签到:
    url: https://raw.githubusercontent.com/<owner>/<repo>/refs/heads/main/app/weibo/weibo.js
    interval: 86400
```

## 维护记录

| 日期 | 变更 |
|---|---|
| 2026-07-18 | 初版，骨架接入（签到接口待替换为真实） |

## 已知限制

- 签到接口为示例占位，需抓包替换为真实接口与成功判断
- SUB 字段时效较短，过期后需在 BoxJS 打开 `weibo_clear` 重新抓取

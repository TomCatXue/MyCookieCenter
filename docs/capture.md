# 抓包教程

如何在手机上抓取各 App 的 Cookie 与签到接口。

## 推荐工具

| 平台    | 工具                              | 备注                       |
| ------- | --------------------------------- | -------------------------- |
| iOS     | **Loon** / Quantumult X / Surge   | 抓包 + 脚本一体化          |
| Android | **HttpCanary** / Reqable / Thor   | 抓包后手动复制 Cookie       |
| 通用    | **Charles** / mitmproxy（电脑端） | 配合手机代理使用           |

---

## 一、抓 Cookie（用 Loon 自身）

最简单的方式：本项目 `app/` 目录下每个脚本已配好 MITM 规则（见对应 `README.md` 的 Loon 段），只需：

1. 按脚本 README 配置重写规则 + cron（或安装 `loon/CookieCenter.plugin` 汇总插件）。
2. 信任 Loon 的 CA 证书（设置 → 通用 → VPN 与设备管理）。
3. 打开目标 App（如 bilibili）进行一次登录态请求。
4. 收到 `✅ <显示名> Cookie 获取成功` 通知即抓取成功，Cookie 自动存入持久化存储 / BoxJS。

## 二、手动抓包（电脑 Charles）

1. 电脑运行 Charles，开启 SSL Proxying。
2. 手机连同一 Wi-Fi，HTTP 代理设为电脑 IP:8888。
3. 在手机上访问目标 App 对应操作（打开主页 / 点签到）。
4. 在 Charles 找到对应请求：

   - **取 Cookie**：请求 → Headers → Request Headers → `Cookie` 一整行复制。
   - **找签到接口**：点签到时那条请求，记录 URL / Method / Body。

## 三、判断 Cookie 是否有效

抓取后无需手动粘贴，Cookie 已自动存入 BoxJS。验证方式：

- **手动跑一次**：在 BoxJS 面板点「运行」或在代理工具里手动触发该脚本的 cron。
- **看通知**：若返回 `❌ 签到失败` 且提示登录失效，说明 Cookie 已过期或字段不全，在 BoxJS 把 `<脚本名>_clear` 开关打开，下次运行会清空旧 Cookie 并提示重新抓取。

## 四、常见问题

- **抓不到 HTTPS**：没装/没信任 CA 证书。
- **Cookie 缺字段**：该请求并非登录态请求，换一个 App 内的页面操作。
- **Cookie 很快过期**：有些 App 会主动刷新 Token，签到脚本需同时更新存储。

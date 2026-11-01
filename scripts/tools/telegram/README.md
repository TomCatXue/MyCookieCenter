# Telegram 增强

针对 Telegram 移动端连接体验与链接唤醒的专属优化模块。

## 功能

- **优质 IP 分流与防转圈**：将 Telegram 48 组边缘节点 IP 映射至优质代理 IP，消除握手延迟，减少媒体加载与文字消息转圈。
- **全格式外部链接唤醒跳转**：
  - 支持 `t.me`、`telegram.me`、`telegram.dog` 全部主流域名。
  - **公开频道/群组/用户**：直接定位个人或频道主页。
  - **频道特定消息与评论区**：支持 `t.me/domain/123` 精准定位贴文 ID，支持 `?comment=456` 评论区深度定位。
  - **Bot 传参与 Mini App**：支持 `?start=token`、`?startgroup=token`、`?startapp=xxx` 无损透传。
  - **私有邀请链接**：全面兼容 `+inviteCode` 以及旧版 `joinchat/inviteCode`。
  - **私有频道消息**：支持 `t.me/c/123456789/456` 内部消息精准定位。
  - **代理与实用功能**：支持 MTProto (`proxy?`)、Socks5 (`socks?`)、贴纸包 (`addstickers/`)、表情包 (`addemoji/`)、主题、语言包、分享与即时预览。
- **多客户端自由选择**：支持在插件设置中自由切换唤醒客户端：
  - 官方 Telegram (`tg://`)
  - Swiftgram (`sg://`)
  - Nagram (`na://`)
  - Turrit (`turrit://`)
  - iMe (`ime://`)
  - Nicegram (`ng://`)
  - Lingogram (`lingo://`)
  - Teleplus (`teleplus://`)

## 鸣谢

- 核心分流规则与重定向逻辑灵感源自 [chaoscard/proxyrules](https://github.com/chaoscard/proxyrules)。
- IP 映射数据源与部分客户端 Scheme 参考 [sooyaaabo](https://github.com/sooyaaabo) 与 [Repcz](https://github.com/Repcz/Tool)。

## 安装

1. Loon → 插件 → 导入 `loon/Telegram.plugin`
2. 在插件设置中选择点击 Telegram 链接时目标唤起的客户端（默认为官方 Telegram）
3. 确保开启并信任 Loon CA 证书

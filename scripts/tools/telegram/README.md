# Telegram 增强

针对 Telegram 移动端连接体验与链接唤醒的专属优化模块。

## 功能

- **优质 IP 分流与防转圈**：将 Telegram 48 组边缘节点 IP 映射至优质代理 IP，消除握手延迟，减少媒体加载与文字消息转圈。
- **外部链接唤醒跳转**：拦截外部浏览器或应用中的 `t.me/*` 链接，通过 307 动态重定向并唤醒指定的 Telegram 客户端。
- **多客户端支持**：内置客户端参数选择，支持 Telegram 官方客户端、Swiftgram、Turrit、iMe、Nicegram、Lingogram。

## 鸣谢

- 核心规则与重定向逻辑源自 [chaoscard/proxyrules](https://github.com/chaoscard/proxyrules)。
- IP 映射数据源参考 [sooyaaabo](https://github.com/sooyaaabo) 与 [Repcz](https://github.com/Repcz/Tool)。

## 安装

1. Loon → 插件 → 导入 `loon/Telegram.plugin`
2. 在插件设置中选择点击 `t.me` 时目标唤起的客户端（默认为官方 Telegram）
3. 确保开启并信任 Loon CA 证书

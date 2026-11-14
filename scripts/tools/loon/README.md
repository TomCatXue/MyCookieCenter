# LoonMonitor 小组件数据服务

配合 [`LoonMonitor.plugin`](../../../loon/LoonMonitor.plugin) 使用，为 iOS 桌面小组件提供 Loon 运行状态。

## 文件

| 文件 | 作用 |
| :--- | :--- |
| `loon_monitor.js` | 提供 Loon 运行状态：运行模式、策略组、当前节点、出口 IP 与延迟 |

## 设计要点

**机场流量不在这个脚本里取。**

> 机场订阅流量由哑巴面板直接请求用户填写的订阅链接；换机场无需修改本脚本。

即脚本只负责"Loon 自己知道的事"，订阅流量由面板侧处理。这样换机场不需要改脚本。

## 一个容易踩的坑

脚本注释里特别标注：

> 注意：Loon 的 `$httpClient` timeout 单位是 **毫秒**（官方文档）。

而 Loon 插件语法里的 `timeout` 单位是**秒**。两处不要混。

## 相关

- 插件：[`loon/LoonMonitor.plugin`](../../../loon/LoonMonitor.plugin) (v1.5.0)
- 作者：TomCatXue

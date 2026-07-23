# 微信读书 · 优雅收录

> 轻触订阅人数，好书即刻入架。

## 功能

一点即收。在微信读书中点击任意书籍的「订阅人数」，脚本自动完成全程：

- 查书籍信息 → 校验是否上架 → 加入书架 → 清理辅助书
- 成功时推送通知，显示书名与作者
- 未上架书籍自动跳过，不打扰

## 使用

1. 在 Loon 中安装 `loon/WeReadEnhance.plugin`
2. 开启 `wxread_enhance` 开关
3. 进入微信读书，点按任意书籍的订阅人数即可

## 触发接口

```text
https://i.weread.qq.com/subscription/users?bookId=xxxxx
```

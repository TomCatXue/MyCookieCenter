# 微信读书增强 (WeRead)

> 点击微信读书中的订阅人数，自动获取 bookId 并加入书架。

## 功能

- 点击任意书籍的订阅人数 → 自动触发脚本
- 查询书籍信息，判断是否从未上架（`totalWords === 0` 则跳过）
- 自动加入书架
- 静默清理内置辅助书籍（bookId=490081）

## 使用说明

1. 在 Loon 中安装 `loon/WeReadEnhance.plugin`
2. 打开开关 `wxread_enhance`
3. 在微信读书 App 中，点击任意书籍的订阅人数
4. 收到「🎉 添加书籍成功」通知即成功

## 触发接口

```
https://i.weread.qq.com/subscription/users?bookId=xxxxx
```

点击订阅人数时 App 会请求此接口，脚本拦截后自动处理。

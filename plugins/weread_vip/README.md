# 微信读书 · 会员解锁 (实验性)

基于 MidasIAPSDK v1.7.7 + WeRead 10.2.0 静态逆向分析。

## 原理

微信读书的 IAP 支付使用腾讯 Midas SDK (v1.7.7, 2014年) 做收据验证。验证请求发往 `api.unipay.qq.com`。

由于:
- App 全局关闭了 ATS (`NSAllowsArbitraryLoads: true`)
- Midas v1.7.7 极大概率没有证书固定
- 客户端完全信任 Midas 服务端返回的 `ret` 码

Loon 可以 MITM 收据验证请求并返回伪造的成功响应，从而让 App 误以为支付已完成。

## 使用方法

1. Loon 中启用 MITM，添加域名 `*.unipay.qq.com`
2. 导入此插件的 `[Script]` 规则
3. 在微信读书中正常发起任意 IAP 购买（书币/会员/章节）
4. App 收到伪造的成功验证 → 解锁对应内容

## 触发时机

在微信读书完成 Apple 原生支付弹窗后（Face ID / 密码验证通过），
Midas SDK 会向 `api.unipay.qq.com/v1/r/...` 发请求验证收据，
此时 Loon 拦截并返回伪造结果。

## 已知局限

- `validateMemberCardSummaryResponse:` 的具体校验逻辑是黑盒。如果伪造响应被拒绝，
  需要用 Frida 动态 hook 做进一步分析。
- 即使客户端解锁成功，Midas 服务端仍会向 Apple 做二次验证。如果服务端发现收据无效，
  可能通过推送或下次查询时回滚会员状态。这种回滚不在本插件的控制范围内。

## 故障排查

如果购买后会员未解锁:
1. 检查 Loon 日志中是否有 `[VIP] save_goods forged` 输出
2. 如果日志有输出但 App 显示"支付失败" → `validateMemberCardSummaryResponse:` 拒绝了响应
3. 如果日志没有输出 → Midas SDK 可能走了其他域名或证书固定挡住了 MITM

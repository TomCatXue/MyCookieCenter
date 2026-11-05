# 腾讯视频 · 全量广告净化（Loon）

融合 `ZenmoFeiShi/Qx` 的 `TxvideoAD` 去广告与去底栏逻辑，并扩展到腾讯视频 9.04.75 IPA 中确认的全部广告内容链路。

## 覆盖范围

- **tRPC 请求级拦截 40 条**：开屏、推送、倍速面板、前贴/中插、暂停、后贴、锚点、详情页横幅、信息流、搜索、下载页、个人中心、直播角标、激励广告、会员推广、活动浮层、运营商推广、ASA 归因、惊喜礼包。
- **JCE 响应裁剪 5 个广告命令 + 青少年配置**：`129279` 开屏、`129278` / `130273` 前贴中插、`129196` 暂停、`126577` 播放提示、`89738` 青少年弹窗。
- **开屏 QUIC 主机拒绝**：`iacc.stgw.qq.com`、`tacc.video.qq.com`；同时对 `i.video.qq.com` / `pre.video.qq.com` / `iacc.qq.com` 的 QUIC/UDP 443 直接拒绝，强制走 TCP 以保证 MITM 命中。
- **GDT 广告联盟与遥测**：`DOMAIN-SUFFIX,gdt.qq.com` 直拒；`p.l.qq.com`、`dp3.qq.com`、`otheve.beacon.qq.com` 直拒。
- **前贴/广告服务器**：IPA 标记为 `prerollAdDomain` 的 `lives.l.qq.com` 与 `adServerDomain` 的 `news.l.qq.com` 直拒。
- **去底栏与简洁模式**：`simple_mode_config` 强制启用、`tab_bar_cut_whitelist=0;2;4`；`GetTabListRsp` 删除 `smallvideo_entrance`、`goods_entrance` 以及标题为「短剧」「好物」的 tab。
- **响应级兜底**：`AdFeedInfo`、`AdResponseInfo`、`InnerAd`、`LoadingConfig`、`PreloadResourceInfo`、`GetTabListRsp`、`personal_center_page`、`outerPaster` 等标记节点递归清理。

## 文件

- Loon 插件：`loon/TencentVideo.plugin`
- 脚本：`scripts/tools/txvideo/tencent_video_ad_clean.js`
- 本地自测：`work/txvideo_loon_selftest.js`（30 项）
- 插件静态校验：`work/validate_txvideo_plugin.py`（30 项）

## 安装

1. 确认 Loon 已安装并信任 MITM 证书。
2. 导入插件：
   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/loon/TencentVideo.plugin
   ```
3. 插件 MITM 主机：
   ```text
   i.video.qq.com, pre.video.qq.com, iacc.qq.com, config.ab.qq.com, tconfig.ab.qq.com, tab.video.qq.com, rdelivery.qq.com
   ```
4. 脚本地址指向：
   ```text
   https://raw.githubusercontent.com/TomCatXue/MyCookieCenter/main/scripts/tools/txvideo/tencent_video_ad_clean.js
   ```

> 当前改动尚未推送到 GitHub 时，Loon 无法下载脚本；需要先推送，或把 `script-path` 改成你自己的可访问 URL。

## 副作用与边界

- **激励广告也被拦截**：`RewardAdNewPlay`、`GetFollowHeartRewardAdInfo`、`GetRewardEntranceInfo` 等会被破坏，用户主动看广告换奖励的入口会失效。这是“全部广告都不保留”的必然结果。
- **会员推广也被拦截**：会员升级弹窗、推广 Hub、视频卡推广、惊喜礼包等会被一并移除。
- **配置类接口保留**：`UserSwitch/GetStatus`、`UserSwitch/SetStatus`、`SaveMVLSession`、`LimitWrite`、`GetPromotionGlobalConfig` 未加入拦截，避免破坏广告开关/会话/限次等非展示逻辑。

### 未加入拦截的 5 条

| 函数 | 原因 |
|---|---|
| `video_ad_ssp_config.UserSwitch/GetStatus` | 广告开关查询，非广告内容 |
| `video_ad_ssp_config.UserSwitch/SetStatus` | 广告开关写入，非广告内容 |
| `flow_pool.gateway.GatewayService/SaveMVLSession` | MVL 会话保存，非广告 |
| `vip_ad_promotion.promotion_limit_svr.Limit/LimitWrite` | 推广限次写入，非展示 |
| `flow_pool.gateway.FlowPoolActivity/GetPromotionGlobalConfig` | 推广全局配置，非展示 |
- **QUIC 全局关闭**：`ios_nx_netframework_compatible` / `network_resolve_config` 补丁与 Loon QUIC 规则会降低一部分网络性能；若起播变慢，可保留 Loon QUIC 规则、移除脚本内的 AB 补丁。
- **`pre.video.qq.com` MITM**：IPA 的 NX 配置存在该 host；若真机出现证书/网络异常，先从 `[MITM]` 与脚本规则中移除它，再确认该 host 是否承载广告。
- **`lives.l.qq.com` 直拒**：IPA 将其标记为 pre-roll 广告域；若真机直播/消息功能异常，先移除这条 Rule 再验证。

## 验证

```powershell
node --check scripts\tools\txvideo\tencent_video_ad_clean.js
node work\txvideo_loon_selftest.js
python work\validate_txvideo_plugin.py
```

当前结果：脚本自测 **30/30 PASS**；插件静态校验 **30/30 PASS**。

## 真机验证

1. 杀掉腾讯视频进程，冷启动，确认开屏广告消失。
2. 播放非 VIP 长视频，确认前贴/中插/暂停/后贴广告消失。
3. 查看底部 tab，确认「短剧」「好物」等入口被裁剪。
4. 进入「我的」页面，确认顶部横幅、营销卡片、推广浮层消失。
5. 打开信息流/搜索/下载页，确认广告卡片不再出现。
6. 若出现白屏/网络错误，关闭插件开关回退；再按 `Content-Encoding`/host 二分排查。

## 已知限制

- 暂停广告有 tRPC 与 JCE 两条链路：插件已请求级拦截 tRPC `GetPauseAd`，同时保留 JCE `129196` 裁剪；真机仍需确认 9.04.75 实际走哪条。
- 无法保证覆盖 IPA 中未命中广告关键词的隐藏路径；脚本已加入 `ad_ssp` / `video_ad` / `reward_ad` / `vip_ad` / `promotion` 等函数名兜底正则。

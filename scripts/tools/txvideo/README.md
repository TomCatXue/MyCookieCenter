# 腾讯视频 · 全量广告净化（Loon）

融合 `ZenmoFeiShi/Qx` 的 `TxvideoAD` 去广告与去底栏逻辑，并扩展到腾讯视频 9.04.75 IPA 中确认的全部广告内容链路。

## 覆盖范围

- **tRPC 请求级拦截 40 条**：开屏、推送、倍速面板、前贴/中插、暂停、后贴、锚点、详情页横幅、信息流、搜索、下载页、个人中心、直播角标、激励广告、会员推广、活动浮层、运营商推广、ASA 归因、惊喜礼包。
- **JCE 响应裁剪 5 个广告命令 + 青少年配置**：`129279` 开屏、`129278` / `130273` 前贴中插、`129196` 暂停、`126577` 播放提示、`89738` 青少年弹窗。
- **开屏 QUIC 主机拒绝**：`iacc.stgw.qq.com`、`tacc.video.qq.com`；同时对 `i.video.qq.com` / `pre.video.qq.com` / `iacc.qq.com` 的 QUIC/UDP 443 直接拒绝，强制走 TCP 以保证 MITM 命中。
- **GDT 广告联盟与遥测**：`DOMAIN-SUFFIX,gdt.qq.com` 直拒；`p.l.qq.com`、`dp3.qq.com`、`otheve.beacon.qq.com` 直拒。
- **前贴/广告服务器**：IPA 标记为 `prerollAdDomain` 的 `lives.l.qq.com` 与 `adServerDomain` 的 `news.l.qq.com` 直拒。
- **去底栏与简洁模式**：`simple_mode_config` 强制启用，但显式关闭 `tab_bar_cut_enable`，不再按位置裁剪；`GetTabListRsp` 只删除短剧（`data_key=smallvideo_entrance`）、VIP 会员（`vip_entrance` / `member_entrance` / `whole_ad_vip_entrance`）、好物（`goods_entrance`）的整条 tab 记录，其余 tab 记录逐字节原样保留，不重写 `request_type` / `return_tab_name` 等字段。
- **响应级兜底**：`AdFeedInfo`、`AdResponseInfo`、`InnerAd`、`LoadingConfig`、`PreloadResourceInfo`、`GetTabListRsp`、`personal_center_page`、`outerPaster` 等标记节点递归清理。

## 文件

- Loon 插件：`loon/TencentVideo.plugin`
- 脚本：`scripts/tools/txvideo/tencent_video_ad_clean.js`
- 本地自测：`work/txvideo_loon_selftest.js`（35 项）
- 插件静态校验：`work/validate_txvideo_plugin.py`（33 项）

> v1.0.2 修复：v1.0.1 曾沿用 QX 的 tab 重排逻辑，把 9.04.75 的 `request_type`（字段 2）当成索引删除、并把 `return_tab_name`（字段 16）改写成 varint，导致底栏错乱。现改为整条记录删除，剩余字段不再改动。

## 底栏开关

Loon → 配置 → 插件 → 腾讯视频 · 全量净化 → 编辑参数：

| 参数 | 默认 | 说明 |
|---|---|---|
| `HideShortDrama` | 开 | 隐藏「短剧」tab；关闭后恢复显示 |
| `HideVipTab` | 开 | 隐藏「VIP会员」tab；关闭后恢复显示 |
| `HideGoods` | 开 | 隐藏「好物」tab；关闭后恢复显示 |

三个开关互相独立，修改后杀掉腾讯视频进程重启生效。首页、推荐、我的等其他 tab 不受影响；开关全关时 `GetTabListRsp` 原样放行。

若真机仍出现底栏异常：把三个开关全部关闭并重启腾讯视频，即可完全跳过 tab 改写、恢复原生底栏；随后再逐个开启定位。

IPA 内 `com.tencent.kmm.tabbar.data.model.TabBarData` 的默认表已确认包含 `main_entrance`、`smallvideo_entrance`、`vip_entrance`、`personal_entrance`、`goods_entrance` 等 key；脚本按 key 精确删除，`member_entrance` / `whole_ad_vip_entrance` 作为 VIP 兼容别名一并处理。

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

当前结果：脚本自测 **35/35 PASS**；插件静态校验 **33/33 PASS**。

## 真机验证

1. 杀掉腾讯视频进程，冷启动，确认开屏广告消失。
2. 播放非 VIP 长视频，确认前贴/中插/暂停/后贴广告消失。
3. 查看底部 tab：默认「短剧」「VIP会员」「好物」均消失；逐个关闭三个开关并重启，确认对应 tab 恢复显示。
4. 进入「我的」页面，确认顶部横幅、营销卡片、推广浮层消失。
5. 打开信息流/搜索/下载页，确认广告卡片不再出现。
6. 若出现白屏/网络错误，关闭插件开关回退；再按 `Content-Encoding`/host 二分排查。

## 已知限制

- 暂停广告有 tRPC 与 JCE 两条链路：插件已请求级拦截 tRPC `GetPauseAd`，同时保留 JCE `129196` 裁剪；真机仍需确认 9.04.75 实际走哪条。
- 无法保证覆盖 IPA 中未命中广告关键词的隐藏路径；脚本已加入 `ad_ssp` / `video_ad` / `reward_ad` / `vip_ad` / `promotion` 等函数名兜底正则。

# 归档：惠省 / 海底捞（2026-10-24）

这两个微信小程序任务已暂停维护并移出 `ql_script/`，源码与图标保留于此。

## 为什么归档

- **惠省**：美团 `weappsilentlogin` 必须带实时生成的 `mtgsig`，YYB 只能提供一次性 `wx.login code`，无法直接换票。当时配置里没有可用的签名后端。
- **海底捞**：登录契约（`codeType=1 + code`）来自上游公开脚本的推断，**未做真机验证**，不应继续以可用状态对外提供。

## 复活线索（重要）

惠省并非技术封死。本机 `work/signin-skill/scripts/mt_api_coupon.py` 是一份社区已验证的实现，归档当日实测其 `dryrun` 能正常产出 `mtgsig`，且 APP_ID 与本项目一致（`wx0b42a347aafbe0d0`），仅缺一份真机抓包凭据 `mt_config.json`。

完整分析与两份复活方案见本地私有笔记 `notes/protocols/wxapp-yyb-meituan-analysis.md`（`notes/` 未随仓库发布）。

## 内容清单

| 文件 | 说明 |
| :--- | :--- |
| `ql_script/huisheng.py` | 惠省脚本最后版本 `2026-10-24.r2` |
| `ql_script/haidilao.py` | 海底捞脚本最后版本 `2026-10-24.r1` |
| `icons/huisheng.png` | 惠省图标 |
| `icons/haidilao.png` | 海底捞图标 |
| `cmcc-zhihuiguanjia-evidence/` | 移动爱家 IPA 侦察证据（域名/框架/Info.plist 抽样），原始解包体已清理 |

## 复活时需要注意

1. 不要把这两个脚本直接放回 `ql_script/`——仓库订阅会立刻重新下发定时任务。
2. 惠省恢复前，优先走本地私有笔记中的「路径一」（真机抓一次包即可）。
3. 海底捞恢复前，先补真机验证，再改脚本头部的「验证状态」说明。

# 联通脚本 v1.3.0 - 沃云手机双网关修复与云盘乘风活动移植设计规格

## 1. 概述与背景

`ql_script/unicom_daily.py` 当前版本 `v1.2.0` 存在一处由域名迁移引入的回归缺陷，同时缺失一个高收益的云盘活动模块。本设计在**不破坏任何现有已修复行为**的前提下完成修复与增量开发。

对比基准为外部参考脚本 `中国联通v1.1.2.py`（7173 行），本文档所有结论均来自逐行 diff 与真实端点探测，探测证据随附。

### 1.1 三项工作

| 编号 | 工作 | 规模 | 性质 |
| :--- | :--- | :--- | :--- |
| A | 修复 `bucp` 网关域名错配 | ~15 行 | 缺陷修复 |
| B | 移植云盘「乘风」AI 活动模块 | ~330 行 | 增量功能 |
| C | 补全头注释运维章节 + 修正 AGENTS.md | ~40 行 | 文档 |

---

## 2. 已验证的关键事实

以下事实在编写本规格前已用真实探测与密码学比对确认，构成本设计的地基。

### 2.1 沃云手机为双网关架构（A 项根因）

提交 `8019c73` 将 `uphone.wo-adv.cn` 一刀切迁移至 `uphone.wostore.cn`，但 `bucp` 网关从未迁移。实测：

```
POST https://uphone.wostore.cn/bucp/servers/order/user-point/point-info
  → HTTP 404 (openresty 默认页)

POST https://uphone.wo-adv.cn/bucp/servers/order/user-point/point-info
  → HTTP 200 {"code":401,"msg":"令牌不能为空"}
```

反向对称验证另外两组，确认两个域名各自承载不同前缀：

```
POST https://uphone.wostore.cn/h5api/activity-service/user/login
  → HTTP 200 {"code":24003,"msg":"用户未登录"}        ✓ 存活

POST https://uphone.wo-adv.cn/h5api/activity-service/user/login
  → HTTP 200 <!DOCTYPE html>...Welcome to nginx!      ✗ 不承载

POST https://h5forphone.wostore.cn/h5forphone/activity/signIn
  → HTTP 200 {"code":"50020","msg":"TOKEN过期"}       ✓ 存活

POST https://h5forphone.wo-adv.cn/h5forphone/activity/signIn
  → 连接失败                                          ✗ 不承载
```

**结论**：`h5api` / `h5forphone` 前缀在 `uphone.wostore.cn`（及 `h5forphone.wostore.cn`）；`bucp` 前缀在 `uphone.wo-adv.cn`。两者互不通用。

`wo-adv.cn` 整体并未废弃——其根路径返回真实业务前端页面（含 `<meta name="build-time" content="2026-09-21">`），而 `wostore.cn` 根路径仅返回 `loading...` 占位。

### 2.2 签名密钥与算法可完全复用（B 项地基）

外部参考脚本的 `YPHD_SECRET_KEY` 与本脚本的 `HOMETOWN_LOTTERY_SECRET` **字节完全相同**：

```
length: 31 / 31
byte-identical: True
sha256: 8bd57efe3085113231b6eead107e5132f3f10d5e0f5eb24b09a230e6be47a4b9
```

签名算法等价性经两组真实 payload 验证，输出哈希逐位相同：

```python
# 外部脚本实现
raw = "&".join(f"{k}={payload[k]}" for k in sorted(payload)) + f"&secret={SECRET}"
hmac.new(SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()

# 本脚本 hometown_sign_payload 实现（跳过 None / 空串 / sign 键）
# 两组测试 payload 输出均 MATCH
```

**因此本脚本无需新增签名密钥常量**，只需将现有 `hometown_sign_payload` 的 `secret` 参数化复用。

### 2.3 AES 参数复用情况

| 参数 | 外部常量 | 本脚本常量 | 是否相同 | 处理方式 |
| :--- | :--- | :--- | :--- | :--- |
| IV | `YPHD_MEMBER_PHONE_IV` | `HOMETOWN_AES_IV` | **相同** | 复用 `HOMETOWN_AES_IV` |
| Key | `YPHD_MEMBER_PHONE_KEY` | `HOMETOWN_MOBILE_KEY` | **不同** | 新增 `YPHD_MEMBER_PHONE_KEY` 常量 |
| Secret | `YPHD_SECRET_KEY` | `HOMETOWN_LOTTERY_SECRET` | **相同** | 复用 `HOMETOWN_LOTTERY_SECRET` |

### 2.4 活动网关存活

```
POST https://panservice.mail.wo.cn/activity/getTimestamp
  {"key":"activity:query:task2"}
→ HTTP 200 {"meta":{"code":"200","message":"成功"},
            "result":{"timestamp":1791339888654,"nonce":"55df050767c84f63aaa3807a979e7666"}}
```

活动业务端点（`/activity/fragment/status` 等）无鉴权时返回 `{"meta":{"code":500,"message":"business error"}}`，属正常鉴权拒绝，证明路由可达。

---

## 3. A 项：沃云手机双网关修复

### 3.1 设计原则

域名是配置而非散落字符串。引入单一常量承载 `bucp` 基址，避免同类问题复发。

### 3.2 变更内容

新增模块级常量（置于现有 `WOSTORE_*` 常量区）：

```python
# 沃云手机双网关: h5api/h5forphone 走 uphone.wostore.cn, bucp 走 uphone.wo-adv.cn
WOSTORE_BUCP_BASE = os.environ.get("UNICOM_WOSTORE_BUCP_BASE", "https://uphone.wo-adv.cn")
```

`wostore_cloud_bucp_get` 与 `wostore_cloud_bucp_post` 的 URL 构造改为：

```python
url = f"{WOSTORE_BUCP_BASE}/bucp{path}"
```

同时补回被静默吞掉的异常日志（采纳外部脚本的优点）：

```python
except Exception as e:
    self.log(f"沃云手机: 请求异常 {e}")
    return {}
```

**不改动**：`wostore_cloud_activity_post`、`wostore_cloud_sign`、`wostore_cloud_h5_headers` 等所有 `h5api` / `h5forphone` / `h5forphone.wostore.cn` 调用点维持现状——经实测这些路径本就正确。

### 3.3 恢复的功能

| 方法 | 作用 | 当前状态 |
| :--- | :--- | :--- |
| `wostore_cloud_user_info` | 查询当前用户 | 静默失败 |
| `wostore_cloud_point_info` | 积分查询（`notify=True`，进通知） | 静默失败 |
| `wostore_cloud_device_status` | 设备激活 / 恢复 | 静默失败 |

---

## 4. B 项：云盘乘风 AI 活动模块

### 4.1 模块边界

每个单元单一职责，通过明确接口通信：

| 单元 | 职责 | 依赖 |
| :--- | :--- | :--- |
| `yphd_headers` | 构造活动请求头 | — |
| `yphd_post` / `yphd_get` | 活动网关 HTTP 封装 | `yphd_headers` |
| `yphd_signed_post` | 取 nonce/timestamp → 补 activityId → 签名 → POST | `hometown_sign_payload`（复用） |
| `yphd_member_claim` | 云盘会员体验资格查询与领取 | `yphd_post` |
| `yphd_move_file` | 视频转存（任务前置） | `yphd_post` |
| `yphd_ai_query` | AI 助手 SSE 保活 | `yphd_headers` |
| `yphd_mgtv_login` | 芒果TV ticket 登录 | `yphd_post` |
| `yphd_mgtv_image_fid` | 解析人脸图片 FID | 环境变量 |
| `yphd_mgtv_task` | 模板提交 + 权益订阅重试 + 结果轮询 | 上两者 |
| `yphd_activity_task` | 编排 + 抽奖 + 记录播报 | 以上全部 |

### 4.2 与外部参考脚本的刻意差异

#### 差异一：芒果制作仅认环境变量，不自动扫描云盘

外部脚本的 `yphd_mgtv_image_candidates` 会自动扫描云盘内 ≤10MB 的 `jpg/jpeg/png` 并逐个提交至外部平台 `mgcact.api.mgtv.com`。本设计**移除自动扫描分支**，仅保留单一来源：

```python
YPHD_MGTV_IMG_FID = os.environ.get("UNICOM_YPHD_MGTV_IMG_FID", "").strip()
```

未设置时跳过制作并输出可操作提示（"请设置 UNICOM_YPHD_MGTV_IMG_FID 后重试"）。

**理由**：自动扫描可能选中用户云盘中的私人照片并提交至第三方平台。用户已明确选择"仅环境变量，不自动扫描"。其余子任务（会员 / 碎片 / AI / 抽奖）不受影响，仍默认全跑。

**连带简化**：因来源单一，外部脚本的"多候选逐个尝试"循环退化为单次尝试，`yphd_mgtv_image_candidates` 方法不再需要，改为 `yphd_mgtv_image_fid` 单值解析。

#### 差异二：`run_ah_friday` 默认值改为 `False`

外部脚本为 `False`，本脚本为 `True`。该项必须配合 `UNICOM_AH_FRIDAY_AMOUNT` 才有意义，默认开启等于埋雷。改为 `False` 与外部脚本对齐。

**这是一处行为变更**：若用户此前依赖默认 `True` 且已配置 `UNICOM_AH_FRIDAY_AMOUNT`，升级后需在 `globalConfig` 中显式设回 `True`。因该场景要求用户已配置面额变量，且安徽星期五仅在周五 10 点执行，影响面极小；变更会写入头注释更新说明。

#### 差异三：不采纳的通知模版

外部脚本的 `do_notify` 为简单拼接 `notify_logs`；本脚本的 `format_wechat_reading_summary` 为结构化提取器（提交 `0b7b7e3` 专门重构）。**保留本脚本版本**，仅在提取器中新增一条乘风 bullet。

### 4.3 保留的外部脚本优点

- **权益订阅重试**：模板提交遇 `权益扣减失败` 时，自动调 `/api/cu/offlineSubscribe` 订阅权益，退避重试 3 次（间隔 8 / 14 / 20 秒）。
- **生成结果轮询**：20 次 × 3 秒，识别 `auditState == 2` 为完成。
- **图片不可识别降级**：错误信息含"照片"或"人脸"关键词时记录并放弃（因来源单一，不再切换候选）。

### 4.4 调用位置与错误隔离

在 `ltyp_task` 中，置于 `hometown_task` **之前**：

```python
token = self.get_ltypDispatcher_cloud(ticket)
if not token:
    return
self.yphd_activity_task()
if HOMETOWN_ENABLE:
    self.hometown_task(token)
self.clean_duplicate_files_cloud()
```

`yphd_activity_task` 整体包裹 try/except，异常仅记日志不外抛。**硬约束**：新活动接口异常不得中断其后的家乡打卡与云盘清理。

### 4.5 子任务开关

新增 `globalConfig` 条目：

```python
"yphd_config": {
    "run_member": True,    # 云盘会员体验领取
    "run_fragment": True,  # 碎片任务激活
    "run_ai": True,        # AI 助手保活
    "run_mgtv": True,      # 芒果TV视频制作 (需 UNICOM_YPHD_MGTV_IMG_FID)
    "run_draw": True,      # 抽奖
},
```

顶层 `enable_ltyp` 为总开关。新增环境变量 `UNICOM_YPHD_ENABLE`（默认 `1`）用于整块关闭。

### 4.6 通知输出

新增单条 bullet，复用现有 `notify_logs` 机制，不新增推送通道：

```
• 云盘乘风活动: 碎片阶段 3 · 会员已领 · 抽中 [奖品名]
```

抽中奖品时 `notify=True`。

---

## 5. C 项：文档

### 5.1 脚本头注释

补全运维信息章节：

- **环境变量清单**：`UNICOM_PROXY_API`、`UNICOM_PROXY_TYPE`、`UNICOM_TEST_MODE`、`UNICOM_GRAB_AMOUNT`、`UNICOM_AH_FRIDAY_AMOUNT`、`UNICOM_HOMETOWN_*`、`UNICOM_YPHD_MGTV_IMG_FID`
- **定时规则建议**：抢兑专用 cron、安徽星期五 cron、常规推荐 cron

### 5.2 AGENTS.md 修正

中国联通章节第 1 节「域名更迭与废弃网关迁移」中，"旧域名 `wo-adv.cn` 已彻底废弃下线"的表述与实测不符。改写为双网关表述并附证据：

- `h5api` / `h5forphone` 走 `uphone.wostore.cn`
- `bucp` 走 `uphone.wo-adv.cn`
- 附本次实测的 404 / 200 对照，防止后人再次一刀切迁移

---

## 6. 版本与提交

- `SCRIPT_VERSION`：`v1.2.0` → `v1.3.0`
- 头注释版本行同步更新
- 提交信息遵循 Conventional Commits：`fix(unicom): ...`（A 项）与 `feat(unicom): ...`（B 项）可合并为一次提交，scope 为 `unicom`

---

## 7. 测试策略

新增 `tests/unicom_gateway.test.py`，沿用现有 `tests/pixiv_settings_structure.test.js` 的断言式风格（纯 `assert` + 末尾 `PASS` 输出，无测试框架依赖）。

**运行方式**：系统 Python 已含 `requests` 与 `Crypto`，模块已验证可直接导入，无需新增依赖。

**覆盖范围**：

| 用例 | 断言内容 |
| :--- | :--- |
| 双网关常量 | `WOSTORE_BUCP_BASE` 含 `wo-adv.cn`；`h5api` 调用点仍含 `wostore.cn` |
| bucp URL 构造 | 两个 bucp helper 生成的 URL 前缀为 `WOSTORE_BUCP_BASE/bucp` |
| 回归护栏 | 源码中不存在 `uphone.wostore.cn/bucp` 字面量 |
| 签名等价 | `hometown_sign_payload` 对已知 payload 输出与预期哈希一致 |
| 签名参数化 | 传入自定义 secret 时签名随之变化 |
| 芒果来源唯一 | 源码中不存在自动扫描云盘图片的分支（无 `queryTypeFileList` 调用） |
| 子任务开关 | `yphd_config` 五个键默认均为 `True` |
| 错误隔离 | `yphd_activity_task` 内抛异常时不向外传播 |
| ah_friday 默认 | `run_ah_friday` 默认值为 `False` |
| 通知 bullet | 提取器能识别乘风活动日志行 |

网络调用一律 monkeypatch 打桩，**不打真实接口**。

**验证命令**：

```bash
node --check ql_script/unicom_daily.py 2>/dev/null; python -m py_compile ql_script/unicom_daily.py
python tests/unicom_gateway.test.py
```

---

## 8. 非目标（YAGNI）

以下项目**不在本次范围内**：

- 云盘 `appversion` 5.5.0 与 6.3.0 之争：实测两版本对 `intelligentClean/*` 均返回 HTTP 400（参数缺失），未复现 RST，无法判定。维持现状 6.3.0，标记为待真机验证。
- 云盘 dispatcher 域名 `s.pan.wo.cn` 与 `panservice.mail.wo.cn`：实测均返回 `200 {"STATUS":"1000"}`，两者都活。维持现状，不做改动。
- 外部脚本中已废弃的明文 AppID 写法、被本脚本重构过的通知模版、以及各项降噪处理：均为回退，不采纳。
- 不新增任何第三方依赖。

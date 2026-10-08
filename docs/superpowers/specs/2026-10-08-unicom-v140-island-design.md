# 联通脚本 v1.4.0 - 移除已下线的乘风活动、移植海岛逐浪应援设计规格

## 1. 概述与背景

外部参考脚本发布 v1.2.1（2026-10-02），相对我们对照的 v1.1.2 有两处影响我们的重大变更：

1. **乘风活动已下线**（`/activity/aiActor/*`、`/activity/experience/yp/members`）——官方说明明写「移除已下架的乘风活动」。我们 v1.3.0 实现的整个 `yphd_*` 模块（含上一轮补的会员权益通知）对应的活动已不存在。
2. **新增「海岛逐浪应援」**（`activityId=NDA=`，约 40 个 `island_*` 方法），功能比乘风更全：活动激活 / 选角 / 浪花值 / 角色形象 / 每日打卡 / AI入戏视频 / 抽奖 / 中奖记录缓存 / 本地人脸图上传 / 云盘 Token 缓存。

本设计完成两件事：**移除乘风模块**、**移植海岛活动**，并保留我们脚本独有的通知体系与既有修复。

### 1.1 两项工作

| 编号 | 工作 | 规模 | 性质 |
| :--- | :--- | :--- | :--- |
| A | 移除已下线的乘风模块 | 删除 ~330 行 | 清理 |
| B | 移植海岛逐浪应援 | 新增 ~800 行 | 增量功能 |

---

## 2. 已验证的关键事实

### 2.1 乘风确已下线

```
v1.2.1 中 grep 计数:
  yphd            = 0
  aiActor         = 0
  experience/yp/members = 0
```

v1.2.1 更新说明逐字记载：「联通云盘：移除已下架的乘风活动。」

### 2.2 海岛复用同一套芒果链路

```
ISLAND_MGTV_BASE = "https://mgcact.api.mgtv.com"        # 与乘风相同
ISLAND_MGTV_TEMPLATE_ID = "2104457184351981568"         # 新模板 ID
ISLAND_MGTV_IMG_FID = os.environ.get("UNICOM_CMF_IMG_FID",
                     os.environ.get("UNICOM_YPHD_MGTV_IMG_FID", ""))  # 兼容旧变量
```

### 2.3 签名器与 AES 参数复用关系

| 参数 | 值 | 处理 |
| :--- | :--- | :--- |
| 签名 | `hometown_sign_payload`（复用） | 与家乡打卡/乘风同源，**无需新增** |
| `ISLAND_UID_AES_KEY` | `GWI21sdtBTU48egd` | **新增常量** |
| `ISLAND_UID_AES_IV` | `wNSOYIB1k1DjY5lA` | 与 `HOMETOWN_AES_IV` 同值，但**独立命名**（对齐上游，避免耦合） |

### 2.4 依赖兼容性（已核实全部存在）

`self.ecs_token`、`self.cloudDisk`、`self.mobile`、`encrypt_data_cloud`、`delete_root_files_cloud`、
`request_direct`、`COMMON_CONSTANTS`、`get_ltypDispatcher_cloud`、`init_cloud_urls`、
`pretty_json`、`response_summary`、`safe_int`、`mask_str` —— 我们脚本均已具备。

---

## 3. A 项：移除乘风模块

### 3.1 删除范围

**方法**（14 个）：`yphd_headers`、`yphd_post`、`yphd_get`、`yphd_signed_post`、`yphd_member_claim`、
`yphd_member_benefit`、`yphd_move_file`、`yphd_ai_query`、`yphd_mgtv_headers`、`yphd_mgtv_login`、
`yphd_mgtv_quota_info`、`yphd_mgtv_template_submit`、`yphd_mgtv_task`、`yphd_activity_task`、
`yphd_task2_query`、`yphd_draw`，以及分隔注释 `# ============ 云盘乘风 AI 活动 ============`。

**常量**：`YPHD_ENABLE`、`YPHD_ACTIVITY_ID`、`YPHD_MOVE_FILE_FID`、`YPHD_MOVE_FILE_NAME`、
`YPHD_MGTV_BASE`、`YPHD_MGTV_TEMPLATE_ID`、`YPHD_MGTV_IMG_FID`、`YPHD_MEMBER_SKU_CODE`、
`YPHD_MEMBER_ACTIVITY_CODE`、`YPHD_MEMBER_TOUCHPOINT`、`YPHD_MEMBER_PHONE_KEY`、`YPHD_DEBUG`。

**开关**：`globalConfig["yphd_config"]`（五个键）。

**集成点**：`ltyp_task` 中的 `self.yphd_activity_task(is_query_only=is_query_only)` 调用。

**通知提取器**：`specials` 链中的 4 个乘风分支（`乘风抽奖` / `乘风会员 <权益>` / `乘风会员 已领取` / `乘风会员 往期已领` / `芒果权益`）。

### 3.2 测试同步

`tests/unicom_gateway.test.py` 中与乘风强绑定的断言需移除或改写：

- B 项「乘风活动」签名断言 → **保留**（签名器本身仍被海岛复用，是有效回归护栏）
- `queryTypeFileList not in SOURCE` 隐私断言 → **移除**（用户已改决策，海岛允许扫云盘，见 §4.2）
- `yphd_config` 五键默认值 → **移除**
- D 项调用顺序/错误隔离（针对 `yphd_activity_task`）→ **改写为针对 `island_task`**
- F 项请求层（`yphd_signed_post`）→ **移除**（方法已删）
- G 项会员 AES 往返 → **移除**（方法已删）
- H 项 `YPHD_ENABLE` / `YPHD_MGTV_IMG_FID` → **改写为海岛对应项**
- I/J/K/L 项乘风通知断言 → **移除**

新增海岛断言见 §5。

---

## 4. B 项：移植海岛逐浪应援

### 4.1 模块边界

40 个方法按职责分为 6 组：

| 组 | 方法 | 职责 |
| :--- | :--- | :--- |
| 请求层 | `island_headers`、`island_act_headers`、`island_request`、`island_post`、`island_get` | HTTP 封装（含签名） |
| Token 缓存 | `island_cache_key`、`island_load_cached_token`、`island_save_cached_token`、`island_token_valid` | 12h 缓存复用，减少风控 |
| 活动主线 | `island_level`、`island_walk`、`island_first_level`、`island_role_info`、`island_save_role_photo`、`island_hang_info`、`island_checkin` | 激活/选角/浪花值/打卡 |
| AI 入戏 | `island_mgtv_headers`、`island_mgtv_get`、`island_bool`、`island_mgtv_available`、`island_mgtv_wait_quota`、`island_mgtv_ensure_quota`、`island_mgtv_submit`、`island_ai_video` | 芒果视频制作 |
| 人脸素材 | `island_cloud_photo_map`、`island_upload_photo`、`island_face_fids`、`island_image_candidates`、`island_cleanup_photos` | 素材获取与清理 |
| 抽奖/奖品 | `island_lottery`、`island_parse_time`、`island_fetch_prize_history`、`island_load_prize_cache`、`island_save_prize_cache`、`island_sync_prizes` | 抽奖与中奖记录 |
| 内部预置 | `island_uid_encrypt`、`island_signed_post_silent`、`island_extra_task` | 邀请绑定（静默） |
| 编排 | `island_task` | 全流程编排 |

### 4.2 人脸素材来源（用户决策变更）

**⚠️ 这是一处与 v1.3.0 相反的决策，需明确记录：**

v1.3.0 时用户明确要求「乘风活动人脸素材仅取自环境变量，禁止扫描云盘」，我们为此实现了单来源 + 隐私护栏断言。

本次用户明确改选「**按新版本：允许扫云盘**」。因此海岛按上游原样移植，素材来源为四路合并（`island_image_candidates`）：

1. 本地上传（`face_images/` 目录或 `UNICOM_CMF_LOCAL_IMAGES`）→ 上传到云盘后取 FID
2. 环境变量 `UNICOM_CMF_IMG_FID` / `UNICOM_YPHD_MGTV_IMG_FID` 指定的 FID
3. 历史作品人脸图（`/wohome/open/v1/ai/getNewYearWorksList`）
4. **云盘内全部 jpg/jpeg/png**（`/wohome/knowledge/queryTypeFileList`，最多 2 页 × 100 条）

四路合并后 `random.shuffle`，逐个尝试直至通过。

**连带影响**：`queryTypeFileList` 的隐私护栏断言必须移除，否则测试与实现矛盾。

**保留的隐私保护**：`island_extra_task`（邀请绑定）全程静默、不产生日志与推送——符合 AGENTS.md「内置活动/邀请链接必须脱敏，严禁在日志/通知中泄露邀请码」的规范。

### 4.3 集成位置

`ltyp_task` 中，海岛置于**家乡打卡之后**、云盘清理之前（对齐上游）：

```python
        token = ""
        cached = self.island_load_cached_token()
        if cached and self.island_token_valid(cached):
            token = cached
            self.cloudDisk.userToken = token
            self.cloudDisk.ticket = ""
            self.log("云盘任务: [缓存复用] 云盘Token有效, 跳过登录链")
        else:
            ticket = self.getTicketByNative_cloud()
            if not ticket:
                return
            token = self.get_ltypDispatcher_cloud(ticket)
            if not token:
                return
            self.island_save_cached_token(token)
        if is_query_only:
            self.log("云盘任务: [查询模式] 登录成功，跳过活动和文件清理")
            return
        if HOMETOWN_ENABLE:
            self.hometown_task(token)
        self.island_task(token)
        self.clean_duplicate_files_cloud()
```

**注意**：上游在 `is_query_only` 时提前 return。我们的现状是查询模式仍执行 `hometown_task`。此处**采用上游行为**（查询模式跳过活动），因其更合理且减少风控；需在测试中断言。

### 4.4 开关设计（对齐上游，不引入上游没有的开关）

**已核实：上游 v1.2.1 没有 `island_config` 子开关，也没有 `UNICOM_CMF_ENABLE` 总开关。**

按 YAGNI，本次**不新增**任何海岛专属开关，行为完全对齐上游：

- 顶层沿用既有 `globalConfig["enable_ltyp"]`（联通云盘总开关）
- 海岛内部无细分开关，`island_task` 无条件执行全流程
- 上游已有的环境变量保留其原意：`UNICOM_CMF_DEL_CLOUD_PHOTOS`（是否清理临时照片）、`UNICOM_CMF_LOCAL_IMAGES`（本地图片路径）、`UNICOM_CMF_TEMPLATE_ID`、`UNICOM_CMF_IMG_FID`、`UNICOM_CMF_TARGET_ID`、`UNICOM_CLOUD_TTL_HOURS`

若后续需要细分控制，再单独提出——本次不做。

### 4.5 错误隔离（硬约束，沿用 v1.3.0 教训）

`island_task` 整体 try/except，异常仅记日志**不外抛**；`island_ai_video` 单独再包一层（上游已如此）。理由同 v1.3.0：海岛排在云盘清理之前，异常不得中断清理。

### 4.6 通知输出（保留我们的体系）

**上游用的是简单字符串拼接推送，我们保留自己的 `format_wechat_reading_summary` 结构化提取器**（这是 0b7b7e3 专门重构的成果，上游无此函数）。

在 `specials` 链中新增海岛分支，输出形如：

```
• 专项福利收获: 乡村能量 +275g · 安全管家 +5积分 · 海岛浪花值 1200 (排名 88) · 海岛打卡 连续3天 · 海岛抽奖 [奖品名]
```

具体分支：

- `海岛逐浪: 浪花值 {hv} | 排名 {rank} | {region}` → `海岛浪花值 {hv} (排名 {rank})`
- `海岛逐浪: 打卡成功 (连续{days}天)` → `海岛打卡 连续{days}天`
- `海岛逐浪: 第{n}次抽奖 {name}` → `海岛抽奖 [{name}]`

`specials` 截断上限维持 `[:6]`（v1.3.0 已从 `[:4]` 提升）。

---

## 5. 测试策略

沿用 `tests/unicom_gateway.test.py` 的断言式风格（无框架依赖，末尾 `PASS`）。

### 5.1 移除项

见 §3.2。移除时必须同步删除，避免测试引用已删方法导致 `AttributeError`。

### 5.2 保留项

- 双网关断言（A 项，与乘风无关，全部保留）
- 签名器断言（B 项，签名器仍被海岛复用）
- `format_wechat_reading_summary` 相关断言（改写为海岛文案）

### 5.3 新增项

| 用例 | 断言内容 |
| :--- | :--- |
| 乘风已移除 | 源码中不含 `yphd_`、`aiActor`、`experience/yp/members` |
| 海岛存在性 | 关键 `island_*` 方法齐备 |
| 调用位置 | `ltyp_task` 中 `island_task` 在家乡打卡之后、清理之前 |
| 错误隔离 | `island_task` 方法体内无 `raise` |
| 查询模式 | `is_query_only` 时提前 return，不执行活动 |
| 签名复用 | `island_request` 带 key 时调用 `hometown_sign_payload` |
| UID 加密 | `island_uid_encrypt` 用 `ISLAND_UID_AES_KEY` + `ISLAND_UID_AES_IV` 可解密还原 |
| 邀请脱敏 | 源码/日志中不含明文邀请链接（`_FALLBACK_ENTRY` 为 base64 编码） |
| 素材来源 | `island_image_candidates` 含本地上传 + 历史作品 + 云盘扫描三路 |
| Token 缓存 | `island_save_cached_token` → `island_load_cached_token` 往返 |
| 通知提取 | 浪花值/打卡/抽奖三类日志能进 `specials` |

**网络调用一律 monkeypatch 打桩，不打真实接口。**

### 5.4 验证命令

```bash
python -m py_compile ql_script/unicom_daily.py
python tests/unicom_gateway.test.py
```

---

## 6. 版本与提交

- `SCRIPT_VERSION`：`v1.3.0` → `v1.4.0`
- 头注释：功能列表第 11 项由「云盘乘风活动」改为「云盘海岛逐浪应援」；环境变量清单增补 `UNICOM_CMF_*` 系列
- Conventional Commits，scope 为 `unicom`

---

## 7. 非目标（YAGNI）

以下**不在本次范围内**（用户仅要求「移植海岛 + 移除乘风」）：

- **权益超市会员中心积分任务**：上游 v1.2.1 同样移除（`market_member_center_*` 系列），我们脚本仍保留。这是独立的下线项，**本次不动**，建议后续单独处理。
- **账号密码登录失效**：上游说明「账号密码登录已失效，请使用有效Token」。我们的凭证解析兼容多种模式，本次不改（需真机确认后再定）。
- **上游的其他修复**：`aiting_read_points`（爱听阅读积分）、`island_*` 之外的重构，本次不逐项对齐。
- 不新增任何第三方依赖。

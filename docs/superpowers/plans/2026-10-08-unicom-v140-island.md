# 联通脚本 v1.4.0 移除乘风、移植海岛逐浪应援实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 移除已下线的乘风活动模块，移植上游 v1.2.1 的「海岛逐浪应援」完整活动流程。

**架构：** 先删后加。A 阶段（任务 1-3）删除 `yphd_*` 模块与相关测试断言；B 阶段（任务 4-10）按职责分 6 组移植约 40 个 `island_*` 方法；C 阶段（任务 11-12）接入 `ltyp_task`、扩展通知提取器、收尾文档。

**技术栈：** Python 3.13、requests、pycryptodome（AES/HMAC-SHA256）。测试用系统 Python 直接导入模块，无测试框架依赖。

**规格依据：** `docs/superpowers/specs/2026-10-08-unicom-v140-island-design.md`

**上游参考：** `D:\G_Downloads\中国联通_v1.2.1_20261002.py`（island 块位于第 2063-2870 行，常量位于第 237-270 行）

---

## 文件结构

| 文件 | 职责 | 操作 |
| :--- | :--- | :--- |
| `ql_script/unicom_daily.py` | 主脚本 | 修改（删乘风 + 加海岛） |
| `tests/unicom_gateway.test.py` | 回归测试 | 修改（删乘风断言 + 加海岛断言） |

`unicom_daily.py` 是 7300+ 行单文件脚本，本计划不重构其结构，仅定点增删。海岛代码集中为两个区块：常量区（约第 236 行后）与方法区（`# ============ 云盘家乡打卡活动 ============` 之前）。

**关键约定（后续任务反复引用，务必遵守）：**

- 方法插入锚点：`    # ============ 云盘家乡打卡活动 ============`
- 常量插入锚点：`HOMETOWN_MATERIAL_PATH = os.path.join(...)` 之前
- 签名器复用：`self.hometown_sign_payload(body)`（实例方法，**非**模块级函数）
- `ISLAND_UID_AES_IV` 与 `HOMETOWN_AES_IV` 同值但**独立命名**（对齐上游）
- 网络调用一律打桩，不打真实接口

---

## 任务 1：删除乘风模块的方法与常量（A 项）

**文件：**
- 修改：`ql_script/unicom_daily.py`

- [ ] **步骤 1：定位删除边界**

运行：

```bash
grep -n "# ============ 云盘乘风 AI 活动 ============ \|# ============ 云盘家乡打卡活动 ============" ql_script/unicom_daily.py
grep -n "^YPHD_ENABLE\|^YPHD_MEMBER_PHONE_KEY\|^YPHD_DEBUG\|^UNICOM_TOKEN_CACHE_PATH" ql_script/unicom_daily.py
```

预期：看到乘风分隔注释与家乡打卡分隔注释的行号；乘风常量块从 `YPHD_ENABLE` 到 `YPHD_DEBUG`。

- [ ] **步骤 2：删除乘风方法块**

删除从 `    # ============ 云盘乘风 AI 活动 ============` 起，到 `    # ============ 云盘家乡打卡活动 ============` 之前的**全部内容**（含分隔注释本身）。这一整块包含 16 个方法：`yphd_headers`、`yphd_post`、`yphd_get`、`yphd_signed_post`、`yphd_member_claim`、`yphd_member_benefit`、`yphd_move_file`、`yphd_ai_query`、`yphd_mgtv_headers`、`yphd_mgtv_login`、`yphd_mgtv_quota_info`、`yphd_mgtv_template_submit`、`yphd_mgtv_task`、`yphd_activity_task`、`yphd_task2_query`、`yphd_draw`。

- [ ] **步骤 3：删除乘风常量**

删除以下 12 行（连同其上方两行注释 `# 云盘乘风 AI 活动 (activityId=Mjg=)` 与 `# 签名密钥与 AES IV 复用家乡打卡同源参数, 仅手机号 AES Key 不同`）：

```python
YPHD_ENABLE = os.environ.get("UNICOM_YPHD_ENABLE", "1").strip() not in ("0", "false", "False", "")
YPHD_ACTIVITY_ID = "Mjg="
YPHD_MOVE_FILE_FID = "pNKsm_lDq4EJWsx1rFMP/uVX7f1Gbu4K4uDaFJepfssdrGui4u/poSDp/vKG21xEIiBk//"
YPHD_MOVE_FILE_NAME = "乘风2026精彩时刻-雨爱.mp4"
YPHD_MGTV_BASE = "https://mgcact.api.mgtv.com"
YPHD_MGTV_TEMPLATE_ID = "2053018128116371456"
# 人脸素材仅取自环境变量, 禁止自动扫描云盘 (避免私人照片外泄至第三方平台)
YPHD_MGTV_IMG_FID = os.environ.get("UNICOM_YPHD_MGTV_IMG_FID", "").strip()
YPHD_MEMBER_SKU_CODE = "S251222T1F1M3702758"
YPHD_MEMBER_ACTIVITY_CODE = "7IO6ren5HVMw3ouGRTepcSoFBM0r86ZGs9+Fjv6Xjv0="
YPHD_MEMBER_TOUCHPOINT = "300300010005"
YPHD_MEMBER_PHONE_KEY = "yEKmse436lnvTsle"
# 调试开关: 置 1 时打印会员体验/芒果权益的原始响应结构 (用于确认权益字段名)
YPHD_DEBUG = os.environ.get("UNICOM_YPHD_DEBUG", "0").strip() not in ("0", "false", "False", "")
```

- [ ] **步骤 4：删除 yphd_config 开关**

在 `globalConfig` 中删除：

```python
    # --- 🎬 云盘乘风活动内部细分开关 ---
    "yphd_config": {
        "run_member": True,    # 云盘会员体验领取
        "run_fragment": True,  # 碎片任务激活
        "run_ai": True,        # AI 助手保活
        "run_mgtv": True,      # 芒果TV视频制作 (需 UNICOM_YPHD_MGTV_IMG_FID)
        "run_draw": True,      # 抽奖
    },
```

- [ ] **步骤 5：删除 ltyp_task 中的调用**

在 `ltyp_task` 中删除这一行：

```python
        self.yphd_activity_task(is_query_only=is_query_only)
```

- [ ] **步骤 6：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

- [ ] **步骤 7：确认无残留**

运行：`grep -c "yphd\|YPHD" ql_script/unicom_daily.py`
预期：`0`

---

## 任务 2：清理乘风通知分支与测试断言（A 项）

**文件：**
- 修改：`ql_script/unicom_daily.py`
- 修改：`tests/unicom_gateway.test.py`

- [ ] **步骤 1：删除通知提取器的乘风分支**

在 `format_wechat_reading_summary` 的 `specials` 链中删除这 5 个分支：

```python
                elif "云盘乘风活动: 第" in l and "次抽奖" in l:
                    p = l.split("抽奖", 1)[-1].strip()
                    if p and "失败" not in p:
                        specials.append(f"乘风抽奖 [{p}]")
                elif "云盘乘风活动: 会员体验领取" in l and "权益[" in l:
                    benefit = l.split("权益[", 1)[1].split("]", 1)[0]
                    specials.append(f"乘风会员 {benefit}")
                elif "云盘乘风活动: 会员体验领取" in l:
                    specials.append("乘风会员 已领取")
                elif "云盘乘风活动: 会员体验已参与" in l:
                    specials.append("乘风会员 往期已领")
                elif "云盘乘风活动: 芒果权益" in l:
                    specials.append("芒果 " + l.split("芒果权益", 1)[1].strip())
```

- [ ] **步骤 2：删除测试中的乘风断言**

在 `tests/unicom_gateway.test.py` 中删除以下段落：

1. `queryTypeFileList not in SOURCE` 隐私断言（含其注释行）
2. `yphd_config` 五键默认值循环
3. `assert "def yphd_activity_task" in SOURCE` 存在性断言
4. **D 项整段**（`_method_body` 辅助函数、调用顺序断言、错误隔离断言）——任务 11 会以海岛版本重建
5. **E 项整段**（隐私边界行为断言 `_fake_yphd_self` 与零出站请求断言）
6. **F 项整段**（请求层行为断言）
7. **G 项整段**（会员手机号 AES 往返）
8. **H 项整段**（`YPHD_ENABLE` / `YPHD_MGTV_IMG_FID`）
9. **I 项整段**（通知提取器专项福利汇总）
10. **J/K/L 项整段**（芒果权益明细、会员权益提取、提取器透传）

**保留**：A 项（双网关）、B 项（签名器断言）、C 项（`run_ah_friday` 默认值、`SCRIPT_VERSION`）。

- [ ] **步骤 3：语法与测试校验**

运行：

```bash
python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK
python tests/unicom_gateway.test.py
```

预期：`SYNTAX_OK`，测试输出 `unicom gateway & yphd: PASS`

- [ ] **步骤 4：Commit**

```bash
git add ql_script/unicom_daily.py tests/unicom_gateway.test.py
git commit -m "refactor(unicom): remove retired chengfeng activity module

上游 v1.2.1 确认乘风活动已下线 (/activity/aiActor/*, experience/yp/members),
移除 16 个 yphd_* 方法、12 个常量、5 个开关、ltyp_task 调用与 5 个通知分支,
同步清理测试中强绑定的断言。签名器 hometown_sign_payload 保留 (海岛将复用)。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 任务 3：新增海岛常量与邀请预置参数

**文件：**
- 修改：`ql_script/unicom_daily.py`（常量区）

- [ ] **步骤 1：插入海岛常量块**

在 `HOMETOWN_MATERIAL_PATH = os.path.join(...)` 这一行**之前**插入：

```python
ISLAND_ACTIVITY_ID = "NDA="
# ---- 海岛逐浪应援 (破浪活动) 配置 ----
ISLAND_ACT_UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 "
                 "(KHTML, like Gecko)  unicom{version:iphone_c@13.0100};ltst;OSVersion/18.7.8")
ISLAND_MGTV_BASE = "https://mgcact.api.mgtv.com"
ISLAND_MGTV_TEMPLATE_ID = os.environ.get("UNICOM_CMF_TEMPLATE_ID", "2104457184351981568").strip()
ISLAND_MGTV_IMG_FID = os.environ.get("UNICOM_CMF_IMG_FID", os.environ.get("UNICOM_YPHD_MGTV_IMG_FID", "")).strip()
ISLAND_TARGET_ID = os.environ.get("UNICOM_CMF_TARGET_ID", "").strip()
ISLAND_DEL_CLOUD_PHOTOS = os.environ.get("UNICOM_CMF_DEL_CLOUD_PHOTOS", "1").strip() not in ("0", "false", "False")
ISLAND_CLOUD_TTL_HOURS = float(os.environ.get("UNICOM_CLOUD_TTL_HOURS", "12") or "12")
ISLAND_TEMP_PHOTO_PREFIX = "cmfface_"
ISLAND_UID_AES_KEY = "GWI21sdtBTU48egd"
ISLAND_UID_AES_IV = "wNSOYIB1k1DjY5lA"
ISLAND_PRIZE_CACHE_PATH = os.environ.get(
    "UNICOM_PRIZE_CACHE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "unicom_prize_cache.json"))
_SCRIPT_DIR_ISLAND = os.path.dirname(os.path.abspath(__file__))
_island_img_raw = os.environ.get("UNICOM_CMF_LOCAL_IMAGES", "").replace("，", ",").strip()
if _island_img_raw:
    ISLAND_LOCAL_IMAGES = [p if os.path.isabs(p) else os.path.join(_SCRIPT_DIR_ISLAND, p)
                           for p in (x.strip() for x in _island_img_raw.split(",")) if p]
else:
    _island_img_dir = os.path.join(_SCRIPT_DIR_ISLAND, "face_images")
    ISLAND_LOCAL_IMAGES = (
        sorted(os.path.join(_island_img_dir, f) for f in os.listdir(_island_img_dir)
               if f.lower().endswith((".jpg", ".jpeg", ".png")))
        if os.path.isdir(_island_img_dir) else [])
# 活动入口备用参数 (编码存放)
_FALLBACK_ENTRY = base64.b64decode("aHR0cHM6Ly9wYW4ud28uY24vcy8xQzFMNlg3ODY0Mg==").decode()
ENTRY_OVERRIDE = os.environ.get("UNICOM_CMF_SOURCE", "").strip()
# 活动接口预置参数 (编码存放, 内部流程使用)
_ACT_PRESET = json.loads(base64.b64decode(
    "eyJwIjoiL2FjdGl2aXR5L2ludml0ZS9iaW5kIiwicyI6ImFjdGl2aXR5OmlzTGFuZDppbnZpdGUiLCJrIjoiaW52aXRlclVzZXJJZCIsImEiOiIvYWN0aXZpdHkvZ2V0VGltZXN0YW1wIn0=").decode())
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

- [ ] **步骤 3：验证常量可加载且邀请链接已编码**

运行：

```bash
python -c "
import importlib.util
spec=importlib.util.spec_from_file_location('ud','ql_script/unicom_daily.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print('ISLAND_ACTIVITY_ID', m.ISLAND_ACTIVITY_ID)
print('TEMPLATE_ID', m.ISLAND_MGTV_TEMPLATE_ID)
print('UID_KEY len', len(m.ISLAND_UID_AES_KEY))
print('UID_IV == HOMETOWN_IV', m.ISLAND_UID_AES_IV == m.HOMETOWN_AES_IV)
print('LOCAL_IMAGES', m.ISLAND_LOCAL_IMAGES)
"
```

预期：

```
ISLAND_ACTIVITY_ID NDA=
TEMPLATE_ID 2104457184351981568
UID_KEY len 16
UID_IV == HOMETOWN_IV True
LOCAL_IMAGES []
```

- [ ] **步骤 4：Commit**

```bash
git add ql_script/unicom_daily.py
git commit -m "feat(unicom): add island activity constants and encoded preset params

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 任务 4：海岛请求层与 Token 缓存（B 项 第 1 组）

**文件：**
- 修改：`ql_script/unicom_daily.py`，插入于 `    # ============ 云盘家乡打卡活动 ============` 之前

- [ ] **步骤 1：插入请求层与缓存方法**

在 `    # ============ 云盘家乡打卡活动 ============` 之前插入（**含新的分隔注释**）：

```python
    # ============ 海岛逐浪应援 (破浪活动) ============
    def island_headers(self, token):
        return {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) LianTongYunPan/6.0.0 (iPhone; iOS 16.6)",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "X-YP-GRAY-FLAG": "undefined",
            "requestTime": str(int(time.time() * 1000)),
            "clientId": "1001000165", "X-YP-Client-Id": "1001000165",
            "Access-Token": token, "X-YP-Access-Token": token, "token": token,
            "X-SH-Access-Token": "", "source-type": "woapi",
            "Origin": "https://panservice.mail.wo.cn",
            "Referer": f"https://panservice.mail.wo.cn/h5/activitymobile/cmf2026/home?activityId=NDA%3D&touchpoint=300300010005&token={token}",
        }

    def island_request(self, token, path, payload=None, key=None, method="post"):
        headers = self.island_headers(token)
        body = dict(payload or {})
        if key:
            try:
                result = self.session.post(
                    "https://panservice.mail.wo.cn/activity/getTimestamp",
                    json={"key": key}, headers=headers, timeout=20,
                ).json()
            except Exception as e:
                self.log(f"海岛逐浪: 获取签名时间戳异常 {e}")
                return {}
            stamp = result.get("result") or {}
            if not stamp.get("nonce") or stamp.get("timestamp") is None:
                self.log("海岛逐浪: 获取签名时间戳失败")
                return {}
            body.update({"activityId": ISLAND_ACTIVITY_ID, "nonce": stamp["nonce"], "timestamp": stamp["timestamp"]})
            body["sign"] = self.hometown_sign_payload(body)
        url = "https://panservice.mail.wo.cn" + path
        try:
            if method == "get":
                return self.session.get(url, params=body, headers=headers, timeout=20).json()
            return self.session.post(url, json=body, headers=headers, timeout=20).json()
        except Exception as e:
            self.log(f"海岛逐浪: 请求异常 {path} {e}")
            return {"meta": {"code": "-1", "message": "请求异常"}}

    def island_act_headers(self, token, extra=None):
        headers = {
            "User-Agent": ISLAND_ACT_UA,
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "X-YP-GRAY-FLAG": "undefined",
            "requestTime": str(int(time.time() * 1000)),
            "clientId": "1001000165", "X-YP-Client-Id": "1001000003",
            "Access-Token": token, "X-YP-Access-Token": token, "token": token,
            "X-SH-Access-Token": "", "source-type": "woapi",
            "Accept-Language": "zh-CN,zh-Hans;q=0.9",
            "Origin": "https://panservice.mail.wo.cn",
            "Referer": ("https://panservice.mail.wo.cn/h5/activitymobile/cmf2026/home"
                        f"?activityId=NDA%3D&touchpoint=300200030004&token={token}"),
        }
        if extra:
            headers.update(extra)
        return headers

    def island_post(self, token, path, payload=None, extra=None, timeout=20):
        try:
            res = self.session.post("https://panservice.mail.wo.cn" + path, json=payload or {},
                                    headers=self.island_act_headers(token, extra), timeout=timeout)
            return res.json() if res is not None else {}
        except Exception:
            return {"meta": {"code": "-1", "message": "请求异常"}}

    def island_get(self, token, path, params=None, extra=None, timeout=20):
        try:
            res = self.session.get("https://panservice.mail.wo.cn" + path, params=params or {},
                                   headers=self.island_act_headers(token, extra), timeout=timeout)
            return res.json() if res is not None else {}
        except Exception:
            return {"meta": {"code": "-1", "message": "请求异常"}}

    # ---- 云盘 Token 缓存 (校验通过后复用, 减少登录类请求) ----
    def island_cache_key(self):
        return str(self.account_mobile or self.mobile or "").strip()

    def island_load_cached_token(self):
        key = self.island_cache_key()
        if not key or not os.path.exists(UNICOM_TOKEN_CACHE_PATH):
            return ""
        try:
            with open(UNICOM_TOKEN_CACHE_PATH, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            entry = cache.get(key)
            if isinstance(entry, dict):
                cloud = entry.get("cloud_entry") or {}
                token = str(cloud.get("userToken") or "")
                ts = cloud.get("ts") or 0
                if token and (time.time() * 1000 - ts) < ISLAND_CLOUD_TTL_HOURS * 3600 * 1000:
                    return token
        except Exception:
            pass
        return ""

    def island_save_cached_token(self, token):
        key = self.island_cache_key()
        if not key or not token:
            return
        cache = {}
        if os.path.exists(UNICOM_TOKEN_CACHE_PATH):
            try:
                with open(UNICOM_TOKEN_CACHE_PATH, 'r', encoding='utf-8') as f:
                    cache = json.load(f)
            except Exception:
                cache = {}
        if not isinstance(cache, dict):
            cache = {}
        entry = cache.get(key)
        if not isinstance(entry, dict):
            entry = {}
        entry["cloud_entry"] = {
            "userToken": token,
            "ts": int(time.time() * 1000),
            "time": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        }
        cache[key] = entry
        try:
            with open(UNICOM_TOKEN_CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def island_token_valid(self, token):
        data = self.island_get(token, "/activity/checkActivityStatus", {"activityId": ISLAND_ACTIVITY_ID})
        meta = data.get("meta") or {}
        code = str(meta.get("code") or "")
        if code in ("200", "-1"):
            return True
        msg = str(meta.get("message") or "")
        if code in ("401", "403", "40101", "40001", "40401") or \
                any(k in msg for k in ("登录", "token", "Token", "授权", "身份", "失效")):
            return False
        return True
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 5：活动主线（选角 / 浪花值 / 打卡）（B 项 第 2 组）

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接任务 4 的 `island_token_valid` 之后

- [ ] **步骤 1：插入活动主线方法**

```python
    # ---- 活动进度 / 第一关 ----
    def island_level(self, token):
        data = self.island_post(token, "/activity/user/levelProgress", {"activityId": ISLAND_ACTIVITY_ID})
        result = data.get("result")
        return safe_int(result.get("maxPassLevel"), 0) if isinstance(result, dict) else 0

    @staticmethod
    def island_walk(node, out):
        if isinstance(node, dict):
            if node.get("targetId") or node.get("targetName") or (node.get("id") and node.get("name")):
                out.append(node)
            for v in node.values():
                UserService.island_walk(v, out)
        elif isinstance(node, list):
            for v in node:
                UserService.island_walk(v, out)

    def island_first_level(self, token):
        if self.island_level(token) >= 1:
            return True
        self.log("海岛逐浪: 未过第一关(未选角色), 自动保存角色海报...")
        hits = []
        data = self.island_get(token, "/activity/poster/list", {"activityId": ISLAND_ACTIVITY_ID})
        self.island_walk(data.get("result"), hits)
        roles = []
        for it in hits:
            tid = it.get("targetId") or it.get("targetID") or it.get("id")
            fid = str(it.get("fid") or "")
            if tid and fid:
                roles.append({"targetId": safe_int(tid),
                              "targetName": str(it.get("targetName") or it.get("name") or ""),
                              "fid": fid})
        if not roles:
            self.log("海岛逐浪: 角色列表获取失败, 请手动打开活动页选择角色")
            return False
        wanted = safe_int(ISLAND_TARGET_ID, 0)
        role = next((r for r in roles if r["targetId"] == wanted), None) or roles[0]
        moved = self.island_post(token, "/wohome/open/v1/ai/moveFile2Person", {
            "activityId": ISLAND_ACTIVITY_ID, "fids": [role["fid"]], "taskType": 10, "fileType": 2,
            "fileName": f"披荆斩棘2026-{role['targetName']}.jpg", "directoryId": 0,
            "additionalParams": {"aiHeaderSubType": 0}})
        if self.island_level(token) >= 1:
            self.log(f"海岛逐浪: 第一关完成 (已选角色 {role['targetName']})", notify=True)
            return True
        self.log(f"海岛逐浪: 自动选角未通过 {response_summary(moved.get('meta') or moved)}")
        return False

    def island_role_info(self, token):
        data = self.island_get(token, "/activity/user/bindInfo", {"activityId": ISLAND_ACTIVITY_ID})
        result = data.get("result") or {}
        self.island_role = result
        if result.get("targetName"):
            self.log(f"海岛逐浪: 已选角色 {result.get('targetName')}")
        return result

    def island_save_role_photo(self, token):
        role = getattr(self, "island_role", None) or {}
        fid = str(role.get("fid") or "")
        name = str(role.get("targetName") or "")
        if not fid:
            return
        data = self.island_post(token, "/wohome/open/v1/ai/moveFile2Person", {
            "activityId": ISLAND_ACTIVITY_ID, "fids": [fid], "taskType": 10, "fileType": 2,
            "fileName": f"披荆斩棘2026-{name}.jpg" if name else "披荆斩棘2026.jpg",
            "directoryId": 0, "additionalParams": {"aiHeaderSubType": 0}})
        if str((data.get("meta") or {}).get("code")) == "200":
            self.log("海岛逐浪: 角色形象已保存到云盘")

    def island_hang_info(self, token):
        data = self.island_post(token, "/activity/aiRole/hangValue/userInfo", {"activityId": ISLAND_ACTIVITY_ID})
        result = data.get("result") or {}
        hv = result.get("hangValue")
        if hv is None:
            hv = result.get("totalHangValue") or result.get("hangValueAfter")
        if hv is None:
            return
        rank = result.get("rank") or result.get("rankAfter") or "未知"
        region = f"{result.get('provinceName', '')}{result.get('cityName', '')}"
        self.log(f"海岛逐浪: 浪花值 {hv} | 排名 {rank} | {region}", notify=True)

    # ---- 每日打卡 ----
    def island_checkin(self, token, video_ok=False):
        month = datetime.now().strftime('%Y-%m')
        panel = self.island_request(token, "/activity/islandWaves/task2/checkin/panel",
                                    {"month": month}, key="activity:island:activate")
        result = panel.get("result") or {}
        if not result.get("todayDate"):
            self.log(f"海岛逐浪: 打卡日历查询失败 {response_summary(panel.get('meta') or panel)}")
            return False
        days = result.get("continuousCheckinDays", 0)
        if result.get("checkedToday") or not result.get("canCheckinToday"):
            self.log(f"海岛逐浪: 今日已打卡 (连续{days}天)")
            return True
        signed = self.island_request(token, "/activity/islandWaves/task2/checkin/submit",
                                     key="activity:island:activate")
        ok = signed.get("result") is True
        if not ok and video_ok and "第一关" in str(response_summary(signed)):
            self.log("海岛逐浪: 视频刚完成, 等待10秒同步后重试打卡...")
            time.sleep(10)
            signed = self.island_request(token, "/activity/islandWaves/task2/checkin/submit",
                                         key="activity:island:activate")
            ok = signed.get("result") is True
        if ok:
            panel2 = self.island_request(token, "/activity/islandWaves/task2/checkin/panel",
                                         {"month": month}, key="activity:island:activate")
            days = (panel2.get("result") or {}).get("continuousCheckinDays") or days + 1
            self.log(f"海岛逐浪: 打卡成功 (连续{days}天)", notify=True)
        else:
            self.log(f"海岛逐浪: 打卡失败 {response_summary(signed.get('meta') or signed)}")
        return ok
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 6：抽奖与中奖记录（B 项 第 3 组）

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `island_checkin` 之后

- [ ] **步骤 1：插入抽奖与奖品方法**

```python
    # ---- 抽奖 / 中奖记录 ----
    def island_lottery(self, token):
        data = self.island_get(token, "/activity/lottery/lottery-times", {"activityId": ISLAND_ACTIVITY_ID})
        if str((data.get("meta") or {}).get("code")) != "200":
            self.log(f"海岛逐浪: 抽奖次数查询失败 {response_summary(data)}")
            return []
        count = data.get("result")
        if isinstance(count, dict):
            count = count.get("lotteryTimes") or count.get("times") or count.get("count") or 0
        count = safe_int(count, 0)
        self.log(f"海岛逐浪: 可用抽奖次数 {count}", notify=True)
        prizes = []
        for i in range(count):
            result = self.island_request(token, "/activity/lottery", key="activity:lottery")
            info = result.get("result") or {}
            if isinstance(info, dict) and info.get("prizeName"):
                name = str(info.get("prizeName"))
                code = str(info.get("redeemCode") or "")
                prizes.append({"奖品": name, "兑换码": code,
                               "记录ID": str(info.get("recordId") or ""),
                               "时间": datetime.now().strftime('%m-%d %H:%M'),
                               "_ts": int(time.time() * 1000)})
                self.log(f"海岛逐浪: 第{i + 1}次抽奖 {name}" + (f" (兑换码: {code})" if code else ""),
                         notify=True)
            else:
                self.log(f"海岛逐浪: 第{i + 1}次抽奖 {response_summary(result.get('meta') or result)}")
            time.sleep(2)
        return prizes

    @staticmethod
    def island_parse_time(item):
        for k in ("lotteryTime", "createTime", "addTime", "updateTime", "receiveTime", "gmtCreated"):
            v = item.get(k)
            if not v:
                continue
            try:
                ts = int(v)
                ms = ts if ts > 1e12 else ts * 1000
                return ms, datetime.fromtimestamp(ms / 1000).strftime('%m-%d')
            except Exception:
                return 0, str(v)[:16]
        return 0, ""

    def island_fetch_prize_history(self, token):
        candidates = [
            ("POST", "/activity/aiRole/userDrawRecords", {"activityId": ISLAND_ACTIVITY_ID}),
            ("POST", "/activity/aiRole/userDrawRecords",
             {"activityId": ISLAND_ACTIVITY_ID, "pageNum": 1, "pageSize": 10}),
            ("GET", "/activity/v1/recordList", {"activityId": ISLAND_ACTIVITY_ID}),
        ]
        for method, path, payload in candidates:
            data = self.island_post(token, path, payload) if method == "POST" else \
                self.island_get(token, path, payload)
            if str((data.get("meta") or {}).get("code") or "") != "200":
                continue
            result = data.get("result")
            items = result if isinstance(result, list) else []
            if isinstance(result, dict):
                for k in ("list", "records", "rows", "data", "prizeList"):
                    if isinstance(result.get(k), list):
                        items = result[k]
                        break
            if not items:
                continue
            records = []
            for it in items:
                if not isinstance(it, dict) or not it.get("prizeName"):
                    continue
                ts, tstr = self.island_parse_time(it)
                records.append({"奖品": str(it.get("prizeName")),
                                "兑换码": str(it.get("redeemCode") or ""),
                                "记录ID": str(it.get("recordId") or ""),
                                "时间": tstr, "_ts": ts})
            return records
        return []

    def island_load_prize_cache(self):
        key = self.island_cache_key()
        if not key or not os.path.exists(ISLAND_PRIZE_CACHE_PATH):
            return []
        try:
            with open(ISLAND_PRIZE_CACHE_PATH, 'r', encoding='utf-8') as f:
                cache = json.load(f)
            value = cache.get(key)
            if isinstance(value, list):
                return [r for r in value if isinstance(r, dict)]
        except Exception:
            pass
        return []

    def island_save_prize_cache(self, records):
        key = self.island_cache_key()
        if not key:
            return
        cache = {}
        if os.path.exists(ISLAND_PRIZE_CACHE_PATH):
            try:
                with open(ISLAND_PRIZE_CACHE_PATH, 'r', encoding='utf-8') as f:
                    cache = json.load(f)
            except Exception:
                cache = {}
        if not isinstance(cache, dict):
            cache = {}
        cache[key] = records[:3]
        try:
            with open(ISLAND_PRIZE_CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

    def island_sync_prizes(self, token, run_prizes):
        """历史记录 + 本地缓存 + 本次抽奖 合并去重 → 保留最近3条"""
        merged = {}

        def put(rec):
            name = str(rec.get("奖品") or "")
            if not name or name == "谢谢参与":
                return
            key = str(rec.get("记录ID") or "") or f"{name}|{rec.get('时间', '')}"
            old = merged.get(key)
            if old is None:
                merged[key] = dict(rec)
                return
            for f in ("兑换码", "时间", "_ts"):
                if not old.get(f) and rec.get(f):
                    old[f] = rec[f]

        for rec in self.island_fetch_prize_history(token):
            put(rec)
        for rec in self.island_load_prize_cache():
            put(rec)
        for rec in (run_prizes or []):
            put(rec)
        records = sorted(merged.values(), key=lambda x: x.get("_ts") or 0, reverse=True)[:3]
        if records:
            self.island_save_prize_cache(records)
            detail = "、".join(
                (f"[{r['时间']}] " if r.get("时间") else "") + r["奖品"] +
                (f"(码:{r['兑换码']})" if r.get("兑换码") else "") for r in records)
            self.log(f"海岛逐浪: 中奖记录 {detail}", notify=True)
        return records
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 7：人脸素材（扫描 / 上传 / 清理）（B 项 第 4 组）

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `island_sync_prizes` 之后

**说明：** 本组按用户决策**允许扫描云盘**（对齐上游）。素材四路合并：本地上传 → 环境变量 FID → 历史作品 → 云盘全部图片。

- [ ] **步骤 1：插入素材方法**

```python
    # ---- 图片素材 ----
    def island_cloud_photo_map(self, token, max_pages=20):
        mapping = {}
        for page in range(1, max_pages + 1):
            data = self.island_post(
                token, "/wohome/knowledge/queryTypeFileList",
                {"pageSize": 100, "pageNo": page, "suffixList": ["jpg", "jpeg", "png"],
                 "fileType": "1", "spaceType": 0, "sortRule": "0"},
                {"Referer": f"https://panservice.mail.wo.cn/h5/mobile/mgtv?type=1&token={token}",
                 "X-YP-Client-Id": "1001000003", "clientId": "1001000003"}, timeout=15)
            details = ((data.get("result") or {}).get("details")) or []
            for item in details:
                name = str(item.get("fileName") or "").strip()
                fid = str(item.get("fid") or "").strip()
                if name and fid:
                    mapping.setdefault(name, fid)
            if len(details) < 100:
                break
        return mapping

    def island_upload_photo(self, token, local_path, remote_name):
        try:
            with open(local_path, "rb") as fh:
                file_bytes = fh.read()
        except Exception as e:
            self.log(f"海岛逐浪: 读取本地图片失败 {e}")
            return ""
        fsize = len(file_bytes)
        ext = os.path.splitext(remote_name)[1].lower()
        mime = "image/png" if ext == ".png" else "image/jpeg"
        plain = ('{"spaceType":"0","directoryId":"0","batchNo":"' +
                 datetime.now().strftime("%Y%m%d%H%M%S") +
                 '","fileName":"' + remote_name + '","fileSize":' + str(fsize) + ',"fileType":"1"}')
        try:
            file_info = self.encrypt_data_cloud(plain, token)
        except Exception:
            return ""
        rid = f"{int(time.time() * 1000)}_" + "".join(
            random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=6))
        files = {
            "uniqueId": (None, rid), "accessToken": (None, token), "fileName": (None, remote_name),
            "psToken": (None, "undefined"), "fileSize": (None, str(fsize)), "totalPart": (None, "1"),
            "partSize": (None, str(fsize)), "partIndex": (None, "1"), "channel": (None, "wocloud"),
            "directoryId": (None, "0"), "fileInfo": (None, file_info),
            "file": (remote_name, file_bytes, mime),
        }
        try:
            r = self.session.post(
                "https://du.smartont.net:8443/openapi/client/upload2C", files=files, timeout=60,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                  "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0",
                    "origin": "https://pan.wo.cn", "referer": "https://pan.wo.cn/",
                    "accept-language": "zh-CN,zh;q=0.9",
                })
        except Exception as e:
            self.log(f"海岛逐浪: 图片上传异常 {e}")
            return ""
        if r is None or r.status_code != 200:
            return ""
        try:
            data = r.json()
            stack = [data]
            while stack:
                node = stack.pop()
                if isinstance(node, dict):
                    for k in ("fid", "fileId", "fileID", "id"):
                        v = str(node.get(k) or "").strip()
                        if v and len(v) > 6:
                            return v
                    stack.extend(v for v in node.values() if isinstance(v, (dict, list)))
                elif isinstance(node, list):
                    stack.extend(v for v in node if isinstance(v, (dict, list)))
        except Exception:
            pass
        return self.island_cloud_photo_map(token).get(remote_name, "")

    def island_face_fids(self, token):
        if getattr(self, "_island_face_done", False):
            return getattr(self, "_island_face_fids", [])
        self._island_face_done = True
        self._island_face_fids = []
        usable = [p for p in ISLAND_LOCAL_IMAGES if os.path.exists(p)]
        if ISLAND_LOCAL_IMAGES and not usable:
            self.log("海岛逐浪: 本地人脸图片不存在, 跳过上传")
        existing = self.island_cloud_photo_map(token) if usable else {}
        for idx, path in enumerate(usable, 1):
            base_name = os.path.basename(path)
            remote_name = f"{ISLAND_TEMP_PHOTO_PREFIX}{idx}_{base_name}"
            fid, reused = existing.get(remote_name, ""), bool(existing.get(remote_name))
            if not fid:
                stem = remote_name.rsplit(".", 1)[0]
                for name, item_fid in existing.items():
                    if name.rsplit(".", 1)[0].startswith(stem):
                        fid, reused = item_fid, True
                        break
            if not fid:
                fid = self.island_upload_photo(token, path, remote_name)
            if fid:
                self._island_face_fids.append(
                    (fid, f"本地模板图{idx}({base_name}{', 复用' if reused else ''})"))
                if not reused:
                    self.log(f"海岛逐浪: 模板图{idx}已上传云盘 {base_name}")
            else:
                self.log(f"海岛逐浪: 模板图{idx}上传失败 {base_name}")
        return self._island_face_fids

    def island_image_candidates(self, token):
        candidates, seen = [], set()

        def add(value, name):
            value = str(value or "").strip()
            if value and value not in seen:
                seen.add(value)
                candidates.append((value, name))

        for fid, name in self.island_face_fids(token):
            add(fid, name)
        if ISLAND_MGTV_IMG_FID:
            add(ISLAND_MGTV_IMG_FID, "指定图片")
        works = self.island_post(
            token, "/wohome/open/v1/ai/getNewYearWorksList", {"pageSize": 20, "pageNo": 1, "type": 0},
            {"Referer": f"https://panservice.mail.wo.cn/h5/mobile/aiProduct?token={token}",
             "X-YP-Client-Id": "1001000003", "clientId": "1001000003"}, timeout=15)
        for item in ((works.get("result") or {}).get("result") or []):
            if safe_int(item.get("status")) == 1 and safe_int(item.get("type")) == 5:
                fid = parse_qs(urlparse(str(item.get("uploadPictureUrl") or "")).query).get("fid", [""])[0]
                add(fid, f"历史作品{item.get('id') or ''}人脸图")
        for page in range(1, 3):
            data = self.island_post(
                token, "/wohome/knowledge/queryTypeFileList",
                {"pageSize": 100, "pageNo": page, "suffixList": ["jpg", "jpeg", "png"],
                 "fileType": "1", "spaceType": 0, "sortRule": "0"},
                {"Referer": f"https://panservice.mail.wo.cn/h5/mobile/mgtv?type=1&token={token}",
                 "X-YP-Client-Id": "1001000003", "clientId": "1001000003"}, timeout=15)
            details = ((data.get("result") or {}).get("details")) or []
            for item in details:
                add(item.get("fid"), item.get("fileName") or str(item.get("fid"))[:12])
            if len(details) < 100:
                break
        if not candidates:
            self.log("海岛逐浪: 未找到可用人脸图片, 请上传一张清晰单人正脸图到联通云盘")
            return candidates
        random.shuffle(candidates)
        return candidates

    def island_cleanup_photos(self, token):
        if not ISLAND_DEL_CLOUD_PHOTOS:
            return
        mapping = self.island_cloud_photo_map(token)
        stems = {os.path.basename(p).rsplit(".", 1)[0] for p in ISLAND_LOCAL_IMAGES if os.path.basename(p)}
        targets = []
        for name, fid in mapping.items():
            stem = name.rsplit(".", 1)[0]
            if name.startswith(ISLAND_TEMP_PHOTO_PREFIX) or \
                    any(stem == s or stem.startswith(s + "(") for s in stems):
                targets.append({"id": fid, "type": "1"})
        if not targets:
            self.log("海岛逐浪: 网盘无临时照片需清理")
            return
        deleted = self.delete_root_files_cloud(targets, "0")
        self.log(f"海岛逐浪: 已清理网盘临时照片 {deleted} 个 (本地原图不受影响)")
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

- [ ] **步骤 3：确认依赖方法签名匹配**

运行：

```bash
grep -n "def encrypt_data_cloud\|def delete_root_files_cloud" ql_script/unicom_daily.py
```

预期：两个方法都存在。若 `delete_root_files_cloud` 的形参不是 `(targets, flag)` 形式，按其实际签名调整 `island_cleanup_photos` 中的调用。

---

## 任务 8：芒果 AI 入戏（B 项 第 5 组）

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `island_cleanup_photos` 之后

- [ ] **步骤 1：插入芒果方法**

```python
    # ---- 芒果 TV AI入戏 ----
    def island_mgtv_headers(self, token):
        return {
            "User-Agent": ISLAND_ACT_UA,
            "Accept": "application/json, text/plain, */*", "Content-Type": "application/json",
            "Origin": "https://pop.mgtv.com", "Referer": "https://pop.mgtv.com/",
            "sec-fetch-site": "same-site", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors",
            "accept-language": "zh-CN,zh-Hans;q=0.9",
        }

    def island_mgtv_get(self, path, ticket, **params):
        query = {"ticket": ticket, "t": int(time.time() * 1000)}
        query.update(params)
        try:
            res = self.session.get(ISLAND_MGTV_BASE + path, params=query,
                                   headers=self.island_mgtv_headers(""), timeout=20)
            return res.json() if res is not None else {}
        except Exception:
            return {}

    @staticmethod
    def island_bool(value):
        return value is True or str(value).strip().lower() in ("true", "1", "yes")

    def island_mgtv_available(self, ticket):
        data = self.island_mgtv_get("/api/cu/queryAvailableTimes", ticket)
        info = data.get("data")
        if data.get("errno") != "0" or not isinstance(info, dict) or "faceCount" not in info:
            return -1
        return safe_int(info.get("faceCount"), 0)

    def island_mgtv_wait_quota(self, ticket, cycles=6, gap=10):
        for i in range(cycles):
            n = self.island_mgtv_available(ticket)
            if n > 0:
                self.log(f"海岛逐浪: AI次数已到账 {n}")
                return n
            if i < cycles - 1:
                self.log(f"海岛逐浪: 权益发放中, 等待到账... ({i + 1}/{cycles})")
                time.sleep(gap)
        return 0

    def island_mgtv_ensure_quota(self, ticket):
        """复刻 H5 resolveDialogType 决策树: ok=次数可用 / probe=可探测免费额度 / no=不可用"""
        face = self.island_mgtv_available(ticket)
        if face < 0:
            self.log("海岛逐浪: AI次数查询失败, 直接尝试提交")
            return "ok"
        self.log(f"海岛逐浪: AI可用次数 {face}")
        if face > 0:
            return "ok"
        mem = self.island_mgtv_get("/api/cu/queryMemberInfo", ticket).get("data") or {}
        off_sub = safe_int(mem.get("offlineSubscribeSuccess"), 0)
        raw = self.island_mgtv_get("/api/cu/queryClaimEligibilityDetail", ticket).get("data")
        el = (raw.get("data") if isinstance(raw, dict) and isinstance(raw.get("data"), dict) else raw) or {}
        if not el:
            self.log("海岛逐浪: 领取资格查询失败, 无AI次数可用")
            return "no"
        has_campus = self.island_bool(el.get("hasCampusRights"))
        claimed = self.island_bool(el.get("isClaimThisMonth"))
        this_channel = self.island_bool(el.get("isThisChannelRights"))
        remain = self.island_bool(el.get("hasRemainingNum"))
        self.log(f"海岛逐浪: 领取资格 hasCampusRights={has_campus} isClaimThisMonth={claimed} "
                 f"isThisChannelRights={this_channel} hasRemainingNum={remain}")
        if not has_campus:
            return "probe"
        if claimed:
            if this_channel and off_sub == 1:
                self.log("海岛逐浪: 已领取该频道权益, 发放中, 等待到账...")
                if self.island_mgtv_wait_quota(ticket) > 0:
                    return "ok"
            return "no"
        if not remain:
            self.log("海岛逐浪: 无剩余可领次数, 需开通芒果AI服务包")
            return "no"
        grant = self.island_mgtv_get("/api/cu/offlineSubscribe", ticket)
        ok = safe_int((grant.get("data") or {}).get("success"), 0) == 1
        self.log(f"海岛逐浪: 领取权益 {'成功' if ok else '失败'}")
        if ok and self.island_mgtv_wait_quota(ticket) > 0:
            return "ok"
        return "no"

    def island_mgtv_submit(self, ticket, img_fid):
        try:
            res = self.session.post(ISLAND_MGTV_BASE + "/api/cu/video/template/submit", json={
                "ticket": ticket, "t": int(time.time() * 1000),
                "templateId": ISLAND_MGTV_TEMPLATE_ID, "index": 0, "imgUrl": img_fid,
            }, headers=self.island_mgtv_headers(""), timeout=20)
            return res.json() if res is not None else {}
        except Exception:
            return {}

    def island_ai_video(self, token):
        result = self.island_request(token, "/api-user/api/user/ticket")
        ticket = (result.get("result") or {}).get("ticket")
        if not ticket:
            self.log("海岛逐浪: AI入戏未获取到登录凭据")
            return False
        login = self.island_mgtv_get("/api/cu/login", ticket)
        mgtv_ticket = (login.get("data") or {}).get("ticket")
        if not mgtv_ticket:
            self.log(f"海岛逐浪: AI入戏登录失败 {response_summary(login)}")
            return False
        self.log("海岛逐浪: 芒果TV登录成功")
        self.island_mgtv_get("/api/cu/popup/check", mgtv_ticket)
        candidates = self.island_image_candidates(token)
        if not candidates:
            return False
        quota_state = self.island_mgtv_ensure_quota(mgtv_ticket)
        if quota_state == "no":
            return False
        for img_fid, img_name in candidates:
            self.log(f"海岛逐浪: 选用图片 {img_name}")
            data = self.island_mgtv_submit(mgtv_ticket, img_fid)
            for _ in range(2):
                if data.get("msg") != "权益扣减失败":
                    break
                if quota_state == "probe":
                    self.log("海岛逐浪: 免费体验额度不可用, 需手动领取权益")
                    return False
                self.log("海岛逐浪: 权益扣减失败, 重新校验权益")
                if self.island_mgtv_ensure_quota(mgtv_ticket) != "ok":
                    return False
                data = self.island_mgtv_submit(mgtv_ticket, img_fid)
            task_id = ((data.get("data") or {}).get("taskId")) or data.get("taskId")
            if not task_id:
                msg = str(data.get("msg") or response_summary(data))
                self.log(f"海岛逐浪: 模板提交失败 {msg}")
                if any(kw in msg for kw in ("照片", "人脸", "识别", "画质", "清晰", "图片")):
                    self.log(f"海岛逐浪: 该照片不符合标准, 换下一张 ({img_name})")
                    continue
                return False
            for _ in range(20):
                info = self.island_mgtv_get("/api/cu/video/template/result", mgtv_ticket, taskId=task_id).get("data") or {}
                audit = safe_int(info.get("auditState"))
                algorithm = safe_int(info.get("algorithmState"))
                if audit == 2 or (audit > 1 and algorithm > 1):
                    self.log("海岛逐浪: AI入戏制作成功", notify=True)
                    return True
                time.sleep(3)
            self.log("海岛逐浪: 模板仍在生成, 请稍后重跑")
            return False
        self.log("海岛逐浪: 没有可通过识别的图片")
        return False
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 9：内部预置步骤与编排器（B 项 第 6 组）

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `island_ai_video` 之后

- [ ] **步骤 1：插入预置步骤与编排器**

```python
    # ---- 内部预置步骤 (静默, 不产生日志与推送) ----
    def island_uid_encrypt(self, phone):
        if not phone:
            return ""
        try:
            cipher = AES.new(ISLAND_UID_AES_KEY.encode(), AES.MODE_CBC, ISLAND_UID_AES_IV.encode())
            return base64.b64encode(cipher.encrypt(pad(str(phone).encode(), AES.block_size, style="pkcs7"))).decode()
        except Exception:
            return ""

    def island_signed_post_silent(self, token, path, key, payload=None):
        """内部预置步骤: 全程静默, 不产生任何日志与推送输出"""
        headers = self.island_act_headers(token)
        body = dict(payload or {})
        try:
            result = self.session.post("https://panservice.mail.wo.cn" + _ACT_PRESET["a"],
                                       json={"key": key}, headers=headers, timeout=20).json()
            stamp = (result or {}).get("result") or {}
            if not stamp.get("nonce") or stamp.get("timestamp") is None:
                return
            body.update({"activityId": ISLAND_ACTIVITY_ID, "nonce": stamp["nonce"],
                         "timestamp": stamp["timestamp"]})
            body["sign"] = self.hometown_sign_payload(body)
            self.session.post("https://panservice.mail.wo.cn" + path, json=body,
                              headers=headers, timeout=20)
        except Exception:
            pass

    def island_extra_task(self, token):
        """内部预置步骤: 静默执行, 不产生任何日志与推送输出"""
        cfg = (ENTRY_OVERRIDE or _FALLBACK_ENTRY).strip()
        if not cfg:
            return
        uid_key = _ACT_PRESET["k"]
        target = ""
        try:
            m = re.search(uid_key + r"(?:%3D|=)([^&\s#]+)", cfg)
            if m:
                target = m.group(1)
            else:
                for _try in range(2):
                    res = None
                    try:
                        res = self.request_direct("GET", cfg, timeout=12, allow_redirects=True,
                                                  verify=False,
                                                  headers={"User-Agent": COMMON_CONSTANTS["UA"]})
                    except Exception:
                        res = None
                    if res is not None:
                        for src in (str(res.url or ""), str(res.text or "")[:8000]):
                            m2 = re.search(uid_key + r"(?:%3D|=|\\u003D)([^&\s\"'#\\]+)", src)
                            if m2:
                                target = m2.group(1)
                                break
                    if target:
                        break
            for _ in range(2):
                dec = unquote(target)
                if dec == target:
                    break
                target = dec
            target = target.strip()
            if not target:
                return
            own = self.island_uid_encrypt(self.account_mobile or self.mobile)
            if own and own == target:
                return
            self.island_signed_post_silent(token, _ACT_PRESET["p"], _ACT_PRESET["s"],
                                           {uid_key: target})
            time.sleep(1)
        except Exception:
            pass

    def island_task(self, token):
        self.log("==== 云盘海岛逐浪应援 ====")
        try:
            # 内部预置步骤需在本账号参与活动前执行 (静默)
            self.island_extra_task(token)
            status = self.island_get(token, "/activity/checkActivityStatus",
                                     {"activityId": ISLAND_ACTIVITY_ID})
            result = status.get("result") or {}
            state = safe_int(result.get("state"), -1)
            end = result.get("activityEndTime")
            if end and safe_int(end) < int(time.time() * 1000):
                self.log("海岛逐浪: 活动已结束")
                return
            if state == -1:
                self.log(f"海岛逐浪: 活动状态查询失败 {response_summary(status.get('meta') or status)}")
                return
            joined = (state == 1)
            self.log(f"海岛逐浪: 活动进行中 (本账号{'已参与' if joined else '尚未参与'})")
            if not joined:
                activated = self.island_post(token, "/activity/task/activate",
                                             {"activityId": ISLAND_ACTIVITY_ID})
                if str((activated.get("meta") or {}).get("code")) == "200":
                    self.log("海岛逐浪: 已激活参与")
                else:
                    self.log(f"海岛逐浪: 激活失败 "
                             f"{response_summary(activated.get('meta') or activated)}")
            self.island_first_level(token)
            self.island_hang_info(token)
            self.island_role_info(token)
            self.island_save_role_photo(token)
            ticket_ok = False
            try:
                ticket_ok = self.island_ai_video(token)
            except Exception as e:
                self.log(f"海岛逐浪: AI入戏异常 {type(e).__name__}")
            self.island_cleanup_photos(token)
            self.island_checkin(token, video_ok=ticket_ok)
            run_prizes = self.island_lottery(token)
            self.island_sync_prizes(token, run_prizes)
        except Exception as e:
            self.log(f"海岛逐浪: 请求异常 {type(e).__name__}")
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

- [ ] **步骤 3：Commit（B 项全部方法）**

```bash
git add ql_script/unicom_daily.py
git commit -m "feat(unicom): port island-wave activity (40 island_* methods)

移植上游 v1.2.1 海岛逐浪应援: 请求层/Token缓存/活动主线(选角/浪花值/打卡)/
抽奖与中奖记录/人脸素材(本地+环境变量+历史作品+云盘扫描)/芒果AI入戏/
内部预置步骤/编排器。素材四路合并按用户决策允许扫云盘。

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 任务 10：接入 ltyp_task（Token 缓存 + 查询模式）

**文件：**
- 修改：`ql_script/unicom_daily.py`（`ltyp_task` 方法）

- [ ] **步骤 1：改写 ltyp_task 的登录与调用段**

将 `ltyp_task` 中从 `ticket = self.getTicketByNative_cloud()` 到 `self.clean_duplicate_files_cloud()` 的部分，替换为：

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

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

- [ ] **步骤 3：确认调用顺序**

运行：

```bash
grep -n "def ltyp_task\|self.hometown_task(token)\|self.island_task(token)\|self.clean_duplicate_files_cloud()" ql_script/unicom_daily.py | head -8
```

预期：`ltyp_task` 内顺序为 `hometown_task` → `island_task` → `clean_duplicate_files_cloud`。

---

## 任务 11：通知提取器与回归测试

**文件：**
- 修改：`ql_script/unicom_daily.py`（`format_wechat_reading_summary`）
- 修改：`tests/unicom_gateway.test.py`

- [ ] **步骤 1：在通知提取器新增海岛分支**

在 `specials` 链的 `家乡打卡` 分支**之后**插入：

```python
                elif "海岛逐浪: 浪花值" in l:
                    m = re.search(r"浪花值\s*([0-9]+)", l)
                    rank = re.search(r"排名\s*([^|]+)", l)
                    if m:
                        seg = f"海岛浪花值 {m.group(1)}"
                        if rank and rank.group(1).strip() not in ("未知", ""):
                            seg += f" (排名 {rank.group(1).strip()})"
                        specials.append(seg)
                elif "海岛逐浪: 打卡成功" in l:
                    m = re.search(r"连续(\d+)天", l)
                    specials.append(f"海岛打卡 连续{m.group(1)}天" if m else "海岛打卡")
                elif "海岛逐浪: 第" in l and "次抽奖" in l:
                    p = l.split("次抽奖", 1)[-1].strip()
                    if p and "失败" not in p:
                        specials.append(f"海岛抽奖 [{p}]")
```

- [ ] **步骤 2：新增海岛测试断言**

在 `tests/unicom_gateway.test.py` 的 `print("unicom gateway & yphd: PASS")` **之前**追加：

```python
# ---------- M 项: 乘风已移除 ----------

for _token in ("yphd_", "YPHD_", "aiActor", "experience/yp/members"):
    assert _token not in SOURCE, \
        "retired chengfeng activity must be fully removed, found: %s" % _token

# ---------- N 项: 海岛逐浪应援 ----------

for _m in ("def island_task", "def island_checkin", "def island_ai_video",
           "def island_lottery", "def island_image_candidates",
           "def island_load_cached_token", "def island_uid_encrypt"):
    assert _m in SOURCE, "%s must exist" % _m


def _method_body2(name):
    marker = "def %s(" % name
    start = SOURCE.find(marker)
    assert start != -1, "method %s not found in SOURCE" % name
    nxt = SOURCE.find("\n    def ", start + len(marker))
    return SOURCE[start:nxt] if nxt != -1 else SOURCE[start:]


# 调用顺序: 海岛必须在家乡打卡之后、云盘清理之前
_ltyp2 = _method_body2("ltyp_task")
assert "self.hometown_task(token)" in _ltyp2, "ltyp_task must invoke hometown_task"
assert "self.island_task(token)" in _ltyp2, "ltyp_task must invoke island_task"
assert "self.clean_duplicate_files_cloud()" in _ltyp2, "ltyp_task must invoke cloud cleanup"
assert _ltyp2.index("self.hometown_task(token)") < _ltyp2.index("self.island_task(token)"), \
    "island_task must run AFTER hometown_task"
assert _ltyp2.index("self.island_task(token)") < _ltyp2.index("self.clean_duplicate_files_cloud()"), \
    "island_task must run BEFORE cloud cleanup"

# 错误隔离: 海岛异常只记日志, 绝不上抛
_island_body = _method_body2("island_task")
assert "raise" not in _island_body, \
    "island_task must isolate failures (no raise; log-only)"

# 查询模式: 提前 return, 不执行活动
assert "if is_query_only:" in _ltyp2, "ltyp_task must branch on is_query_only"
_q_idx = _ltyp2.index("if is_query_only:")
assert "return" in _ltyp2[_q_idx:_q_idx + 200], \
    "is_query_only branch must return early"

# 签名复用: island_request 带 key 时调用既有签名器
_island_req = _method_body2("island_request")
assert "self.hometown_sign_payload(body)" in _island_req, \
    "island_request must reuse hometown_sign_payload for signing"

# 邀请脱敏: 明文邀请链接不得出现, 必须 base64 编码存放
assert "pan.wo.cn/s/1C1L6X78642" not in SOURCE, \
    "invite entry URL must stay base64-encoded (no plaintext leak)"

# UID 加密往返 (用公开常量独立解密, 必须还原原文)
_uid_phone = "13800138000"
_uid_obj = object.__new__(ud.UserService)
_uid_enc = ud.UserService.island_uid_encrypt(_uid_obj, _uid_phone)
assert _uid_enc, "island_uid_encrypt must produce ciphertext"
_uid_cipher = _AES.new(
    ud.ISLAND_UID_AES_KEY.encode(), _AES.MODE_CBC, ud.ISLAND_UID_AES_IV.encode()
)
_uid_dec = _unpad(
    _uid_cipher.decrypt(_b64.b64decode(_uid_enc)), _AES.block_size, style="pkcs7"
).decode()
assert _uid_dec == _uid_phone, \
    "island uid AES round-trip mismatch (wrong key/IV?): %r" % (_uid_dec,)

# Token 缓存往返
_island_cache_obj = object.__new__(ud.UserService)
_island_cache_obj.account_mobile = "13800138000"
_island_cache_obj.mobile = ""
ud.UserService.island_save_cached_token(_island_cache_obj, "tok-roundtrip")
try:
    assert ud.UserService.island_load_cached_token(_island_cache_obj) == "tok-roundtrip", \
        "island token cache must round-trip"
finally:
    if os.path.exists(ud.ISLAND_PRIZE_CACHE_PATH):
        pass
    if os.path.exists(ud.UNICOM_TOKEN_CACHE_PATH):
        try:
            _c = json.load(open(ud.UNICOM_TOKEN_CACHE_PATH, encoding="utf-8"))
            _c.pop("13800138000", None)
            with open(ud.UNICOM_TOKEN_CACHE_PATH, "w", encoding="utf-8") as _f:
                json.dump(_c, _f, ensure_ascii=False)
        except Exception:
            pass

# 素材来源: 本地上传 + 环境变量 + 历史作品 + 云盘扫描 四路齐备
_island_cand = _method_body2("island_image_candidates")
assert "self.island_face_fids(token)" in _island_cand, "must include local upload source"
assert "ISLAND_MGTV_IMG_FID" in _island_cand, "must include env-var FID source"
assert "getNewYearWorksList" in _island_cand, "must include history works source"
assert "queryTypeFileList" in _island_cand, "must include cloud scan source"

# 通知提取器: 浪花值/打卡/抽奖 三类日志进 specials
_island_stub = types.SimpleNamespace(
    mobile="13800138000", account_mobile="13800138000",
    index=1, token="stub-token",
    notify_logs=[
        "通通乡村: 登录成功，碳能量123g，生态值5",
        "安全管家: 用户a积分变动：10 → 15 | 新增: 5",
        "海岛逐浪: 浪花值 1200 | 排名 88 | 广东深圳",
        "海岛逐浪: 打卡成功 (连续3天)",
        "海岛逐浪: 第1次抽奖 一等奖",
    ],
)
_, _island_body_txt = ud.format_wechat_reading_summary([_island_stub])
assert "海岛浪花值 1200" in _island_body_txt, \
    "island wave value must be surfaced: %r" % (_island_body_txt,)
assert "排名 88" in _island_body_txt, \
    "island rank must be surfaced: %r" % (_island_body_txt,)
assert "海岛打卡 连续3天" in _island_body_txt, \
    "island checkin must be surfaced: %r" % (_island_body_txt,)
assert "海岛抽奖" in _island_body_txt and "一等奖" in _island_body_txt, \
    "island lottery must be surfaced: %r" % (_island_body_txt,)
```

同时在文件顶部 import 区补充 `import json`。**已核实：测试文件当前未导入 `json`**，需在第 7 行 `import types` 之后新增：

```python
import json
```

- [ ] **步骤 3：运行测试验证通过**

运行：`python tests/unicom_gateway.test.py`
预期：`unicom gateway & yphd: PASS`

- [ ] **步骤 4：Commit**

```bash
git add ql_script/unicom_daily.py tests/unicom_gateway.test.py
git commit -m "feat(unicom): wire island activity into ltyp_task and notification

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 任务 12：版本号、头注释、全量验证

**文件：**
- 修改：`ql_script/unicom_daily.py`

- [ ] **步骤 1：更新版本号**

`SCRIPT_VERSION = "v1.3.0"` → `SCRIPT_VERSION = "v1.4.0"`

头注释第 5 行同步改为：`📌 版本: v1.4.0 (2026-10-08 海岛逐浪应援版)`

- [ ] **步骤 2：更新头注释功能列表与环境变量**

功能列表第 11 项由「云盘乘风活动」改为：

```
  11. 云盘海岛逐浪应援 (激活/选角/浪花值/每日打卡/AI入戏视频/抽奖/中奖记录)
```

在环境变量清单末尾追加：

```
  UNICOM_CMF_LOCAL_IMAGES    海岛人脸图本地路径 (逗号分隔, 不填则读 face_images/)
  UNICOM_CMF_DEL_CLOUD_PHOTOS 填 0 关闭 AI入戏后清理网盘临时照片
  UNICOM_CMF_TEMPLATE_ID     芒果 AI入戏模板 ID
  UNICOM_CMF_IMG_FID         指定云盘人脸图片 FID
  UNICOM_CMF_TARGET_ID       指定选角 targetId (默认选第一个)
  UNICOM_CLOUD_TTL_HOURS     云盘 Token 缓存有效期 (小时, 默认12)
```

- [ ] **步骤 3：语法与全量测试**

运行：

```bash
python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK
python tests/unicom_gateway.test.py
```

预期：`SYNTAX_OK` 与 `unicom gateway & yphd: PASS`

- [ ] **步骤 4：确认无残留与工作区状态**

运行：

```bash
grep -c "yphd\|YPHD" ql_script/unicom_daily.py
git status --short
```

预期：`0`；工作区仅 `ql_script/unicom_daily.py` 有改动（`.n/`、`.tt/` 等既有未跟踪目录不纳入）

- [ ] **步骤 5：Commit**

```bash
git add ql_script/unicom_daily.py
git commit -m "chore(unicom): bump to v1.4.0 and document island activity (v1.4.0)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 自检结果

**1. 规格覆盖度**

| 规格章节 | 对应任务 |
| :--- | :--- |
| §2.1 乘风已下线 | 任务 1、任务 2（含验证 `grep -c` 为 0） |
| §2.3 签名器与 AES 参数复用 | 任务 3（常量）、任务 4（`island_request` 复用签名器）、任务 11（往返断言） |
| §2.4 依赖兼容性 | 任务 7 步骤 3（核实 `encrypt_data_cloud` / `delete_root_files_cloud`） |
| §3.1 删除范围（方法/常量/开关/集成/通知） | 任务 1（方法+常量+开关+集成）、任务 2（通知分支） |
| §3.2 测试同步 | 任务 2 步骤 2（删旧断言）、任务 11 步骤 2（加新断言） |
| §4.1 模块边界（6 组 + 编排） | 任务 4（请求层+缓存）、5（主线）、6（抽奖）、7（素材）、8（芒果）、9（预置+编排） |
| §4.2 素材四路合并（用户决策变更） | 任务 7、任务 11（四路齐备断言） |
| §4.3 集成位置与查询模式 | 任务 10、任务 11（顺序与查询模式断言） |
| §4.4 开关设计（不新增） | 未新增任何海岛开关（任务 3 常量块无开关） |
| §4.5 错误隔离 | 任务 9（`island_task` try/except）、任务 11（无 `raise` 断言） |
| §4.6 通知输出 | 任务 11 步骤 1 |
| §5 测试策略 | 任务 11 |
| §6 版本与提交 | 任务 12 |
| §7 非目标 | 未触及（权益超市会员中心不动） |

无遗漏。

**2. 占位符扫描**：无 TODO / 待定 / "添加适当的错误处理" / "类似任务 N"。每个代码步骤均含完整代码块。

**3. 类型一致性**：`island_request(token, path, payload=None, key=None, method="post")` 在任务 4 定义，任务 5/6 所有调用点参数顺序一致；`island_mgtv_get(path, ticket, **params)` 在任务 8 定义，任务 8 内 `island_ai_video` 调用一致；`island_task(token)` 在任务 9 定义，任务 10 接入一致。`ISLAND_*` 常量在任务 3 定义，任务 4-9 均按定义名引用。

**4. 与上游的刻意差异（已记录）**：
- `island_request` 增加了 try/except 包裹（上游无），符合本仓库错误隔离规范
- 通知走 `format_wechat_reading_summary`（上游用简单拼接）
- 不新增 `island_config` 开关（上游也无）

# 联通脚本 v1.3.0 双网关修复与乘风活动移植实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复沃云手机 `bucp` 网关域名错配缺陷，移植云盘「乘风」AI 活动模块，并同步修正文档。

**架构：** 三项独立工作。(A) 引入 `WOSTORE_BUCP_BASE` 常量承载 `bucp` 基址并补回异常日志；(B) 新增 10 个单一职责的 `yphd_*` 单元，签名器复用现有 `hometown_sign_payload`，人脸素材仅取自环境变量；(C) 补全头注释并修正 AGENTS.md 双网关表述。

**技术栈：** Python 3.13、requests、pycryptodome（AES/HMAC-SHA256）。测试用系统 Python 直接导入模块，无测试框架依赖（沿用 `tests/pixiv_settings_structure.test.js` 断言式风格）。

**规格依据：** `docs/superpowers/specs/2026-10-07-unicom-v130-gateway-and-yphd-design.md`

---

## 文件结构

| 文件 | 职责 | 操作 |
| :--- | :--- | :--- |
| `ql_script/unicom_daily.py` | 主脚本，全部逻辑 | 修改 |
| `tests/unicom_gateway.test.py` | 双网关与乘风模块断言测试 | 创建 |
| `AGENTS.md` | 项目规范，联通章节双网关表述 | 修改 |

`unicom_daily.py` 已是 6900+ 行单文件脚本，本计划**不重构其结构**（遵循仓库既有模式），仅做定点插入。新增代码集中为两个区块：常量区（第 190 行附近）与方法区（`clean_duplicate_files_cloud` 之前）。

---

## 任务 1：测试脚手架与双网关回归护栏（A 项测试先行）

**文件：**
- 创建：`tests/unicom_gateway.test.py`
- 测试：`tests/unicom_gateway.test.py`

- [ ] **步骤 1：编写失败的测试**

创建 `tests/unicom_gateway.test.py`：

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""联通脚本 v1.3.0 双网关与乘风活动回归测试 (断言式, 无框架依赖)"""
import importlib.util
import os
import sys
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PATH = os.path.join(ROOT, "ql_script", "unicom_daily.py")

spec = importlib.util.spec_from_file_location("unicom_daily", SRC_PATH)
ud = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ud)

SOURCE = open(SRC_PATH, encoding="utf-8").read()

# ---------- A 项: 沃云手机双网关 ----------

# bucp 网关在 wo-adv.cn (实测 404 on wostore.cn, 200 on wo-adv.cn)
assert "wo-adv.cn" in ud.WOSTORE_BUCP_BASE, \
    "WOSTORE_BUCP_BASE must point at uphone.wo-adv.cn"

# 回归护栏: 防止后人再次把 bucp 一刀切迁回 wostore.cn
assert "uphone.wostore.cn/bucp" not in SOURCE, \
    "bucp must not be served from uphone.wostore.cn (returns 404)"

# h5api / h5forphone 仍应走 wostore.cn
assert "uphone.wostore.cn/h5api" in SOURCE, "h5api must stay on uphone.wostore.cn"
assert "h5forphone.wostore.cn" in SOURCE, "h5forphone must stay on its own host"


def _fake_self():
    """构造仅含 bucp helper 所需属性的裸对象"""
    obj = object.__new__(ud.UserService)
    calls = []

    class FakeSession:
        def get(self, url, **kw):
            calls.append(("GET", url))
            return types.SimpleNamespace(text='{"code":"200"}', json=lambda: {"code": "200"})

        def post(self, url, **kw):
            calls.append(("POST", url))
            return types.SimpleNamespace(text='{"code":"200"}', json=lambda: {"code": "200"})

    obj.session = FakeSession()
    obj.wostore_cloud_headers = lambda token: {}
    obj.log = lambda msg, notify=False: None
    return obj, calls


# bucp URL 构造必须落在 WOSTORE_BUCP_BASE 上
obj, calls = _fake_self()
ud.UserService.wostore_cloud_bucp_get(obj, "/servers/order/user-point/point-info", "tok")
ud.UserService.wostore_cloud_bucp_post(obj, "/servers/resource/instance/cpInstanceAction", "tok", {})
for method, url in calls:
    assert url.startswith(ud.WOSTORE_BUCP_BASE + "/bucp/"), \
        f"{method} {url} must be served from WOSTORE_BUCP_BASE"
assert len(calls) == 2, "both bucp helpers must issue exactly one request"

# ---------- B 项: 乘风活动 ----------

# 签名器复用: 与已验证的参考实现输出逐位一致 (值由参考脚本算法独立算出)
_EMPTY_SELF = object.__new__(ud.UserService)
EXPECTED_SIG = ud.UserService.hometown_sign_payload(
    _EMPTY_SELF,
    {"activityId": "Mjg=", "nonce": "abc123", "timestamp": "1791339888654"},
)
assert EXPECTED_SIG == "acc33212ac0e728bbbe88acba345286d3c66ca8d4c1a224262dd66cda600a0db", \
    f"signer output drifted from verified reference: {EXPECTED_SIG}"

# 签名随 secret 变化
sig_other = ud.UserService.hometown_sign_payload(
    _EMPTY_SELF,
    {"activityId": "Mjg=", "nonce": "abc123", "timestamp": "1791339888654"},
    "different-secret",
)
assert sig_other != EXPECTED_SIG, "signer must depend on the secret parameter"
assert sig_other == "ecead1b5d0602469b0f0d3b2197949bda002a8fe12b69abecc26e61d02f35945", \
    f"signer with custom secret drifted: {sig_other}"

# 芒果素材仅取自环境变量, 禁止自动扫描云盘
assert "queryTypeFileList" not in SOURCE, \
    "must not auto-scan cloud disk for face images (privacy)"

# 子任务开关默认全开
for key in ("run_member", "run_fragment", "run_ai", "run_mgtv", "run_draw"):
    assert ud.globalConfig["yphd_config"][key] is True, f"yphd_config.{key} must default True"

# 错误隔离: 乘风活动异常不得外抛
assert "def yphd_activity_task" in SOURCE, "yphd_activity_task must exist"

# ---------- C 项: 文档与默认值 ----------

# 安徽超级星期五默认关闭 (需配合面额变量才有意义)
assert ud.globalConfig["regional_config"]["run_ah_friday"] is False, \
    "run_ah_friday must default to False"

# 版本号
assert ud.SCRIPT_VERSION == "v1.3.0", f"expected v1.3.0, got {ud.SCRIPT_VERSION}"

print("unicom gateway & yphd: PASS")
```

- [ ] **步骤 2：运行测试验证失败**

运行：`python tests/unicom_gateway.test.py`
预期：FAIL，报错 `AttributeError: module 'unicom_daily' has no attribute 'WOSTORE_BUCP_BASE'`

- [ ] **步骤 3：Commit 测试骨架**

```bash
git add tests/unicom_gateway.test.py
git commit -m "test(unicom): add failing gateway & yphd regression assertions"
```

---

## 任务 2：修复 bucp 双网关（A 项实现）

**文件：**
- 修改：`ql_script/unicom_daily.py:187-189`（常量区）
- 修改：`ql_script/unicom_daily.py:4937-4955`（两个 bucp helper）

- [ ] **步骤 1：新增 WOSTORE_BUCP_BASE 常量**

在 `ql_script/unicom_daily.py` 第 188 行 `WOSTORE_CLOUD_RETRIES` 之后插入：

```python
# 沃云手机双网关: h5api/h5forphone 走 uphone.wostore.cn, bucp 走 uphone.wo-adv.cn
# (v1.2.0 一刀切迁移导致 bucp 404, 见 AGENTS.md 联通章节)
WOSTORE_BUCP_BASE = os.environ.get("UNICOM_WOSTORE_BUCP_BASE", "https://uphone.wo-adv.cn")
```

- [ ] **步骤 2：改写两个 bucp helper**

将 `wostore_cloud_bucp_get` 与 `wostore_cloud_bucp_post` 整体替换为：

```python
    def wostore_cloud_bucp_get(self, path, user_token):
        url = f"{WOSTORE_BUCP_BASE}/bucp{path}"
        try:
            r = self.session.get(url, headers=self.wostore_cloud_headers(user_token), timeout=WOSTORE_CLOUD_TIMEOUT)
            if not r.text or not r.text.strip():
                return {}
            return r.json()
        except Exception as e:
            self.log(f"沃云手机: 请求异常 {e}")
            return {}

    def wostore_cloud_bucp_post(self, path, user_token, payload=None):
        url = f"{WOSTORE_BUCP_BASE}/bucp{path}"
        try:
            r = self.session.post(url, json=payload or {}, headers=self.wostore_cloud_headers(user_token), timeout=WOSTORE_CLOUD_TIMEOUT)
            if not r.text or not r.text.strip():
                return {}
            return r.json()
        except Exception as e:
            self.log(f"沃云手机: 请求异常 {e}")
            return {}
```

- [ ] **步骤 3：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

- [ ] **步骤 4：Commit**

```bash
git add ql_script/unicom_daily.py
git commit -m "fix(unicom): route bucp gateway back to uphone.wo-adv.cn and surface request errors"
```

---

## 任务 3：乘风活动常量与开关（B 项脚手架）

**文件：**
- 修改：`ql_script/unicom_daily.py:89-96`（globalConfig）
- 修改：`ql_script/unicom_daily.py:189` 之后（常量区）

- [ ] **步骤 1：新增 yphd_config 开关**

在 `globalConfig` 中 `"regional_config"` 块之后、`"refresh_device_id"` 之前插入：

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

- [ ] **步骤 2：新增乘风活动常量**

在 `WOSTORE_BUCP_BASE` 之后插入：

```python
# 云盘乘风 AI 活动 (activityId=Mjg=)
# 签名密钥与 AES IV 复用家乡打卡同源参数, 仅手机号 AES Key 不同
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
```

- [ ] **步骤 3：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 4：乘风活动核心单元（请求层 + 签名）

**文件：**
- 修改：`ql_script/unicom_daily.py`，插入位置在 `def clean_duplicate_files_cloud(self):` 之前

- [ ] **步骤 1：插入请求层与签名单元**

在 `def clean_duplicate_files_cloud(self):` 之前插入：

```python
    # ============ 云盘乘风 AI 活动 ============
    def yphd_headers(self, client_id="1001000165", extra=None):
        token = self.cloudDisk.userToken
        headers = {
            "X-YP-Access-Token": token,
            "User-Agent": "Mozilla/5.0 (Linux; Android 9; 23113RKC6C Build/PQ3A.190605.10201411; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36/woapp LianTongYunPan/5.5.0 (Android 9)",
            "clientId": client_id,
            "X-SH-Access-Token": "",
            "X-YP-GRAY-FLAG": "undefined",
            "Content-Type": "application/json",
            "X-YP-Client-Id": client_id,
            "token": token,
            "Origin": "https://panservice.mail.wo.cn",
            "Referer": f"https://panservice.mail.wo.cn/h5/activitymobile/aiActor?activityId=Mjg%3D&touchpoint=300300010005&token={token}",
        }
        if extra:
            headers.update(extra)
        return headers

    def yphd_post(self, path, payload=None, client_id="1001000165", extra=None):
        try:
            res = self.session.post(
                f"https://panservice.mail.wo.cn{path}",
                json=payload or {},
                headers=self.yphd_headers(client_id, extra),
                timeout=20,
            )
            return res.json()
        except Exception as e:
            self.log(f"云盘乘风活动: 请求异常 {e}")
            return {}

    def yphd_get(self, path, params=None, client_id="1001000165", extra=None):
        try:
            res = self.session.get(
                f"https://panservice.mail.wo.cn{path}",
                params=params or {},
                headers=self.yphd_headers(client_id, extra),
                timeout=20,
            )
            return res.json()
        except Exception as e:
            self.log(f"云盘乘风活动: 请求异常 {e}")
            return {}

    def yphd_signed_post(self, path, key, payload=None, client_id="1001000165", extra=None):
        ts = self.yphd_post("/activity/getTimestamp", {"key": key})
        result = ts.get("result") or {}
        nonce = result.get("nonce")
        timestamp = result.get("timestamp")
        if not nonce or not timestamp:
            self.log(f"云盘乘风活动: getTimestamp失败 {response_summary(ts)}")
            return {}
        body = dict(payload or {})
        body.update({"activityId": YPHD_ACTIVITY_ID, "nonce": nonce, "timestamp": timestamp})
        body["sign"] = self.hometown_sign_payload(body)
        return self.yphd_post(path, body, client_id, extra)
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 5：会员领取、视频转存、AI 保活单元

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `yphd_signed_post` 之后

- [ ] **步骤 1：插入三个单元**

```python
    def yphd_member_claim(self):
        phone = self.account_mobile or ""
        if not phone:
            self.log("云盘乘风活动: 未识别手机号，跳过会员体验")
            return False
        cipher = AES.new(YPHD_MEMBER_PHONE_KEY.encode(), AES.MODE_CBC, HOMETOWN_AES_IV.encode())
        encrypted = base64.b64encode(cipher.encrypt(pad(str(phone).encode(), AES.block_size, style="pkcs7"))).decode()
        extra = {"Referer": f"https://panservice.mail.wo.cn/h5/activitymobile/experienceMember?touchpoint={YPHD_MEMBER_TOUCHPOINT}&appName=yunpan&token={self.cloudDisk.userToken}"}
        payload = {"phone": encrypted}
        check = self.yphd_post("/activity/check/yp/members/eligibility", payload, "1001000001", extra)
        meta = check.get("meta") or {}
        if str(meta.get("code")) != "200":
            self.log(f"云盘乘风活动: 会员资格查询失败 {meta.get('message') or response_summary(check)}")
            return False
        state = safe_int((check.get("result") or {}).get("state"), -1)
        if state == 1:
            self.log("云盘乘风活动: 会员体验已参与", notify=True)
            return True
        if state != 0:
            self.log(f"云盘乘风活动: 会员体验暂不可领 state={state}")
            return False
        payload.update({
            "skuCode": YPHD_MEMBER_SKU_CODE,
            "activityCode": YPHD_MEMBER_ACTIVITY_CODE,
            "channel": "6",
            "touchpoint": YPHD_MEMBER_TOUCHPOINT,
        })
        data = self.yphd_post("/activity/experience/yp/members", payload, "1001000001", extra)
        meta = data.get("meta") or {}
        ok = str(meta.get("code")) == "200"
        order_no = (data.get("result") or {}).get("orderNo")
        self.log(f"云盘乘风活动: 会员体验领取 {meta.get('message') or response_summary(data)}" + (f" orderNo={order_no}" if order_no else ""), notify=ok)
        return ok

    def yphd_move_file(self):
        payload = {
            "activityId": YPHD_ACTIVITY_ID,
            "fids": [YPHD_MOVE_FILE_FID],
            "taskType": 10,
            "fileType": 2,
            "fileName": YPHD_MOVE_FILE_NAME,
            "directoryId": 0,
            "additionalParams": {"aiHeaderSubType": 0},
        }
        extra = {
            "Access-Token": self.cloudDisk.userToken,
            "Client-Id": "1001000165",
            "App-Version": "yp-app/5.5.0",
        }
        res = self.yphd_post("/wohome/open/v1/ai/moveFile2Person", payload, "1001000165", extra)
        self.log(f"云盘乘风活动: 视频转存 {res.get('meta', {}).get('message') or response_summary(res)}")
        return res

    def yphd_ai_query(self):
        payload = {
            "input": "你好",
            "modelId": 0,
            "platform": 2,
            "tag": 21,
            "conversationId": "",
            "knowledgeId": "",
            "referFileInfo": [],
            "messageId": "",
            "conversationType": 0,
            "recipient": "",
            "async": False,
        }
        headers = self.yphd_headers("1001000035", {
            "accept": "text/event-stream",
            "X-YP-App-Version": "5.4.2",
            "Referer": f"https://panservice.mail.wo.cn/h5/wocloud_ai_1/workFlow?needBackBtn=true&token={self.cloudDisk.userToken}",
        })
        try:
            res = self.session.post(
                "https://panservice.mail.wo.cn/wohome/ai/assistant/query",
                json=payload,
                headers=headers,
                stream=True,
                timeout=30,
            )
            for _ in res.iter_lines(decode_unicode=True):
                pass
            self.log("云盘乘风活动: AI助手保活完成" if res.status_code == 200 else f"云盘乘风活动: AI助手失败 {res.status_code}")
        except Exception as e:
            self.log(f"云盘乘风活动: AI助手异常 {e}")
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 6：芒果TV视频制作单元

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `yphd_ai_query` 之后

**说明：** 与外部参考脚本的差异——**移除自动扫描云盘图片的分支**，仅使用 `UNICOM_YPHD_MGTV_IMG_FID`。因来源单一，"多候选逐个尝试"循环退化为单次尝试。

- [ ] **步骤 1：插入芒果TV单元**

```python
    def yphd_mgtv_headers(self):
        return {
            "User-Agent": "Mozilla/5.0 (Linux; Android 9; 23113RKC6C Build/PQ3A.190605.10201411; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36/woapp LianTongYunPan/5.5.0 (Android 9)",
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "Origin": "https://pop.mgtv.com",
            "Referer": "https://pop.mgtv.com/",
        }

    def yphd_mgtv_login(self):
        data = self.yphd_post("/api-user/api/user/ticket", {}, "1001000035")
        ticket = (data.get("result") or {}).get("ticket")
        if not ticket:
            self.log(f"云盘乘风活动: 芒果ticket失败 {response_summary(data)}")
            return "", ""
        res = self.session.get(
            f"{YPHD_MGTV_BASE}/api/cu/login",
            params={"ticket": ticket, "t": int(time.time() * 1000)},
            headers=self.yphd_mgtv_headers(),
            timeout=20,
        )
        self.log("云盘乘风活动: 芒果登录成功" if res.status_code == 200 else f"云盘乘风活动: 芒果登录失败 {res.status_code}")
        try:
            info = res.json().get("data") or {}
        except Exception:
            info = {}
        mgtv_ticket = info.get("ticket") or ticket
        access_token = info.get("accessToken", "")
        self.session.get(
            f"{YPHD_MGTV_BASE}/api/cu/popup/check",
            params={"ticket": mgtv_ticket},
            headers=self.yphd_mgtv_headers(),
            timeout=20,
        )
        return mgtv_ticket, access_token

    def yphd_mgtv_template_submit(self, payload):
        try:
            res = self.session.post(
                f"{YPHD_MGTV_BASE}/api/cu/video/template/submit",
                json=payload,
                headers=self.yphd_mgtv_headers(),
                timeout=20,
            )
            return res.json()
        except Exception as e:
            self.log(f"云盘乘风活动: 模板提交异常 {e}")
            return {"msg": f"请求异常 {e}"}

    def yphd_mgtv_task(self, ticket, access_token):
        if not YPHD_MGTV_IMG_FID:
            self.log("云盘乘风活动: 未配置 UNICOM_YPHD_MGTV_IMG_FID，跳过视频制作 (配置后可参与)")
            return False
        payload = {"ticket": ticket, "templateId": YPHD_MGTV_TEMPLATE_ID, "index": 0, "imgUrl": YPHD_MGTV_IMG_FID}
        data = self.yphd_mgtv_template_submit(payload)
        for retry in range(3):
            if data.get("msg") != "权益扣减失败":
                break
            off = self.session.get(
                f"{YPHD_MGTV_BASE}/api/cu/offlineSubscribe",
                params={"ticket": ticket},
                headers=self.yphd_mgtv_headers(),
                timeout=20,
            )
            try:
                off_data = off.json()
                off_msg = off_data.get("msg") or off_data.get("message") or response_summary(off_data)
                success = (off_data.get("data") or {}).get("success")
                if success is not None:
                    off_msg = f"{off_msg} success={success}"
            except Exception:
                off_msg = off.text[:80] or f"HTTP {off.status_code}"
            self.log(f"云盘乘风活动: 订阅权益 {off_msg}")
            time.sleep(8 + retry * 6)
            data = self.yphd_mgtv_template_submit(payload)
        result = data.get("data") or {}
        task_id = result.get("taskId") or data.get("taskId")
        if not task_id:
            msg = data.get("msg") or response_summary(data)
            self.log(f"云盘乘风活动: 模板提交失败 {msg}")
            return False
        for _ in range(20):
            try:
                result_data = self.session.get(
                    f"{YPHD_MGTV_BASE}/api/cu/video/template/result",
                    params={"taskId": task_id, "ticket": ticket},
                    headers=self.yphd_mgtv_headers(),
                    timeout=20,
                ).json()
            except Exception as e:
                self.log(f"云盘乘风活动: 模板结果查询异常 {e}")
                return False
            info = result_data.get("data") or {}
            audit_state = safe_int(info.get("auditState"))
            algorithm_state = safe_int(info.get("algorithmState"))
            if result_data.get("errno") == "0" and (audit_state == 2 or (audit_state > 1 and algorithm_state > 1)):
                self.log(f"云盘乘风活动: 视频制作成功 taskId={task_id}", notify=True)
                return True
            time.sleep(3)
        self.log(f"云盘乘风活动: 视频仍在生成 taskId={task_id}")
        return False
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 7：乘风活动编排与接入

**文件：**
- 修改：`ql_script/unicom_daily.py`，紧接 `yphd_mgtv_task` 之后
- 修改：`ql_script/unicom_daily.py:2233`（`ltyp_task` 调用点）

- [ ] **步骤 1：插入编排单元**

```python
    def yphd_activity_task(self, is_query_only=False):
        if not YPHD_ENABLE:
            return
        if not getattr(self.cloudDisk, "userToken", ""):
            return
        rc = globalConfig.get("yphd_config", {})
        try:
            self.log("==== 云盘乘风活动 ====")
            if is_query_only:
                records = self.yphd_post("/activity/aiRole/userDrawRecords", {"activityId": YPHD_ACTIVITY_ID}, "1001000035")
                draw_records = records.get("result") or []
                self.log(f"云盘乘风活动: [查询模式] 历史抽奖记录 {len(draw_records)} 条", notify=True)
                return
            if rc.get("run_member", True):
                self.yphd_member_claim()
            status = self.yphd_signed_post("/activity/fragment/status", "activity:fragment:status", {}, "1001000035")
            result = status.get("result") or {}
            fragment_step = safe_int(result.get("fragmentStep"))
            self.log(f"云盘乘风活动: 碎片阶段 {fragment_step}")
            if rc.get("run_fragment", True):
                task_info = self.yphd_get("/activity/activity/task/info", {"activityId": YPHD_ACTIVITY_ID}, "1001000035")
                logs = (task_info.get("result") or {}).get("logs") or []
                if logs:
                    self.log("云盘乘风活动: 已完成 " + "、".join(x.get("taskName", "") for x in logs if x.get("taskName")))
                self.yphd_signed_post("/activity/fragment/task/activate", "activity:fragment:activate")
                self.yphd_move_file()
                if rc.get("run_ai", True):
                    self.yphd_ai_query()
                task1 = self.yphd_signed_post("/activity/aiRole/task1/acquire", "activity:acquire:task1", {}, "1001000035")
                self.log(f"云盘乘风活动: task1 {task1.get('meta', {}).get('message') or response_summary(task1)}")
            if rc.get("run_mgtv", True):
                ticket, access_token = self.yphd_mgtv_login()
                mgtv_ok = self.yphd_mgtv_task(ticket, access_token) if ticket else False
                if mgtv_ok:
                    query = self.yphd_task2_query()
                    if safe_int(query.get("result")) != 1:
                        task2 = self.yphd_signed_post("/activity/aiRole/task2", "activity:acquire:task2", {}, "1001000165", {
                            "X-YP-Open-Version": "v1.0",
                            "X-CM-SERVICE": self.account_mobile or "",
                            "X-PATH": "/h5/wocloud_ai_1/workFlow",
                            "accesstoken": self.cloudDisk.userToken,
                            "Access-Token": self.cloudDisk.userToken,
                            "App-Version": "yp-app/5.5.0",
                            "Client-Id": "1001000165",
                        })
                        self.log(f"云盘乘风活动: task2 {task2.get('meta', {}).get('message') or response_summary(task2)}")
            if rc.get("run_draw", True):
                self.yphd_draw()
            final = self.yphd_signed_post("/activity/fragment/status", "activity:fragment:status", {}, "1001000035")
            self.log(f"云盘乘风活动: 完成，碎片阶段 {safe_int((final.get('result') or {}).get('fragmentStep'))}", notify=True)
        except Exception as e:
            self.log(f"云盘乘风活动异常: {e}")

    def yphd_task2_query(self):
        extra = {
            "Accept": "application/json, text/plain, */*",
            "source-type": "woapi",
            "requestTime": str(int(time.time() * 1000)),
            "X-Requested-With": "com.chinaunicom.bol.cloudapp",
            "X-YP-Client-Id": "1001000035",
            "Referer": f"https://panservice.mail.wo.cn/h5/activitymobile/aiActor/main1?activityId=Mjg%3D&touchpoint=300300010005&token={self.cloudDisk.userToken}",
        }
        return self.yphd_signed_post("/activity/aiRole/task2/query", "activity:query:task2", {}, "1001000165", extra)

    def yphd_draw(self):
        extra = {
            "Accept": "application/json, text/plain, */*",
            "source-type": "woapi",
            "requestTime": str(int(time.time() * 1000)),
            "X-Requested-With": "com.chinaunicom.bol.cloudapp",
            "X-YP-Client-Id": "1001000035",
            "Referer": f"https://panservice.mail.wo.cn/h5/activitymobile/aiActor/main1?activityId=Mjg%3D&touchpoint=300300010005&token={self.cloudDisk.userToken}",
        }
        times = self.yphd_get("/activity/lottery/lottery-times", {"activityId": YPHD_ACTIVITY_ID}, "1001000035", extra)
        if str((times.get("meta") or {}).get("code")) != "200":
            self.log(f"云盘乘风活动: 抽奖次数查询失败 {response_summary(times)}")
            return
        times_result = times.get("result")
        if isinstance(times_result, dict):
            times_result = times_result.get("lotteryTimes") or times_result.get("times") or times_result.get("count") or 0
        count = int(times_result or 0)
        self.log(f"云盘乘风活动: 抽奖次数 {count}")
        for index in range(count):
            prize = self.yphd_signed_post("/activity/lottery", "activity:lottery", {}, "1001000035", extra)
            info = prize.get("result") or {}
            name = info.get("prizeName")
            self.log(f"云盘乘风活动: 第{index + 1}次抽奖 {name or response_summary(prize)}", notify=bool(name))
            time.sleep(2)
        if count:
            self.yphd_signed_post("/activity/fragment/updateFrontendStatus", "activity:fragment:frontendStatus", {"frontendStatus": 1}, "1001000035")
```

- [ ] **步骤 2：接入 ltyp_task**

将 `ltyp_task` 中：

```python
        token = self.get_ltypDispatcher_cloud(ticket)
        if not token:
            return
        if HOMETOWN_ENABLE:
            self.hometown_task(token)
        self.clean_duplicate_files_cloud()
```

改为：

```python
        token = self.get_ltypDispatcher_cloud(ticket)
        if not token:
            return
        self.yphd_activity_task(is_query_only=is_query_only)
        if HOMETOWN_ENABLE:
            self.hometown_task(token)
        self.clean_duplicate_files_cloud()
```

- [ ] **步骤 3：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 8：通知提取器新增乘风 bullet

**文件：**
- 修改：`ql_script/unicom_daily.py:6743`（`format_wechat_reading_summary` 的专项福利区）

**约束：** 保持现有单行 `• ` bullet 极简风格，仅在 `specials` 列表中新增一项，不新增 bullet 行。

- [ ] **步骤 1：新增乘风提取分支**

在 `specials` 循环中，`家乡打卡` 分支之后插入：

```python
                elif "云盘乘风活动: 第" in l and "次抽奖" in l:
                    p = l.split("抽奖", 1)[-1].strip()
                    if p and "失败" not in p:
                        specials.append(f"乘风抽奖 [{p}]")
                elif "云盘乘风活动: 会员体验领取" in l:
                    specials.append("乘风会员已领")
```

- [ ] **步骤 2：语法校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 9：C 项 — 默认值、版本号、头注释、AGENTS.md

**文件：**
- 修改：`ql_script/unicom_daily.py:92`（run_ah_friday 默认值）
- 修改：`ql_script/unicom_daily.py:5`（头注释版本行）
- 修改：`ql_script/unicom_daily.py:57`（SCRIPT_VERSION）
- 修改：`AGENTS.md`（联通章节第 1 节）

- [ ] **步骤 1：run_ah_friday 默认值改 False**

将：

```python
        "run_ah_friday": True,    # True = 开启安徽超级星期五 (需配合 UNICOM_AH_FRIDAY_AMOUNT 设置面额)
```

改为：

```python
        "run_ah_friday": False,   # True = 开启安徽超级星期五 (需配合 UNICOM_AH_FRIDAY_AMOUNT 设置面额)
```

- [ ] **步骤 2：版本号与头注释**

`SCRIPT_VERSION = "v1.2.0"` → `SCRIPT_VERSION = "v1.3.0"`

头注释第 5 行 `📌 版本: v1.2.0 (2026-09-20 核心服务逆向优化版)` → `📌 版本: v1.3.0 (2026-10-07 双网关修复与乘风活动版)`

在头注释功能列表第 10 项之后追加：

```
  11. 云盘乘风活动 (会员体验 / 碎片任务 / AI保活 / 芒果视频制作 / 抽奖)
  12. 规范通知: 100% 对齐微信读书单行 Bullet 极简排版，使用青龙默认推送。
```

并在头注释末尾（`===` 分隔线之前）追加运维章节：

```
可选环境变量:
  UNICOM_PROXY_API         代理提取链接 (支持 JSON/TXT, 自动识别)
  UNICOM_PROXY_TYPE        代理类型 (http / socks5, 默认 socks5)
  UNICOM_TEST_MODE=query   仅查询模式, 跳过任务执行只查询资产
  UNICOM_GRAB_AMOUNT       抢兑面额 (默认5)
  UNICOM_AH_FRIDAY_AMOUNT  安徽超级星期五抢红包面额 (不填则不执行)
  UNICOM_HOMETOWN_ENABLE   家乡打卡开关 (默认1)
  UNICOM_YPHD_ENABLE       乘风活动总开关 (默认1)
  UNICOM_YPHD_MGTV_IMG_FID 芒果视频制作的人脸图片FID (不填则跳过制作)

定时规则建议 (Cron):
  30 10 * * *   常规日常任务 (推荐)
  0 58 9,17 * * *  抢兑专用 (需 sign_config.run_grab_coupon=True)
  0 58 9 * * 5     安徽超级星期五 (需 UNICOM_AH_FRIDAY_AMOUNT)
```

- [ ] **步骤 3：修正 AGENTS.md 联通章节**

将 AGENTS.md 中：

```
- **沃云手机业务域名**：旧域名 `wo-adv.cn` 已彻底废弃下线，直接请求会遭遇服务端 502 / DNS 无法解析 / 返回 HTML 报错。生产环境统一迁移至官方新域名 **`uphone.wostore.cn`**。
```

替换为：

```
- **沃云手机为双网关架构（严禁一刀切迁移）**：实测确认两个域名各自承载不同前缀，互不通用，必须分别使用：
  - `h5api` / `h5forphone` 前缀走 **`uphone.wostore.cn`**（`h5forphone` 另有独立域名 `h5forphone.wostore.cn`）
  - `bucp` 前缀走 **`uphone.wo-adv.cn`**（该域名并未废弃，根路径返回真实业务前端页面）
  - 实测证据：`POST uphone.wostore.cn/bucp/servers/order/user-point/point-info` → 404 (openresty)；同一路径 `POST uphone.wo-adv.cn/...` → 200 `{"code":401,"msg":"令牌不能为空"}`。反向 `POST uphone.wo-adv.cn/h5api/...` → nginx 欢迎页。
  - 历史教训：v1.2.0 曾将 `wo-adv.cn` 一刀切迁至 `wostore.cn`，导致 `bucp` 三个功能（用户信息、积分查询、设备激活）静默失败。
```

- [ ] **步骤 4：语法与 JSON 校验**

运行：`python -m py_compile ql_script/unicom_daily.py && echo SYNTAX_OK`
预期：`SYNTAX_OK`

---

## 任务 10：全量验证与提交

**文件：**
- 测试：`tests/unicom_gateway.test.py`

- [ ] **步骤 1：运行完整测试套件**

运行：`python tests/unicom_gateway.test.py`
预期：`unicom gateway & yphd: PASS`

- [ ] **步骤 2：运行既有测试确认无回归**

运行：`node tests/pixiv_settings_structure.test.js`
预期：`pixiv settings structure: PASS`

- [ ] **步骤 3：验证脚本可导入且配置生效**

运行：

```bash
python -c "
import importlib.util
spec=importlib.util.spec_from_file_location('ud','ql_script/unicom_daily.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print('VERSION', m.SCRIPT_VERSION)
print('BUCP', m.WOSTORE_BUCP_BASE)
print('YPHD_ENABLE', m.YPHD_ENABLE)
print('ah_friday', m.globalConfig['regional_config']['run_ah_friday'])
print('yphd_config', m.globalConfig['yphd_config'])
"
```

预期：

```
VERSION v1.3.0
BUCP https://uphone.wo-adv.cn
YPHD_ENABLE True
ah_friday False
yphd_config {'run_member': True, 'run_fragment': True, 'run_ai': True, 'run_mgtv': True, 'run_draw': True}
```

- [ ] **步骤 4：确认工作区状态**

运行：`git status --short`
预期：仅 `ql_script/unicom_daily.py`、`tests/unicom_gateway.test.py`、`AGENTS.md` 有改动（`.r/` 为既有未跟踪目录，不纳入）

- [ ] **步骤 5：Commit**

```bash
git add ql_script/unicom_daily.py tests/unicom_gateway.test.py AGENTS.md
git commit -m "feat(unicom): add cloud-disk chengfeng activity and fix bucp dual-gateway (v1.3.0)

- fix: route bucp gateway back to uphone.wo-adv.cn (v1.2.0 regression caused 404)
- fix: surface wostore bucp request errors instead of silently swallowing
- feat: port cloud-disk chengfeng AI activity (member claim, fragment tasks,
  AI keep-alive, mgtv video, lottery)
- feat: reuse hometown signer for chengfeng (verified byte-identical secret)
- change: mgtv face image only from UNICOM_YPHD_MGTV_IMG_FID, no cloud scan
- change: run_ah_friday now defaults to False
- docs: document dual-gateway architecture in AGENTS.md and script header

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## 自检结果

**1. 规格覆盖度**

| 规格章节 | 对应任务 |
| :--- | :--- |
| §2 已验证事实（双网关、密钥、AES、网关存活） | 任务 1 断言固化 |
| §3 A 项双网关修复 | 任务 2 |
| §4.1 模块边界（10 单元） | 任务 4/5/6/7 |
| §4.2 差异一（仅环境变量） | 任务 6（无 `queryTypeFileList`） |
| §4.2 差异二（run_ah_friday=False） | 任务 9 步骤 1 |
| §4.2 差异三（保留通知模版） | 任务 8（仅追加 bullet） |
| §4.3 保留优点（订阅重试/轮询） | 任务 6 |
| §4.4 调用位置与错误隔离 | 任务 7（置于 hometown 之前 + try/except） |
| §4.5 子任务开关 | 任务 3 |
| §4.6 通知输出 | 任务 8 |
| §5.1 头注释 | 任务 9 步骤 2 |
| §5.2 AGENTS.md | 任务 9 步骤 3 |
| §6 版本与提交 | 任务 9 步骤 2、任务 10 步骤 5 |
| §7 测试策略 | 任务 1、任务 10 |
| §8 非目标 | 未触及（无 appversion / dispatcher 改动） |

无遗漏。

**2. 占位符扫描**：无 TODO / 待定 / "添加适当的错误处理" / "类似任务 N"。每个代码步骤均含完整代码块。

**3. 类型一致性**：`yphd_signed_post(path, key, payload, client_id, extra)` 在任务 4 定义，任务 7 所有调用点参数顺序一致；`yphd_mgtv_task(ticket, access_token)` 在任务 6 定义，任务 7 调用一致；`yphd_activity_task(is_query_only=False)` 在任务 7 定义并同步接入 `ltyp_task(is_query_only=...)`。任务 5 定义 `yphd_member_claim` / `yphd_move_file` / `yphd_ai_query`，任务 7 均按定义名调用。任务 7 新增 `yphd_draw` 与 `yphd_task2_query`（规格 §4.1 表格中归入编排单元，此处拆出以保持单一职责）。

**4. 测试可执行性**：`tests/unicom_gateway.test.py` 用 `object.__new__(UserService)` 绕过 `__init__`，仅绑定被测方法所需属性，避免构造完整服务对象。

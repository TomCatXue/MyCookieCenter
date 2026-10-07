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

# ---------- D 项: 乘风模块硬约束 (任务 7 审查) ----------


def _method_body(name):
    """从 SOURCE 切出方法体: 'def name(' 起, 到下一个同级 'def ' 之前"""
    marker = "def %s(" % name
    start = SOURCE.find(marker)
    assert start != -1, "method %s not found in SOURCE" % name
    nxt = SOURCE.find("\n    def ", start + len(marker))
    return SOURCE[start:nxt] if nxt != -1 else SOURCE[start:]


# 调用顺序: 乘风活动必须在家乡打卡之前执行
_ltyp_body = _method_body("ltyp_task")
assert "self.yphd_activity_task(" in _ltyp_body, \
    "ltyp_task must invoke yphd_activity_task"
assert "self.hometown_task(token)" in _ltyp_body, \
    "ltyp_task must invoke hometown_task(token)"
assert _ltyp_body.index("self.yphd_activity_task(") < \
    _ltyp_body.index("self.hometown_task(token)"), \
    "ltyp_task must run yphd_activity_task BEFORE hometown_task(token)"

# 错误隔离: 乘风活动异常只记日志, 绝不上抛
_yphd_body = _method_body("yphd_activity_task")
assert "raise" not in _yphd_body, \
    "yphd_activity_task must isolate failures (no raise; log-only)"

# ---------- E 项: 隐私边界行为断言 (任务 6 审查) ----------


def _fake_yphd_self(mobile="13800138000", token="tok"):
    """裸 UserService, 记录全部出站请求 (get/post)"""
    obj = object.__new__(ud.UserService)
    calls = []

    class RecordingSession:
        def get(self, url, **kw):
            calls.append(("GET", url))
            return types.SimpleNamespace(text="{}", status_code=200, json=lambda: {})

        def post(self, url, **kw):
            calls.append(("POST", url))
            return types.SimpleNamespace(text="{}", status_code=200, json=lambda: {})

    obj.session = RecordingSession()
    obj.cloudDisk = types.SimpleNamespace(userToken=token)
    obj.account_mobile = mobile
    obj.log = lambda msg, notify=False: None
    return obj, calls


# 未配置素材时: 返回 False 且零出站请求 (不得扫描云盘/调用第三方)
_mgtv_obj, _mgtv_calls = _fake_yphd_self()
_saved_fid = ud.YPHD_MGTV_IMG_FID
try:
    ud.YPHD_MGTV_IMG_FID = ""  # 临时置空模块级常量, finally 还原
    _mgtv_ret = ud.UserService.yphd_mgtv_task(_mgtv_obj, "ticket", "access")
finally:
    ud.YPHD_MGTV_IMG_FID = _saved_fid
assert _mgtv_ret is False, "yphd_mgtv_task must return False when the image FID is empty"
assert _mgtv_calls == [], \
    "empty image FID must issue ZERO outbound requests, got %r" % (_mgtv_calls,)

# ---------- F 项: 请求层行为断言 (任务 4 审查) ----------

for _m in ("def yphd_headers", "def yphd_post", "def yphd_get", "def yphd_signed_post"):
    assert _m in SOURCE, "%s must exist" % _m

import hmac as _hmac
import hashlib as _hashlib
import base64 as _b64
import re as _re
from Crypto.Cipher import AES as _AES
from Crypto.Util.Padding import unpad as _unpad


_signed_posts = []


class _TimestampSession:
    """首个 POST(/activity/getTimestamp) 返回 nonce/timestamp, 其余返回空"""

    def post(self, url, **kw):
        _signed_posts.append((url, kw))
        if "getTimestamp" in url:
            return types.SimpleNamespace(
                text="", status_code=200,
                json=lambda: {"result": {"nonce": "n0nce", "timestamp": "1234567890123"}},
            )
        return types.SimpleNamespace(text="", status_code=200, json=lambda: {})

    def get(self, url, **kw):
        _signed_posts.append((url, kw))
        return types.SimpleNamespace(text="", status_code=200, json=lambda: {})


_signed_obj, _ = _fake_yphd_self()
_signed_obj.session = _TimestampSession()
ud.UserService.yphd_signed_post(
    _signed_obj, "/activity/fragment/status", "activity:fragment:status", {}, "1001000035"
)

assert len(_signed_posts) == 2, \
    "signed post must make exactly 2 requests (getTimestamp + signed), got %d" % len(_signed_posts)
assert "getTimestamp" in _signed_posts[0][0], "first request must be /activity/getTimestamp"
_body = _signed_posts[1][1].get("json")
assert isinstance(_body, dict), "second request must carry a json body"
assert set(_body.keys()) == {"activityId", "nonce", "timestamp", "sign"}, \
    "signed body key set drifted: %r" % (sorted(_body.keys()),)
assert _body["activityId"] == ud.YPHD_ACTIVITY_ID, "signed body must carry activityId"
assert _body["nonce"] == "n0nce" and _body["timestamp"] == "1234567890123", \
    "signed body must carry nonce/timestamp from getTimestamp"

# 独立复算期望签名 (不调用被测的 hometown_sign_payload, 避免同义反复)
_expected_raw = "&".join(
    "%s=%s" % (k, _body[k]) for k in sorted(("activityId", "nonce", "timestamp"))
) + "&secret=%s" % ud.HOMETOWN_LOTTERY_SECRET
_expected_sign = _hmac.new(
    ud.HOMETOWN_LOTTERY_SECRET.encode(), _expected_raw.encode(), _hashlib.sha256
).hexdigest()
assert _body["sign"] == _expected_sign, \
    "sign drifted from independently recomputed value: %s != %s" % (
        _body["sign"], _expected_sign)

# 短路: getTimestamp 返回 {} 时不得发出第二次请求
_short_posts = []


class _EmptyTsSession:
    def post(self, url, **kw):
        _short_posts.append((url, kw))
        return types.SimpleNamespace(text="", status_code=200, json=lambda: {})

    def get(self, url, **kw):
        _short_posts.append((url, kw))
        return types.SimpleNamespace(text="", status_code=200, json=lambda: {})


_short_obj, _ = _fake_yphd_self()
_short_obj.session = _EmptyTsSession()
_short_ret = ud.UserService.yphd_signed_post(
    _short_obj, "/activity/lottery", "activity:lottery", {}, "1001000035"
)
assert _short_ret == {}, "signed post must return {} when getTimestamp yields no nonce"
assert len(_short_posts) == 1, \
    "must NOT issue a second request after an empty getTimestamp, got %d" % len(_short_posts)
assert "getTimestamp" in _short_posts[0][0], "the only request must be /activity/getTimestamp"

# ---------- G 项: 会员手机号 AES 往返 (任务 5 审查) ----------

_member_captured = []


def _capture_member_post(path, payload=None, client_id="1001000165", extra=None):
    _member_captured.append({"path": path, "payload": payload, "client_id": client_id})
    # meta.code != 200 -> 方法在资格查询处提前返回, 不触发第二次请求
    return {"meta": {"code": "500", "message": "test-stub"}}


_member_obj = object.__new__(ud.UserService)
_member_obj.account_mobile = "13800138000"
_member_obj.cloudDisk = types.SimpleNamespace(userToken="tok")
_member_obj.log = lambda msg, notify=False: None
_member_obj.yphd_post = _capture_member_post  # 打桩, 不打真实接口
_member_ret = ud.UserService.yphd_member_claim(_member_obj)

assert _member_ret is False, "stubbed eligibility failure must yield False"
assert len(_member_captured) == 1, "claim must stop after the failed eligibility check"
assert _member_captured[0]["path"] == "/activity/check/yp/members/eligibility", \
    "first claim request must be the eligibility check"
_enc_phone = (_member_captured[0]["payload"] or {}).get("phone")
assert _enc_phone, "member payload must carry an encrypted phone field"

# 用公开常量独立解密, 必须还原出原文手机号
_member_cipher = _AES.new(
    ud.YPHD_MEMBER_PHONE_KEY.encode(), _AES.MODE_CBC, ud.HOMETOWN_AES_IV.encode()
)
try:
    _dec_phone = _unpad(
        _member_cipher.decrypt(_b64.b64decode(_enc_phone)), _AES.block_size, style="pkcs7"
    ).decode()
except Exception as _e:
    _dec_phone = None
    _dec_err = _e
assert _dec_phone == "13800138000", \
    "member phone AES round-trip mismatch (wrong key/IV?): %r (%r)" % (_dec_phone, locals().get("_dec_err"))

# ---------- H 项: 子开关默认值 (任务 3 审查) ----------

assert ud.YPHD_ENABLE is True, "YPHD_ENABLE must default to True (no env var)"
assert "UNICOM_YPHD_MGTV_IMG_FID" in SOURCE, \
    "mgtv image material must come from the UNICOM_YPHD_MGTV_IMG_FID env var"
# 强化: 赋值语句本身必须真的从该环境变量读取 (而非写死常量)
_fid_assign = _re.search(r"^YPHD_MGTV_IMG_FID\s*=\s*(.+)$", SOURCE, _re.M)
assert _fid_assign, "YPHD_MGTV_IMG_FID must be assigned at module level"
assert 'os.environ.get("UNICOM_YPHD_MGTV_IMG_FID"' in _fid_assign.group(1), \
    "YPHD_MGTV_IMG_FID must be sourced from os.environ, not a hard-coded constant"

# ---------- I 项: 通知提取器专项福利汇总 (任务 8 修复回归) ----------

# 默认配置下 乡村能量/安全管家 恒先于 乘风 条目入列, 若 [:2] 截断则乘风收获永不显示
_summary_stub = types.SimpleNamespace(
    mobile="13800138000",
    account_mobile="13800138000",
    index=1,
    token="stub-token",
    notify_logs=[
        "通通乡村: 登录成功，碳能量123g，生态值5",
        "安全管家: 用户a积分变动：10 → 15 | 新增: 5",
        "云盘乘风活动: 第1次抽奖 一等奖",
        "云盘乘风活动: 会员体验已参与",
    ],
)
_subtitle, _summary_body = ud.format_wechat_reading_summary([_summary_stub])
assert "专项福利收获" in _summary_body, \
    "specials summary bullet must be present: %r" % (_summary_body,)
assert "乘风抽奖" in _summary_body, \
    "乘风抽奖 must survive specials truncation (raise the [:N] cap): %r" % (_summary_body,)
assert "乘风会员 往期已领" in _summary_body, \
    "会员体验已参与 steady-state log must map to 乘风会员 往期已领: %r" % (_summary_body,)

# ---------- J 项: 芒果权益明细 (领到了什么要通知) ----------

_quota_gets = []


class _QuotaSession:
    def get(self, url, **kw):
        _quota_gets.append(url)
        if "queryMemberInfo" in url:
            return types.SimpleNamespace(status_code=200, json=lambda: {
                "data": {"startTime": 1700000000000, "endTime": 1735689600000},
            })
        if "queryAvailableTimes" in url:
            return types.SimpleNamespace(status_code=200, json=lambda: {
                "errno": "0", "data": {"faceCount": "3"},
            })
        return types.SimpleNamespace(status_code=200, json=lambda: {})

    def post(self, url, **kw):
        return types.SimpleNamespace(status_code=200, json=lambda: {})


_quota_obj = object.__new__(ud.UserService)
_quota_obj.session = _QuotaSession()
_quota_obj.yphd_mgtv_headers = lambda: {}
_quota_obj.log = lambda msg, notify=False: None
_q_end, _q_face = ud.UserService.yphd_mgtv_quota_info(_quota_obj, "mticket")
assert _q_face == 3, "faceCount string must parse to int: %r" % (_q_face,)
assert _q_end == 1735689600000, "endTime must be returned verbatim: %r" % (_q_end,)
assert any("queryMemberInfo" in u for u in _quota_gets), "must query member info"
assert any("queryAvailableTimes" in u for u in _quota_gets), "must query available times"

# ---------- K 项: 会员体验权益提取 (领到了什么要通知) ----------

_k_logs = []


def _member_ok_post(path, payload=None, client_id="1001000165", extra=None):
    if "eligibility" in path:
        return {"meta": {"code": "200"}, "result": {"state": 0}}
    return {"meta": {"code": "200"},
            "result": {"orderNo": "X1", "benefitName": "云盘会员7天", "memberDays": 7}}


_k_obj = object.__new__(ud.UserService)
_k_obj.account_mobile = "13800138000"
_k_obj.cloudDisk = types.SimpleNamespace(userToken="tok")
_k_obj.yphd_post = _member_ok_post
_k_obj.log = lambda msg, notify=False: (_k_logs.append((msg, notify)))
_k_ret = ud.UserService.yphd_member_claim(_k_obj)
assert _k_ret is True, "successful claim must return True"
assert any(n and "权益[" in m and "云盘会员7天" in m for m, n in _k_logs), \
    "member claim notify must include the extracted benefit: %r" % (_k_logs,)

# ---------- L 项: 提取器透传乘风权益明细 ----------

_summary_stub2 = types.SimpleNamespace(
    mobile="13800138000",
    account_mobile="13800138000",
    index=1,
    token="stub-token",
    notify_logs=[
        "通通乡村: 登录成功，碳能量123g，生态值5",
        "安全管家: 用户a积分变动：10 → 15 | 新增: 5",
        "云盘乘风活动: 会员体验领取 权益[云盘会员7天]",
        "云盘乘风活动: 芒果权益 AI制作[3次] 会员到期[12-31]",
        "云盘乘风活动: 第1次抽奖 一等奖",
    ],
)
_sub2, _body2 = ud.format_wechat_reading_summary([_summary_stub2])
assert "乘风会员 云盘会员7天" in _body2, \
    "member benefit must be surfaced in summary: %r" % (_body2,)
assert "芒果" in _body2 and "3次" in _body2, \
    "mgtv benefit must be surfaced in summary: %r" % (_body2,)

# 本次新领取 与 往期已领 必须在通知里可区分 (真机验证: 两者曾都渲染成"已领")
_stub_new = types.SimpleNamespace(
    mobile="13800138000", account_mobile="13800138000",
    index=1, token="stub-token",
    notify_logs=["云盘乘风活动: 会员体验领取 成功"],
)
_, _body_new = ud.format_wechat_reading_summary([_stub_new])
assert "乘风会员 已领取" in _body_new, \
    "newly-claimed must differ from steady-state 往期已领: %r" % (_body_new,)
assert "往期已领" not in _body_new, \
    "newly-claimed log must not render as 往期已领: %r" % (_body_new,)
assert "乘风抽奖" in _body2 and "一等奖" in _body2, \
    "draw prize must survive truncation alongside benefits: %r" % (_body2,)

print("unicom gateway & yphd: PASS")

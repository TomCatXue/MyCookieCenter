#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""联通脚本 v1.4.0 双网关与海岛逐浪应援回归测试 (断言式, 无框架依赖)"""
import base64 as _b64
import importlib.util
import os
import re
import sys
import types
import json
from Crypto.Cipher import AES as _AES
from Crypto.Util.Padding import unpad as _unpad

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

# ---------- B 项: 签名器复用 (家乡打卡与海岛共用) ----------

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

# ---------- C 项: 文档与默认值 ----------

# 安徽超级星期五默认关闭 (需配合面额变量才有意义)
assert ud.globalConfig["regional_config"]["run_ah_friday"] is False, \
    "run_ah_friday must default to False"

# 版本号
assert ud.SCRIPT_VERSION == "v1.4.0", f"expected v1.4.0, got {ud.SCRIPT_VERSION}"

# ---------- M 项: 乘风已移除 ----------

# 方法/常量前缀 yphd_ 与已下线接口必须彻底移除。
# 例外: UNICOM_YPHD_MGTV_IMG_FID 是上游刻意保留的向后兼容环境变量, 不算残留。
for _token in ("yphd_", "aiActor", "experience/yp/members", "YPHD_ACTIVITY_ID",
               "YPHD_MEMBER_", "YPHD_MGTV_BASE", "YPHD_MOVE_FILE", "yphd_config"):
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

print("unicom gateway & yphd: PASS")

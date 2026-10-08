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
assert ud.SCRIPT_VERSION == "v1.3.0", f"expected v1.3.0, got {ud.SCRIPT_VERSION}"

print("unicom gateway & yphd: PASS")

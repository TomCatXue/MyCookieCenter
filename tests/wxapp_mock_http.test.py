#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""End-to-end local HTTP mock tests for the five standalone scripts."""
import importlib.util
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    path = ROOT / "ql_script" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"mock_{name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MockPlatform(BaseHTTPRequestHandler):
    calls = []
    responses = {}

    def _read(self):
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            body = raw.decode("utf-8", "replace")
        return body

    def _send(self, body, status=200, headers=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        body = self._read()
        self.__class__.calls.append(("GET", self.path, dict(self.headers), body))
        key = next((k for k in self.__class__.responses if k in self.path), None)
        self._send(self.__class__.responses.get(key, {"errcode": 0, "data": {}}))

    def do_POST(self):
        body = self._read()
        self.__class__.calls.append(("POST", self.path, dict(self.headers), body))
        key = next((k for k in self.__class__.responses if k in self.path), None)
        response = self.__class__.responses.get(key, {"code": 200, "data": {}})
        headers = {}
        if isinstance(response, tuple):
            response, headers = response
        self._send(response, headers=headers)

    def log_message(self, fmt, *args):
        pass


class MockHttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), MockPlatform)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        MockPlatform.calls.clear()
        MockPlatform.responses.clear()

    def test_bibisheng_flow_requests_login_then_lists_and_claims(self):
        module = load("bibisheng")
        module.BASE = self.base
        module.LOGIN = "/txbbs-user/user/login"
        module.QUERY_COUPONS = "/txbbs-mall/coupon/querydailygiftcoupons"
        module.CLAIM_COUPON = "/txbbs-mall/coupon/claimdailygiftcoupon"
        MockPlatform.responses = {
            "/txbbs-user/user/login": {
                "errcode": 0,
                "data": {"session_token": "session-1"},
            },
            "/txbbs-mall/coupon/querydailygiftcoupons": {
                "errcode": 0,
                "data": {
                    "exposure_token": "exposure-1",
                    "coupon_items": [
                        {
                            "is_claimed": False,
                            "daily_gift_type": "DGCT_PLATFORM",
                            "coupon_info": {
                                "coupon_id": 1,
                                "name": "免费提现券",
                                "face_value": 3000,
                            },
                        }
                    ]
                },
            },
            "/txbbs-mall/coupon/claimdailygiftcoupon": {
                "errcode": 0,
                "data": {"coupon_item": {"coupon_info": {"name": "免费提现券"}}},
            },
        }
        with mock.patch.object(module, "fetch_yyb_code", return_value="wx-code"), mock.patch.object(
            module, "save_token"
        ), mock.patch.object(module.time, "sleep"), mock.patch.object(
            module, "load_cache", return_value={}
        ):
            _, lines = module.run_account(module.YYBEntry(self.base, "ref"), 1)
        self.assertIn("领取 1 张", lines[0])
        login = next(call for call in MockPlatform.calls if "/txbbs-user/user/login" in call[1])
        self.assertEqual(login[2].get("jscode"), "wx-code")
        self.assertEqual(login[2].get("Session-Token"), None)
        self.assertEqual(login[2].get("X-Appid"), module.APPID)
        claim = next(
            call for call in MockPlatform.calls if "/claimdailygiftcoupon" in call[1]
        )
        self.assertEqual(claim[3]["exposure_token"], "exposure-1")

    def test_haidilao_flow_uses_login_token_for_sign(self):
        module = load("haidilao")
        module.LOGIN_URL = self.base + "/api/gateway/login/center/login/wechatLogin"
        module.SIGN_URL = self.base + "/activity/wxapp/signin/signin"
        module.FRAGMENT_URL = self.base + "/activity/wxapp/signin/queryFragment"
        MockPlatform.responses = {
            "/wechatLogin": {"success": True, "data": {"token": "hdl-token"}},
            "/signin/signin": {
                "success": True,
                "data": {
                    "signinQueryDetailList": [
                        {
                            "currentOr": 1,
                            "dailySigninStatus": 2,
                            "fragment": 2,
                            "daysSeries": 4,
                        }
                    ]
                },
            },
            "/queryFragment": {"success": True, "data": {"total": 9}},
        }
        with mock.patch.object(module, "fetch_yyb_code", return_value="wx-code"), mock.patch.object(
            module, "save_token"
        ), mock.patch.object(module.time, "sleep"), mock.patch.object(
            module, "load_cache", return_value={}
        ):
            _, lines = module.run_account(module.YYBEntry(self.base, "ref"), 1)
        self.assertIn("签到成功", lines[0])
        sign = next(call for call in MockPlatform.calls if call[1].endswith("/signin/signin"))
        self.assertEqual(sign[2].get("_haidilao_app_token"), "hdl-token")

    def test_miniso_flow_uses_cache_and_detects_already_signed(self):
        module = load("miniso")
        module.LOGIN_URL = self.base + "/wechat/login"
        module.API = self.base + "/task-manage-platform"
        auth = {
            "skey": "skey",
            "openid": "openid",
            "unionid": "unionid",
            "uid": "1",
            "storeId": "Z6XV",
        }
        MockPlatform.responses = {
            "/api/virtualCoin/member": {"code": 200, "data": {"quantity": 100}},
            "/api/activity/signInTask/taskDetail": {
                "code": 200,
                "data": {"taskId": 79, "todaySignInFinishFlag": 1, "signInFinishDays": 2},
            },
        }
        with mock.patch.object(module, "load_cache", return_value={"ref": auth}), mock.patch.object(
            module, "fetch_yyb_code"
        ) as fetch:
            _, lines = module.run_account(module.YYBEntry(self.base, "ref"), 1)
        fetch.assert_not_called()
        self.assertIn("今日已签到", lines[0])
        detail = next(
            call for call in MockPlatform.calls if "/signInTask/taskDetail" in call[1]
        )
        self.assertEqual(detail[2].get("content-skey"), "skey")
        self.assertIn("signature", detail[2])

    def test_linli_requires_store_context_before_login(self):
        module = load("linli")
        module.LOGIN_URL = self.base + "/account-center/oauth/mini-app-login"
        module.SIGN_BASE = self.base + "/cmk-center/sign"
        MockPlatform.responses = {}
        with mock.patch.object(module, "fetch_yyb_code", return_value="wx-code"), mock.patch.dict(
            os.environ,
            {"LINLI_STORE_ID": "", "LINLI_ACTIVITY_ID": ""},
            clear=False,
        ):
            _, lines = module.run_account(module.YYBEntry(self.base, "ref"), 1)
        self.assertIn("LINLI_STORE_ID", lines[0])
        self.assertFalse(
            any("/mini-app-login" in call[1] for call in MockPlatform.calls)
        )

    def test_linli_signs_only_after_activity_is_configured(self):
        module = load("linli")
        module.LOGIN_URL = self.base + "/account-center/oauth/mini-app-login"
        module.SIGN_BASE = self.base + "/cmk-center/sign"
        MockPlatform.responses = {
            "/mini-app-login": {
                "status": True,
                "code": 0,
                "data": {"token": "qm-token", "store": {"id": "212501"}},
            },
            "/userSignStatistics": {
                "status": True,
                "data": {"signStatus": 2, "signDays": 4},
            },
            "/takePartInSign": {
                "status": True,
                "data": {"rewardDetailList": [{"rewardName": "积分", "sendNum": 5}]},
            },
        }
        with mock.patch.object(module, "fetch_yyb_code", return_value="wx-code"), mock.patch.object(
            module, "save_token"
        ), mock.patch.object(module, "qm_post", wraps=module.qm_post) as qm_post, mock.patch.dict(
            os.environ,
            {"LINLI_STORE_ID": "212501", "LINLI_ACTIVITY_ID": "activity-1"},
            clear=False,
        ):
            _, lines = module.run_account(module.YYBEntry(self.base, "ref"), 1)
        self.assertIn("签到成功", lines[0])
        paths = [call.args[0] for call in qm_post.call_args_list]
        self.assertEqual(
            paths,
            ["/userSignStatistics", "/takePartInSign", "/userSignStatistics"],
        )

    def test_huisheng_flow_posts_list_then_grant(self):
        module = load("huisheng")
        module.HOST = self.base
        module.LIST_PATH = "/fulishemini/couponActivity/listActivityCoupon"
        module.GRANT_PATH = "/fulishemini/couponActivity/grantActivityCoupon"
        MockPlatform.responses = {
            "/listActivityCoupon": {
                "code": 200,
                "data": {
                    "config": {
                        "activityName": "红包墙",
                        "activityCode": "101357000",
                    },
                    "preGrantList": [
                        {"data": {"planCode": "p1", "rightCode": "r1"}}
                    ],
                    "recallToken": "recall",
                },
            },
            "/grantActivityCoupon": {
                "code": 200,
                "data": {
                    "tabs": [
                        {
                            "couponList": [
                                {
                                    "status": 0,
                                    "couponName": "满减券",
                                    "couponValue": 500,
                                }
                            ]
                        }
                    ]
                },
            },
        }
        auth = {
            "token": "mt-token",
            "open_id": "openid",
            "open_id_cipher": "cipher",
            "user_id": 7,
            "union_id": "unionid",
            "device": {"wm_uuid": "device-id", "wm_visitid": "visit-id"},
        }
        with mock.patch.object(module, "fetch_yyb_code", return_value="wx-code"), mock.patch.object(
            module, "login_by_code", return_value=auth
        ), mock.patch.object(
            module, "mark_right_codes"
        ), mock.patch.object(
            module, "known_right_codes", return_value=set()
        ), mock.patch.object(module, "attach_device", side_effect=lambda a, _ref: a), mock.patch.object(module.time, "sleep"):
            _, lines = module.run_account(module.YYBEntry(self.base, "ref"), 1)
        self.assertIn("领到 1 张", lines[0])
        grant = next(call for call in MockPlatform.calls if "/grantActivityCoupon" in call[1])
        self.assertEqual(grant[3]["recallToken"], "recall")
        self.assertEqual(grant[3]["tabs"], [{"planCode": "p1", "rightCodes": ["r1"]}])


if __name__ == "__main__":
    unittest.main()

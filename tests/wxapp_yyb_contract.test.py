#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Five standalone mini-program scripts: YYB and request-contract regression tests."""
import importlib.util
import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ["linli", "huisheng", "bibisheng", "haidilao", "miniso"]


def load(name):
    path = ROOT / "ql_script" / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"wxapp_{name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MockResponse:
    def __init__(self, body, status=200, headers=None):
        self._body = body
        self.status_code = status
        self.headers = headers or {}
        self.text = json.dumps(body, ensure_ascii=False)

    def json(self):
        return self._body


class MockYYB(BaseHTTPRequestHandler):
    calls = []

    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(length) or b"{}")
        self.__class__.calls.append((self.path, body, dict(self.headers)))
        response = {
            "code": 0,
            "msg": "success",
            "data": {"result": {"code": "wx-code-from-mock", "errMsg": "login:ok"}},
        }
        payload = json.dumps(response).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        pass


class YYBContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), MockYYB)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_all_scripts_fetch_code_with_expected_payload(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                MockYYB.calls.clear()
                code = module.fetch_yyb_code(
                    f"{self.url}@account-ref", module.APPID
                )
                self.assertEqual(code, "wx-code-from-mock")
                self.assertEqual(MockYYB.calls[0][0], "/wxapp/getCode")
                self.assertEqual(
                    MockYYB.calls[0][1],
                    {"ref": "account-ref", "app_id": module.APPID},
                )

    def test_all_scripts_reject_non_string_numeric_code(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                body = {"code": 0, "data": {"result": {"code": 0}}}
                self.assertIsNone(module.extract_wx_code(body))

    def test_all_scripts_accept_gateway_data_code_shape(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                self.assertEqual(
                    module.extract_wx_code({"status": True, "data": {"code": "gateway-code"}}),
                    "gateway-code",
                )

    def test_all_scripts_accept_yyb_top_level_result_code_shape(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                self.assertEqual(
                    module.extract_wx_code(
                        {
                            "openid": "openid",
                            "account": {"id": 1},
                            "result": {"code": "yyb-code", "errMsg": "login:ok"},
                        }
                    ),
                    "yyb-code",
                )

    def test_all_scripts_ignore_outer_yyb_status_code(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                self.assertIsNone(
                    module.extract_wx_code(
                        {"code": 0, "message": "success", "data": {"ref": "1"}}
                    )
                )

    def test_all_scripts_split_endpoint_with_url_credentials(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                entry = module.parse_yyb_entries(
                    "http://user:pass@yyb-go:8000@account-ref"
                )[0]
                self.assertEqual(entry.endpoint, "http://user:pass@yyb-go:8000")
                self.assertEqual(entry.ref, "account-ref")

    def test_all_scripts_keep_url_credentials_when_splitting_entries(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                entries = module.parse_yyb_entries(
                    "http://yyb-user:yyb-secret@yyb-go:8000@account-ref"
                )
                self.assertEqual(len(entries), 1)
                self.assertEqual(entries[0].endpoint, "http://yyb-user:yyb-secret@yyb-go:8000")
                self.assertEqual(entries[0].ref, "account-ref")

    def test_all_scripts_accept_bare_host_port_entry(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                entry = module.parse_yyb_entries("127.0.0.1:8000@1")[0]
                self.assertEqual(entry.endpoint, "http://127.0.0.1:8000")
                self.assertEqual(entry.ref, "1")

    def test_all_scripts_mask_and_split_yyb_entries(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                entries = module.parse_yyb_entries(
                    f"{self.url}@one\n{self.url}@two"
                )
                self.assertEqual([e.ref for e in entries], ["one", "two"])
                self.assertNotIn("@one", module.mask_entry(entries[0]))

    def test_all_scripts_do_not_split_multiline_entry_on_ampersand(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                entries = module.parse_yyb_entries(
                    "http://yyb-go:8000@one\n"
                    "http://yyb-go:8001@two"
                )
                self.assertEqual(len(entries), 2)
                self.assertEqual(
                    [entry.ref for entry in entries],
                    ["one", "two"],
                )

    def test_all_scripts_hide_endpoint_credentials_in_masked_output(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                entry = module.parse_yyb_entries(
                    "http://user:pass@example.test:8080@account-ref"
                )[0]
                masked = module.mask_entry(entry)
                self.assertNotIn("user:", masked)
                self.assertNotIn("pass", masked)
                self.assertIn("example.test:8080", masked)

    def test_all_scripts_fail_when_every_account_fails_to_fetch_code(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                with mock.patch.dict(
                    os.environ, {"YYB_SERVER": "http://127.0.0.1:9@ref"}, clear=False
                ), mock.patch.object(
                    module, "fetch_yyb_code", return_value=None
                ), mock.patch.object(
                    module, "notify"
                ), mock.patch.object(
                    module.time, "sleep"
                ):
                    self.assertEqual(module.main(), 1)

    def test_all_scripts_return_nonzero_when_config_or_code_blocks_all_accounts(self):
        module = load("linli")
        with mock.patch.dict(
            os.environ,
            {
                "YYB_SERVER": "http://127.0.0.1:9@ref",
                "LINLI_STORE_ID": "212501",
                "LINLI_ACTIVITY_ID": "",
            },
            clear=False,
        ), mock.patch.object(module, "notify"), mock.patch.object(module.time, "sleep"):
            self.assertEqual(module.main(), 1)

    def test_linli_with_store_but_no_activity_fails_without_requesting_yyb(self):
        module = load("linli")
        with mock.patch.dict(
            os.environ,
            {
                "YYB_SERVER": "http://127.0.0.1:9@ref",
                "LINLI_STORE_ID": "212501",
                "LINLI_ACTIVITY_ID": "",
            },
            clear=False,
        ), mock.patch.object(module, "fetch_yyb_code") as fetch, mock.patch.object(
            module, "notify"
        ):
            self.assertEqual(module.main(), 1)
        fetch.assert_not_called()

    def test_main_fails_if_any_account_fails_even_when_another_succeeds(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                results = [["账号1 成功"], ["账号2 执行异常: boom"]]
                with mock.patch.dict(
                    os.environ,
                    {
                        "YYB_SERVER": "http://127.0.0.1:9@one\nhttp://127.0.0.1:9@two",
                        "LINLI_STORE_ID": "212501",
                        "LINLI_ACTIVITY_ID": "activity",
                    },
                    clear=False,
                ), mock.patch.object(
                    module, "run_account", side_effect=results
                ), mock.patch.object(module, "notify"), mock.patch.object(
                    module.time, "sleep"
                ):
                    self.assertEqual(module.main(), 1)

    def test_all_scripts_return_nonzero_when_login_fails_for_every_account(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                patchers = []
                try:
                    with mock.patch.dict(
                        os.environ,
                        {
                            "YYB_SERVER": "http://127.0.0.1:9@ref",
                            "LINLI_STORE_ID": "212501",
                            "LINLI_ACTIVITY_ID": "activity",
                        },
                        clear=False,
                    ), mock.patch.object(
                        module, "fetch_yyb_code", return_value="wx-code"
                    ), mock.patch.object(module, "notify"), mock.patch.object(
                        module.time, "sleep"
                    ):
                        if name == "linli":
                            patchers.append(
                                mock.patch.object(
                                    module,
                                    "login_by_code",
                                    side_effect=RuntimeError("登录失败: rejected"),
                                )
                            )
                        elif name == "bibisheng":
                            patchers.append(
                                mock.patch.object(
                                    module,
                                    "login_with_code",
                                    side_effect=RuntimeError("登录失败: rejected"),
                                )
                            )
                        elif name == "miniso":
                            patchers.append(
                                mock.patch.object(module, "load_cache", return_value={})
                            )
                            patchers.append(
                                mock.patch.object(
                                    module,
                                    "login_by_code",
                                    side_effect=RuntimeError("登录失败: rejected"),
                                )
                            )
                        else:
                            patchers.append(
                                mock.patch.object(
                                    module,
                                    "login_by_code",
                                    side_effect=RuntimeError("登录失败: rejected"),
                                )
                            )
                        for p in patchers:
                            p.start()
                        self.assertEqual(module.main(), 1)
                finally:
                    for p in reversed(patchers):
                        p.stop()

    def test_miniso_cached_session_avoids_yyb_code_until_invalid(self):
        module = load("miniso")
        auth = {
            "skey": "cached-skey",
            "openid": "openid",
            "unionid": "unionid",
            "uid": "1",
            "storeId": "Z6XV",
        }
        client = mock.Mock()
        client.coin.side_effect = [100, 120]
        client.signin.return_value = "签到成功 · 连续 2 天"
        with mock.patch.object(module, "load_cache", return_value={"ref": auth}), mock.patch.object(
            module, "MinisoClient", return_value=client
        ), mock.patch.object(module, "fetch_yyb_code") as fetch:
            _, lines = module.run_account(module.YYBEntry(self.url, "ref"), 1)
        fetch.assert_not_called()
        self.assertIn("100 → 120", lines[0])

    def test_miniso_non_auth_coin_error_does_not_refresh_code(self):
        module = load("miniso")
        auth = {"skey": "skey", "openid": "openid", "unionid": "", "uid": "1"}
        client = mock.Mock()
        client.coin.return_value = None
        client.auth_failed.return_value = False
        client.last_response = {"code": 500, "message": "server busy"}
        with mock.patch.object(module, "load_cache", return_value={"ref": auth}), mock.patch.object(
            module, "MinisoClient", return_value=client
        ), mock.patch.object(module, "fetch_yyb_code") as fetch:
            _, lines = module.run_account(module.YYBEntry(self.url, "ref"), 1)
        fetch.assert_not_called()
        self.assertIn("server busy", lines[0])

    def test_miniso_signin_rejects_code_200_with_success_false(self):
        module = load("miniso")
        client = module.MinisoClient({"skey": "s", "openid": "o", "unionid": "u", "uid": "1"})
        with mock.patch.object(
            client,
            "get",
            return_value={
                "code": 200,
                "data": {"taskId": 79, "todaySignInFinishFlag": 0},
            },
        ), mock.patch.object(
            client,
            "post",
            return_value={"code": 200, "success": False, "message": "rejected"},
        ):
            with self.assertRaisesRegex(RuntimeError, "签到失败"):
                client.signin()

    def test_miniso_signin_accepts_code_200_when_success_is_absent(self):
        module = load("miniso")
        client = module.MinisoClient({"skey": "s", "openid": "o", "unionid": "u", "uid": "1"})
        with mock.patch.object(
            client,
            "get",
            return_value={
                "code": 200,
                "data": {"taskId": 79, "todaySignInFinishFlag": 0},
            },
        ), mock.patch.object(client, "post", return_value={"code": 200}):
            self.assertIn("签到成功", client.signin())

    def test_miniso_signin_auth_failure_updates_last_response(self):
        module = load("miniso")
        auth = {"skey": "stale", "openid": "o", "unionid": "u", "uid": "1"}
        client = module.MinisoClient(auth)
        self.assertTrue(hasattr(client, "last_response"))
        with mock.patch.object(
            client,
            "get",
            return_value={"code": 401, "message": "token expired"},
        ):
            with self.assertRaisesRegex(RuntimeError, "签到详情失败"):
                client.signin()
        self.assertTrue(client.auth_failed())

    def test_miniso_auth_failed_is_false_for_successful_response(self):
        module = load("miniso")
        client = module.MinisoClient({})
        client.last_response = {"code": 200, "success": True, "message": "ok"}
        self.assertFalse(client.auth_failed())

    def test_huisheng_right_code_cache_only_marks_successful_batch(self):
        module = load("huisheng")
        with mock.patch.object(module, "load_cache", return_value={"ref": {}}), mock.patch.object(
            module, "save_cache"
        ) as save:
            module.mark_right_codes("ref", ["r1", "r2", "r1"])
        saved = save.call_args.args[0]
        stored = saved["ref"]["used_right_codes"]
        self.assertEqual(len(stored), 1)
        self.assertEqual(next(iter(stored.values())), ["r1", "r2"])

    def test_huisheng_right_code_cache_is_partitioned_by_china_date(self):
        module = load("huisheng")
        with mock.patch.object(
            module,
            "load_cache",
            return_value={"ref": {"used_right_codes": {"2000-01-01": ["old"]}}},
        ), mock.patch.object(module, "save_cache") as save:
            module.mark_right_codes("ref", ["new"])
        stored = save.call_args.args[0]["ref"]["used_right_codes"]
        self.assertIn("2000-01-01", stored)
        self.assertEqual(len(stored), 2)
        self.assertNotIn("new", stored["2000-01-01"])

    def test_huisheng_device_identity_persists_across_new_auth(self):
        module = load("huisheng")
        cache = {"ref": {"device": {"wm_uuid": "device-id", "wm_visitid": "visit-id"}}}
        seen = []

        def read_cache():
            seen.append(dict(cache.get("ref") or {}))
            return cache

        def write_cache(value):
            cache.clear()
            cache.update(value)

        with mock.patch.object(module, "load_cache", side_effect=read_cache), mock.patch.object(
            module, "save_cache", side_effect=write_cache
        ):
            first = module.attach_device(
                {"token": "token1", "open_id": "o", "open_id_cipher": "c"}, "ref"
            )["device"]
            second = module.attach_device(
                {"token": "token2", "open_id": "o", "open_id_cipher": "c"}, "ref"
            )["device"]
        self.assertEqual(first, second)
        self.assertEqual(cache["ref"]["auth"]["token"], "token2")
        self.assertEqual(seen[1]["device"], {"wm_uuid": "device-id", "wm_visitid": "visit-id"})

    def test_huisheng_does_not_fall_back_to_tablist_when_all_right_codes_are_held(self):
        module = load("huisheng")
        tabs = module.build_tabs(
            {
                "preGrantList": [
                    {
                        "data": {
                            "planCode": "p1",
                            "rightCode": "held",
                            "couponViewId": "already-owned",
                        }
                    }
                ],
                "config": {
                    "tabList": [{"planCode": "p1", "rightCodes": ["held"]}]
                },
            }
        )
        self.assertEqual(tabs, [])

    def test_shipped_scripts_have_no_unresolved_template_tokens(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                source = (ROOT / "ql_script" / f"{name}.py").read_text(encoding="utf-8")
                self.assertNotIn("{{", source)

    def test_linli_activity_id_is_required_before_sign(self):
        module = load("linli")
        with mock.patch.dict(
            os.environ,
            {
                "YYB_SERVER": f"{self.url}@ref",
                "LINLI_STORE_ID": "212501",
                "LINLI_ACTIVITY_ID": "",
            },
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "LINLI_ACTIVITY_ID"):
                module.require_linli_context()

    def test_each_standalone_script_has_no_cross_script_imports(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                source = (ROOT / "ql_script" / f"{name}.py").read_text(encoding="utf-8")
                for other in SCRIPTS:
                    if other == name:
                        continue
                    self.assertNotIn(f"import {other}", source)
                    self.assertNotIn(f"from {other}", source)

    def test_bibisheng_login_uses_code_in_header_and_maps_token(self):
        module = load("bibisheng")
        calls = []

        def fake_request(method, path, token="", jscode="", body=None, track_id=""):
            calls.append((method, path, token, jscode, body, track_id))
            return {"errcode": 0, "errmsg": "ok", "data": {"session_token": "session-ok"}}

        with mock.patch.object(module, "request_json", side_effect=fake_request):
            token = module.login_with_code("one-time-code")
        self.assertEqual(token, "session-ok")
        self.assertEqual(calls[0][0], "GET")
        self.assertEqual(calls[0][1], module.LOGIN)
        self.assertEqual(calls[0][3], "one-time-code")

    def test_bibisheng_headers_match_daily_coupon_app_context(self):
        module = load("bibisheng")
        headers = module.api_headers("session", "jscode", "TRACK123", "session-123")
        self.assertEqual(headers["X-Appid"], module.APPID)
        self.assertEqual(headers["X-Module-Name"], "mmpaytxbbsmp")
        self.assertEqual(headers["X-Page"], "pages/gift/index")
        self.assertEqual(headers["X-Track-Id"], "TRACK123")
        self.assertEqual(headers["session-id"], "session-123")
        self.assertEqual(headers["jscode"], "jscode")
        self.assertEqual(headers["Session-Token"], "session")

    def test_bibisheng_decodes_raw_deflate_from_response_content(self):
        module = load("bibisheng")
        body = {"errcode": 0, "data": {"coupon_items": []}}
        import zlib

        compressed = zlib.compress(json.dumps(body).encode())[2:-4]
        response = MockResponse({}, status=200)
        response.content = compressed
        response.text = ""
        response.json = mock.Mock(side_effect=ValueError("compressed"))
        with mock.patch.object(module.requests, "request", return_value=response):
            self.assertEqual(module.request_json("GET", "/x"), body)

    def test_bibisheng_only_claims_unclaimed_daily_coupons(self):
        module = load("bibisheng")
        claimed = []
        listing = {
            "errcode": 0,
            "data": {
                "exposure_token": "exposure-1",
                "coupon_items": [
                    {
                        "is_claimed": False,
                        "daily_gift_type": "DGCT_PLATFORM",
                        "expected_send_amount": 3000,
                        "coupon_info": {
                            "coupon_id": 1,
                            "name": "券A",
                            "face_value": 3000,
                        },
                    },
                    {
                        "is_claimed": True,
                        "daily_gift_type": "DGCT_PLATFORM",
                        "coupon_info": {
                            "coupon_id": "b",
                            "name": "券B",
                            "face_value": 2000,
                        },
                    },
                ]
            },
        }
        with mock.patch.object(module, "fetch_yyb_code", return_value="code"), mock.patch.object(
            module, "login_with_code", return_value="token"
        ), mock.patch.object(
            module, "query_daily_coupons", return_value=listing
        ), mock.patch.object(
            module,
            "claim_daily_coupon",
            side_effect=lambda _t, coupon_id, daily_type, amount, exposure, track: (
                claimed.append((coupon_id, daily_type, amount))
                or {"errcode": 0, "data": {"coupon_item": {"coupon_info": {"name": "券A"}}}}
            ),
        ), mock.patch.object(module, "save_token"):
            _, result = module.run_account(module.YYBEntry(self.url, "ref"), 1)
        self.assertEqual(claimed, [(1, "DGCT_PLATFORM", 3000)])
        self.assertIn("领取 1 张", result[0])
        self.assertIn("另有 1 张今日已领", result[0])

    def test_haidilao_login_payload_and_idempotent_sign(self):
        module = load("haidilao")
        posted = []
        today_payload = {
            "success": True,
            "data": {
                "signinQueryDetailList": [
                    {
                        "currentOr": 1,
                        "dailySigninStatus": 1,
                        "daysSeries": 6,
                    }
                ]
            },
        }

        def fake_post(url, json=None, headers=None, timeout=None):
            posted.append((url, json, headers))
            if url == module.LOGIN_URL:
                return MockResponse({"success": True, "data": {"token": "hdl-token"}})
            if url == module.SIGN_URL:
                return MockResponse(today_payload)
            return MockResponse({"success": True, "data": {"total": 12}})

        with mock.patch.object(module.requests, "post", side_effect=fake_post), mock.patch.object(
            module, "save_token"
        ), mock.patch.object(module, "load_cache", return_value={}):
            _, result = module.run_account(module.YYBEntry(self.url, "ref"), 1)
        login_call = posted[0]
        self.assertEqual(login_call[1]["code"], "wx-code-from-mock")
        self.assertEqual(login_call[1]["codeType"], 1)
        self.assertIn("今日已签到", result[0])
        self.assertIn("共 12 碎片", result[0])

    def test_haidilao_cached_token_avoids_new_wx_code(self):
        module = load("haidilao")
        cached = {"ref": {"token": "cached-token"}}
        responses = {
            module.FRAGMENT_URL: {"success": True, "data": {"total": 3}},
            module.SIGN_URL: {
                "success": True,
                "data": {
                    "signinQueryDetailList": [
                        {"currentOr": 1, "dailySigninStatus": 1}
                    ]
                },
            },
        }
        with mock.patch.object(module, "load_cache", return_value=cached), mock.patch.object(
            module, "api_post", side_effect=lambda url, _t, _b=None: responses[url]
        ), mock.patch.object(module, "fetch_yyb_code") as fetch:
            _, lines = module.run_account(module.YYBEntry(self.url, "ref"), 1)
        fetch.assert_not_called()
        self.assertIn("缓存会话", lines[0])

    def test_haidilao_missing_today_record_is_not_reported_as_success(self):
        module = load("haidilao")
        with mock.patch.object(module, "load_cache", return_value={}), mock.patch.object(
            module, "fetch_yyb_code", return_value="code"
        ), mock.patch.object(
            module, "login_by_code", return_value="token"
        ), mock.patch.object(
            module, "save_token"
        ), mock.patch.object(
            module, "api_post", return_value={"success": True, "data": {"signinQueryDetailList": []}}
        ):
            _, lines = module.run_account(module.YYBEntry(self.url, "ref"), 1)
        self.assertIn("待确认", lines[0])

    def test_miniso_signature_is_stable_for_fixed_inputs(self):
        module = load("miniso")
        self.assertEqual(
            module.md5_upper("virtualCoinMember1700000000abc"),
            "EA5B78DDDD13584BAA5B6932453B33A3",
        )

    def test_miniso_login_returns_identity_from_agent_response(self):
        module = load("miniso")
        captured = {}

        def fake_post(url, data=None, headers=None, timeout=None):
            captured.update({"url": url, "data": data, "headers": headers})
            return MockResponse(
                {
                    "code": 200,
                    "data": {
                        "skey": "skey-value",
                        "openid": "openid-value",
                        "unionid": "unionid-value",
                        "uid": 123,
                    },
                }
            )

        with mock.patch.object(module.requests, "post", side_effect=fake_post):
            auth = module.login_by_code("wx-code")
        self.assertEqual(auth["skey"], "skey-value")
        self.assertEqual(auth["uid"], "123")
        self.assertEqual(captured["url"], module.LOGIN_URL)
        self.assertNotEqual(captured["data"], "wx-code")
        self.assertIn("signature", captured["headers"])

    def test_huisheng_login_requires_cipher_and_builds_tabs(self):
        module = load("huisheng")
        auth = module._auth_from_body(
            {
                "result": {
                    "mtToken": "mt-token",
                    "openId": "openid",
                    "openIdCipher": "cipher",
                    "userId": 7,
                }
            }
        )
        self.assertIsNotNone(auth)
        body = module.base_wall_body(auth, 1700000000000)
        self.assertEqual(body["wm_logintoken"], "mt-token")
        self.assertEqual(body["open_id"], "openid")
        self.assertEqual(body["expoId"], "cipher")
        self.assertEqual(body["wm_dversion"], "10.0.19045")
        self.assertEqual(body["wm_user_id"], 7)
        self.assertEqual(body["wm_open_id"], "openid")
        self.assertEqual(body["wm_open_id_cipher"], "cipher")
        self.assertEqual(body["unpl"], "")
        tabs = module.build_tabs(
            {
                "list": [
                    {
                        "data": {
                            "planCode": "p1",
                            "rightCode": "held",
                            "couponViewId": "already-owned",
                        }
                    }
                ],
                "preGrantList": [
                    {"data": {"planCode": "p1", "rightCode": "r1"}},
                    {"data": {"planCode": "p1", "rightCode": "r1"}},
                ]
            }
        )
        self.assertEqual(tabs, [{"planCode": "p1", "rightCodes": ["r1"]}])

    def test_huisheng_gateway_sends_ref_and_parses_complete_auth(self):
        module = load("huisheng")
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update(
                {"url": url, "json": json, "headers": headers, "timeout": timeout}
            )
            return MockResponse(
                {
                    "success": True,
                    "result": {
                        "token": "mt-token",
                        "openId": "openid",
                        "openIdCipher": "cipher",
                        "unionId": "unionid",
                        "userId": 7,
                        "finger_applets": "fingerprint",
                    },
                }
            )

        with mock.patch.dict(
            os.environ, {"HUISHENG_LOGIN_GATEWAY_KEY": "gateway-key"}, clear=False
        ), mock.patch.object(module.requests, "post", side_effect=fake_post):
            auth = module.login_via_gateway("ref", "http://gateway.test")

        self.assertEqual(
            captured["url"], "http://gateway.test" + module.LOGIN_GATEWAY_PATH
        )
        self.assertEqual(
            captured["json"],
            {"ref": "ref", "app_id": module.APPID, "openid": ""},
        )
        self.assertEqual(captured["headers"]["Authorization"], "Bearer gateway-key")
        self.assertEqual(auth["token"], "mt-token")
        self.assertEqual(auth["open_id"], "openid")
        self.assertEqual(auth["open_id_cipher"], "cipher")
        self.assertEqual(auth["union_id"], "unionid")
        self.assertEqual(auth["user_id"], 7)
        self.assertEqual(auth["finger_applets"], "fingerprint")

    def test_huisheng_gateway_supports_project_run_contract(self):
        module = load("huisheng")
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update({"url": url, "json": json})
            return MockResponse(
                {
                    "success": True,
                    "result": {
                        "ok": True,
                        "mtToken": "mt-token",
                        "openId": "openid",
                        "openIdCipher": "cipher",
                        "unionId": "unionid",
                        "userId": 7,
                    },
                }
            )

        with mock.patch.dict(
            os.environ,
            {
                "HUISHENG_LOGIN_PROJECT_ID": "12",
                "HUISHENG_MT_OPENID": "backend-openid",
            },
            clear=False,
        ), mock.patch.object(module.requests, "post", side_effect=fake_post):
            auth = module.login_via_gateway("ref", "http://gateway.test")

        self.assertEqual(captured["url"], "http://gateway.test/api/projects/12/run")
        self.assertEqual(
            captured["json"],
            {
                "params": {
                    "openid": "backend-openid",
                    "appid": module.APPID,
                    "proxyUrl": "",
                }
            },
        )
        self.assertEqual(auth["token"], "mt-token")

    def test_huisheng_inline_backend_uses_ref_openid_mapping(self):
        module = load("huisheng")
        captured = {}

        def fake_post(url, json=None, headers=None, timeout=None):
            captured.update({"url": url, "json": json, "headers": headers})
            return MockResponse(
                {
                    "success": True,
                    "result": {
                        "ok": True,
                        "mtToken": "mt-token",
                        "openId": "meituan-openid",
                        "openIdCipher": "cipher",
                        "unionId": "unionid",
                        "userId": 7,
                    },
                }
            )

        with mock.patch.dict(
            os.environ,
            {
                "HUISHENG_MT_BACKEND": "http://backend.test:18273",
                "HUISHENG_MT_PROJECT_ID": "12",
                "HUISHENG_MT_LICENSE_KEY": "license",
                "HUISHENG_MT_OPENIDS": "ref=backend-openid",
            },
            clear=False,
        ), mock.patch.object(module.requests, "post", side_effect=fake_post):
            auth = module.login_via_inline_backend("ref")

        self.assertEqual(captured["url"], "http://backend.test:18273/api/projects/12/run")
        self.assertEqual(
            captured["json"],
            {
                "params": {
                    "openid": "backend-openid",
                    "appid": module.APPID,
                    "proxyUrl": "",
                }
            },
        )
        self.assertEqual(captured["headers"]["Authorization"], "Bearer license")
        self.assertEqual(auth["token"], "mt-token")
        self.assertEqual(auth["open_id"], "meituan-openid")

    def test_huisheng_inline_backend_rejects_non_2xx(self):
        module = load("huisheng")
        response = MockResponse(
            {"success": True, "result": {"mtToken": "x", "openId": "o"}},
            status=502,
        )
        with mock.patch.dict(
            os.environ,
            {
                "HUISHENG_MT_BACKEND": "http://backend.test:18273",
                "HUISHENG_MT_PROJECT_ID": "12",
                "HUISHENG_MT_OPENIDS": "ref=backend-openid",
            },
            clear=False,
        ), mock.patch.object(module.requests, "post", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "HTTP 502"):
                module.login_via_inline_backend("ref")

    def test_huisheng_inline_backend_reads_openid_from_yyb_when_unmapped(self):
        module = load("huisheng")
        with mock.patch.dict(
            os.environ,
            {
                "HUISHENG_MT_BACKEND": "http://backend.test:18273",
                "HUISHENG_MT_PROJECT_ID": "12",
                "HUISHENG_MT_OPENIDS": "",
                "YYB_SERVER": "http://yyb.test@ref",
            },
            clear=False,
        ), mock.patch.object(
            module,
            "_fetch_yyb_account",
            return_value={"openid": "yyb-openid"},
        ), mock.patch.object(
            module,
            "run_meituan_project",
            return_value={"token": "t", "open_id": "o"},
        ) as run:
            module.login_via_inline_backend("ref")
        self.assertEqual(run.call_args.args[3], "yyb-openid")

    def test_huisheng_gateway_rejects_partial_identity(self):
        module = load("huisheng")
        with mock.patch.object(
            module.requests,
            "post",
            return_value=MockResponse(
                {
                    "openId": "openid",
                    "openIdCipher": "cipher",
                    "error": {"code": 101155, "type": "connect_not_bind_mobile"},
                }
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "未返回完整登录态"):
                module.login_via_gateway("ref", "http://gateway.test")

    def test_huisheng_gateway_mode_does_not_fall_back_to_yyb_code(self):
        module = load("huisheng")
        with mock.patch.dict(
            os.environ, {"HUISHENG_LOGIN_GATEWAY": "http://gateway.test"}, clear=False
        ), mock.patch.object(
            module,
            "login_via_gateway",
            side_effect=RuntimeError("gateway rejected"),
        ), mock.patch.object(module, "fetch_yyb_code") as fetch, mock.patch.object(
            module, "login_by_code"
        ) as legacy:
            ok, lines = module.run_account(module.YYBEntry("http://yyb.test", "ref"), 1)
        self.assertFalse(ok)
        self.assertIn("gateway rejected", lines[0])
        fetch.assert_not_called()
        legacy.assert_not_called()

    def test_huisheng_legacy_code_path_is_explicitly_unsupported(self):
        module = load("huisheng")
        with self.assertRaisesRegex(RuntimeError, "HUISHENG_LOGIN_GATEWAY"):
            module.login_by_code("code")

    def test_linli_login_and_sign_contract(self):
        module = load("linli")
        calls = []

        def fake_post(url, json=None, headers=None, timeout=None):
            calls.append((url, json, headers))
            if url == module.LOGIN_URL:
                return MockResponse(
                    {
                        "status": True,
                        "code": 0,
                        "data": {"token": "qm-token", "user": {"id": 1}},
                    }
                )
            return MockResponse(
                {
                    "payload": "encrypted",
                }
            )

        with mock.patch.object(module.requests, "post", side_effect=fake_post):
            auth = module.login_by_code("212501", "code")
        self.assertEqual(auth["token"], "qm-token")
        self.assertIn("payload", calls[0][1])
        self.assertIn("QM-Encrypt-Meta", calls[0][2])
        self.assertNotIn("code", calls[0][1])
        stats = {"status": True, "data": {"signStatus": 1, "signDays": 3}}
        self.assertEqual(int(stats["data"]["signStatus"]), 1)

    def test_linli_login_requires_success_envelope_and_zero_code(self):
        module = load("linli")
        with mock.patch.object(
            module,
            "qm_encrypted_post",
            return_value={"status": True, "code": 401, "data": {"token": "stale"}},
        ):
            with self.assertRaisesRegex(RuntimeError, "code=401"):
                module.login_by_code("212501", "code")

    def test_linli_requires_store_and_activity_context(self):
        module = load("linli")
        with mock.patch.dict(
            os.environ,
            {"LINLI_STORE_ID": "", "LINLI_ACTIVITY_ID": ""},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "LINLI_STORE_ID"):
                module.require_linli_context()
        with mock.patch.dict(
            os.environ,
            {"LINLI_STORE_ID": "", "LINLI_ACTIVITY_ID": "activity-1"},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "LINLI_STORE_ID"):
                module.require_linli_context()
        with mock.patch.dict(
            os.environ,
            {"LINLI_STORE_ID": "", "LINLI_ACTIVITY_ID": "activity-1"},
            clear=False,
        ):
            with self.assertRaisesRegex(RuntimeError, "LINLI_STORE_ID"):
                module.require_linli_context()
        with mock.patch.dict(
            os.environ,
            {"LINLI_STORE_ID": "212501", "LINLI_ACTIVITY_ID": "activity-1"},
            clear=False,
        ):
            self.assertEqual(
                module.require_linli_context(), ("212501", "activity-1")
            )

    def test_linli_login_allows_empty_store_and_sends_placeholder_header(self):
        module = load("linli")
        with mock.patch.object(
            module,
            "qm_encrypted_post",
            return_value={
                "status": True,
                "code": 0,
                "data": {"token": "token", "store": {"id": "212501"}},
            },
        ) as encrypted:
            module.login_by_code("", "code")
        self.assertEqual(encrypted.call_args.args[1], "0")

    def test_linli_non_200_http_is_classified_before_json_parse(self):
        module = load("linli")
        response = MockResponse({"raw": "gateway"}, status=502)
        with mock.patch.object(module.requests, "post", return_value=response):
            with self.assertRaisesRegex(RuntimeError, "HTTP 502"):
                module.qm_encrypted_post("https://example.test", "1", "", {})

    def test_scripts_reject_invalid_yyb_entry_without_network(self):
        for name in SCRIPTS:
            with self.subTest(script=name):
                module = load(name)
                with self.assertRaises(ValueError):
                    module.fetch_yyb_code("not-an-entry", module.APPID)


if __name__ == "__main__":
    unittest.main()

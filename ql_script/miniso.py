#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
名创优品 · 微信小程序每日签到（独立脚本）

new Env('名创优品')
cron: 30 8 * * *
tag: 微信小程序

环境变量：
  YYB_SERVER   取码服务，格式：地址@账号ref（多账号换行）
  YYB_API_KEY  可选，取码服务 Bearer Token

链路：YYB getCode -> AES-128-CBC 登录 -> skey/openid/unionid/uid
      -> 缓存校验 -> 签到状态 -> 签到

登录加密、签名与业务字段来自名创优品小程序现网实现。业务 Token 只落本地缓存，
不会打印；缓存失效时自动通过 YYB 重新取码一次。缓存文件已被 .gitignore 排除。
"""
import hashlib
import json
import os
import random
import re
import string
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote, urlsplit

try:
    import requests
except ImportError:
    requests = None

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad
except ImportError:
    AES = None
    pad = None


SCRIPT_VERSION = "2026-10-24.r1"
APPID = "wx2a212470bade49bf"
AES_KEY_HEX = "0f9f8b1e791f754d2ded9dfb38a4b628"
AES_IV_HEX = "31323334353637383930313233343535"
SIGN_PREFIX = "#storeexpress1.0#ffe232&t%4df!67sx55eas#"
LOGIN_URL = "https://cdn-storeexpress.miniso.com/wechat/login"
API = "https://api-saas.miniso.com/task-manage-platform"
ACTIVITY_ID = 18
STORE_ID = "Z6XV"
CACHE_PATH = Path(__file__).with_name(".miniso_cache.json")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 "
    "MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows "
    "WindowsWechat/WMPF WindowsWechat(0x63090a13) "
    "UnifiedPCWindowsWechat(0xf254181d) XWEB/19339"
)


@dataclass(frozen=True)
class YYBEntry:
    endpoint: str
    ref: str


def parse_yyb_entries(raw: Optional[str] = None) -> List[YYBEntry]:
    raw = os.getenv("YYB_SERVER", "") if raw is None else raw
    entries = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or "@" not in line or line == "[object Object]":
            continue
        endpoint, ref = line.rsplit("@", 1)
        endpoint, ref = endpoint.strip().rstrip("/"), ref.strip()
        if not endpoint or not ref:
            continue
        if not endpoint.startswith(("http://", "https://")):
            endpoint = "http://" + endpoint
        entries.append(YYBEntry(endpoint, ref))
    return entries


def mask_entry(entry: YYBEntry) -> str:
    ref = entry.ref
    masked = f"{ref[:2]}***{ref[-2:]}" if len(ref) > 5 else "***"
    parts = urlsplit(entry.endpoint)
    host = parts.hostname or ""
    port = f":{parts.port}" if parts.port else ""
    safe_endpoint = f"{parts.scheme}://{host}{port}" if host else "***"
    return f"{safe_endpoint}@{masked}"


def extract_wx_code(body: Any) -> Optional[str]:
    if not isinstance(body, dict):
        return None
    data = body.get("data")
    result = body.get("result")
    if not isinstance(result, dict):
        result = data.get("result") if isinstance(data, dict) else None
    candidates = [result.get("code") if isinstance(result, dict) else None]
    if isinstance(result, dict):
        candidates.extend([result.get("wx_code"), result.get("login_code")])
    if isinstance(data, dict):
        candidates.extend([data.get("code"), data.get("wx_code"), data.get("login_code")])
    candidates.extend([body.get("wx_code"), body.get("login_code")])
    for value in candidates:
        if isinstance(value, str) and value and value not in {"0", "null", "invalid"}:
            return value
    return None


def fetch_yyb_code(entry: str, appid: str = APPID) -> Optional[str]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    endpoint, sep, ref = entry.rpartition("@")
    if not sep or not endpoint or not ref:
        raise ValueError("YYB_SERVER 格式必须是 地址@账号ref")
    endpoint = endpoint.rstrip("/")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = "http://" + endpoint
    headers = {"Content-Type": "application/json"}
    api_key = (os.getenv("YYB_API_KEY") or os.getenv("YYB_PROTOCOL_TOKEN") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    session = requests.Session()
    session.trust_env = False
    for path in ("/wxapp/getCode", "/wx/code"):
        try:
            response = session.post(
                endpoint + path,
                json={"ref": ref, "app_id": appid},
                headers=headers,
                timeout=30,
            )
            code = extract_wx_code(response.json())
            if code:
                return code
            if response.status_code >= 400:
                print(f"  [YYB] {path} HTTP {response.status_code}")
        except Exception as exc:
            print(f"  [YYB] {path} 请求失败: {type(exc).__name__}")
    return None


def md5_upper(value: str) -> str:
    return hashlib.md5(value.encode()).hexdigest().upper()


def random_text(length: int, alphabet: str) -> str:
    return "".join(random.choice(alphabet) for _ in range(length))


def login_nonce() -> str:
    return random_text(32, "1234567890qwertyuiopasdfghjklzxc")


def business_nonce() -> str:
    return random_text(32, string.ascii_letters + string.digits)


def encrypt_login(plain: str) -> str:
    if AES is None or pad is None:
        raise RuntimeError("缺少 pycryptodome，名创登录需要 AES-128-CBC")
    key = bytes.fromhex(AES_KEY_HEX)
    iv = bytes.fromhex(AES_IV_HEX)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return cipher.encrypt(pad(plain.encode(), AES.block_size)).hex()


def login_by_code(code: str) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    timestamp = str(int(time.time() * 1000))
    nonce = login_nonce()
    plain = json.dumps(
        {"code": code, "appid": APPID, "isreturnuserinfo": 1},
        separators=(",", ":"),
    )
    headers = {
        "content-type": "application/json",
        "version": "storeexpress1.0",
        "tenant-code": "MINISO",
        "can-flash-send": "false",
        "content-sceneid": "1027",
        "x-client-source": "MINISO_WX_MINI",
        "content-longitude": "[object Undefined]",
        "content-latitude": "[object Undefined]",
        "content-weappcode": "",
        "content-appcode": "",
        "content-uid": "",
        "content-skey": "",
        "content-openid": "",
        "content-unionid": "",
        "content-pagetype": quote("首页"),
        "content-pagename": quote("首页"),
        "nonce": nonce,
        "time": timestamp,
        "signature": md5_upper(f"{SIGN_PREFIX}{timestamp}#{nonce}"),
        "charset": "utf-8",
        "referer": f"https://servicewechat.com/{APPID}/1110/page-frame.html",
        "user-agent": UA,
    }
    response = requests.post(
        LOGIN_URL,
        data=encrypt_login(plain),
        headers=headers,
        timeout=30,
    )
    body = response.json()
    data = body.get("data") if isinstance(body, dict) else None
    if int(body.get("code") or 0) != 200 or not isinstance(data, dict) or not data.get("skey"):
        raise RuntimeError(
            f"登录失败: {body.get('message') or body.get('msg') or '未返回 skey'}"
        )
    return {
        "skey": str(data.get("skey") or ""),
        "openid": str(data.get("openid") or ""),
        "unionid": str(data.get("unionid") or ""),
        "uid": str(data.get("uid") or ""),
        "storeId": STORE_ID,
        "updated": int(time.time()),
    }


class MinisoClient:
    def __init__(self, auth: Dict[str, Any]):
        self.auth = auth
        self.last_response: Dict[str, Any] = {}

    def headers(self, sign_base: str) -> Dict[str, str]:
        timestamp = str(int(time.time() * 1000))
        nonce = business_nonce()
        return {
            "Host": "api-saas.miniso.com",
            "content-type": "application/json",
            "version": "storeexpress1.0",
            "tenant-code": "MINISO",
            "tenant": "MINISO",
            "x-mi-version": "5.1.64",
            "x-client-source": "MINISO_WX_MINI",
            "content-weappcode": "52",
            "content-appcode": "51",
            "content-sceneid": "1256",
            "content-pagetype": quote("潮玩签到页面"),
            "content-pagename": quote("潮玩签到页面"),
            "x-mi-store-id": self.auth.get("storeId") or STORE_ID,
            "content-skey": self.auth.get("skey", ""),
            "content-openid": self.auth.get("openid", ""),
            "content-unionid": self.auth.get("unionid", ""),
            "content-uid": self.auth.get("uid", ""),
            "content-latitude": "[object Undefined]",
            "content-longitude": "[object Undefined]",
            "x-mi-city": "",
            "user-agent": UA,
            "accept": "*/*",
            "referer": f"https://servicewechat.com/{APPID}/1084/page-frame.html",
            "can-flash-send": "true",
            "time": timestamp,
            "nonce": nonce,
            "signature": md5_upper(sign_base + timestamp + nonce),
        }

    def get(self, path: str, sign_base: str) -> Dict[str, Any]:
        try:
            response = requests.get(
                API + path, headers=self.headers(sign_base), timeout=30
            )
            result = response.json()
            self.last_response = result
            return result
        except Exception as exc:
            self.last_response = {
                "code": -1,
                "success": False,
                "message": f"网络或响应异常: {type(exc).__name__}",
            }
            raise

    def post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        payload = json.dumps(body, separators=(",", ":"))
        try:
            response = requests.post(
                API + path,
                data=payload,
                headers=self.headers(payload),
                timeout=30,
            )
            result = response.json()
            self.last_response = result
            return result
        except Exception as exc:
            self.last_response = {
                "code": -1,
                "success": False,
                "message": f"网络或响应异常: {type(exc).__name__}",
            }
            raise

    def coin(self) -> Optional[int]:
        result = self.get(
            "/api/virtualCoin/member", "virtualCoinMember"
        )
        self.last_response = result
        if int(result.get("code") or 0) != 200:
            return None
        return int((result.get("data") or {}).get("quantity") or 0)

    def auth_failed(self) -> bool:
        result = getattr(self, "last_response", {}) or {}
        code = int(result.get("code") or 0)
        message = str(result.get("message") or result.get("msg") or "")
        if code == 200 and result.get("success") is True:
            return False
        return code in (401, 403, 4001, 4003, 10401) or bool(
            re.search(r"token|登录|未授权|失效|过期|未登录|鉴权|skey|会话", message, re.I)
        )

    def signin(self) -> str:
        detail = self.get(
            f"/api/activity/signInTask/taskDetail?activityId={ACTIVITY_ID}",
            f"signInTaskDetail{ACTIVITY_ID}",
        )
        self.last_response = detail
        if int(detail.get("code") or 0) != 200:
            raise RuntimeError(
                f"签到详情失败: {detail.get('message') or detail.get('msg') or '未知错误'}"
            )
        task = detail.get("data") or {}
        task_id = task.get("taskId")
        if task_id is None:
            raise RuntimeError("签到任务不存在，activityId 可能已更新")
        days = int(task.get("signInFinishDays") or 0)
        if int(task.get("todaySignInFinishFlag") or 0) == 1:
            return f"今日已签到 · 连续 {days} 天"

        result = self.post(
            "/api/activity/signInTask/award/receive",
            {"activityId": str(ACTIVITY_ID), "taskId": task_id},
        )
        if int(result.get("code") or 0) == 200 and result.get("success") is not False:
            return f"签到成功 · 连续 {days + 1} 天"
        message = str(result.get("message") or result.get("msg") or "")
        if any(word in message for word in ("已签", "签到过", "重复", "已完成", "已领取")):
            return f"今日已签到 · 连续 {days} 天"
        raise RuntimeError(f"签到失败: {message or '未知错误'}")


def load_cache() -> Dict[str, Any]:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def save_cache(cache: Dict[str, Any]) -> None:
    try:
        CACHE_PATH.write_text(
            json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError as exc:
        print(f"  [缓存] 写入失败: {exc}")


def save_auth(entry_ref: str, auth: Dict[str, Any]) -> None:
    cache = load_cache()
    cache[entry_ref] = auth
    save_cache(cache)


def notify(title: str, lines: List[str]) -> None:
    body = "\n".join(f"• {line}" for line in lines if line)
    print(f"\n[{SCRIPT_VERSION}] {title}\n{body}")
    try:
        from notify import send

        send(f"[{SCRIPT_VERSION}] {title}", body)
    except Exception:
        pass


def run_account(entry: YYBEntry, index: int) -> tuple[bool, List[str]]:
    prefix = f"账号{index}"
    cache = load_cache()
    auth = cache.get(entry.ref)
    refreshed = False
    if not isinstance(auth, dict) or not auth.get("skey"):
        code = fetch_yyb_code(f"{entry.endpoint}@{entry.ref}", APPID)
        if not code:
            return False, [f"{prefix} 取码失败"]
        auth = login_by_code(code)
        save_auth(entry.ref, auth)
        refreshed = True

    client = MinisoClient(auth)
    before = client.coin()
    if before is None:
        if not client.auth_failed():
            message = (getattr(client, "last_response", {}) or {}).get("message") or "非鉴权错误"
            return False, [f"{prefix} mini币查询失败: {message}"]
        code = fetch_yyb_code(f"{entry.endpoint}@{entry.ref}", APPID)
        if not code:
            return False, [f"{prefix} 会话失效且取码失败"]
        auth = login_by_code(code)
        client = MinisoClient(auth)
        save_auth(entry.ref, auth)
        refreshed = True
        before = client.coin()
        if before is None:
            return False, [f"{prefix} 登录后仍无法读取 mini币"]

    try:
        result = client.signin()
    except RuntimeError as exc:
        if client.auth_failed():
            cache = load_cache()
            cache.pop(entry.ref, None)
            save_cache(cache)
        return False, [f"{prefix} {exc}"]
    after = client.coin()
    change = "?" if after is None else f"{before} → {after}"
    suffix = " · 重新取码登录" if refreshed else ""
    return True, [f"{prefix} {result} · mini币 {change}{suffix}"]


def main() -> int:
    entries = parse_yyb_entries()
    if not entries:
        print("未配置 YYB_SERVER（格式：地址@账号ref，多账号换行）")
        return 1
    lines = []
    ok_flags = []
    for index, entry in enumerate(entries, 1):
        print(f"账号{index}/{len(entries)} {mask_entry(entry)}")
        try:
            ok, result = run_account(entry, index)
            lines.extend(result)
            ok_flags.append(ok)
        except Exception as exc:
            lines.append(f"账号{index} 执行异常: {str(exc)[:160]}")
            ok_flags.append(False)
        if index < len(entries):
            time.sleep(1.5)
    notify("名创优品", lines)
    return 0 if ok_flags and all(ok_flags) else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main())

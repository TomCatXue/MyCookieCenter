#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
林里 · 微信小程序每日签到（独立脚本）

new Env('林里')
cron: 10 10 * * *
tag: 微信小程序

环境变量：
  YYB_SERVER         取码服务，格式：地址@账号ref（多账号换行）
  LINLI_STORE_ID     企迈门店 ID（小程序 app-config 的 ext.storeId）
  LINLI_ACTIVITY_ID  签到活动 ID，从林里签到页请求体抓取
  YYB_API_KEY        可选，取码服务 Bearer Token

林里使用企迈 qmai 平台。wx.login code 只解决登录；门店和活动 ID 是业务路由参数，
无法由 code 推导。活动 ID 可从「我的」页图片热区 linkType=newCheckIn 读取。

链路：YYB getCode -> mini-app-login -> Qm-User-Token -> 签到状态 -> 签到
"""
import base64
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

try:
    import requests
except ImportError:
    requests = None

try:
    from Crypto.Cipher import AES
except ImportError:
    AES = None

SCRIPT_VERSION = "2026-10-24.r1"
APPID = "wx26c7aaacfa017719"
BASE = "https://webapi.qmai.cn/web"
LOGIN_URL = f"{BASE}/account-center/oauth/mini-app-login"
SIGN_BASE = f"{BASE}/cmk-center/sign"
QM_KEY_RAW = "mN6KpXq8Sv2WxYz9LdFcRgHjMnBvCtDxZaS3QwE5rT0yU7I4O1A"
QM_KEY_VERSION = "1.0.0"
CACHE_PATH = Path(__file__).with_name(".linli_cache.json")
UA = (
    "Mozilla/5.0 (Linux; Android 16; wv) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 "
    "MicroMessenger/8.0.65.2960 MiniProgramEnv/Android"
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
            body = response.json()
            code = extract_wx_code(body)
            if code:
                return code
            if response.status_code >= 400:
                print(f"  [YYB] {path} HTTP {response.status_code}")
        except Exception as exc:
            print(f"  [YYB] {path} 请求失败: {type(exc).__name__}")
    return None


def require_linli_context() -> tuple[str, str]:
    store_id = (os.getenv("LINLI_STORE_ID") or "").strip()
    activity_id = (os.getenv("LINLI_ACTIVITY_ID") or "").strip()
    missing = []
    if not store_id:
        missing.append("LINLI_STORE_ID")
    if not activity_id:
        missing.append("LINLI_ACTIVITY_ID")
    if missing:
        raise RuntimeError(
            f"缺少 {' / '.join(missing)}；wx.login code 无法替代企迈门店与活动路由参数"
        )
    return store_id, activity_id


def _b64relax(value: str) -> bytes:
    return base64.b64decode(value + "=" * ((4 - len(value) % 4) % 4))


def _qm_key() -> bytes:
    raw = _b64relax(QM_KEY_RAW)
    return raw[:32].ljust(32, b"\x00")


def qm_headers(store_id: str, token: str = "") -> Dict[str, str]:
    return {
        "Accept": "v=1.0",
        "Content-Type": "application/json",
        "xweb_xhr": "1",
        "Qm-From-Type": "catering",
        "Qm-From": "wechat",
        "scene": "1101",
        "store-id": store_id,
        "multi-store-id": "",
        "Accept-Language": "zh-CN",
        "Qm-User-Token": token,
        "User-Agent": UA,
        "Referer": f"https://servicewechat.com/{APPID}/0/page-frame.html",
    }


def _gcm_encrypt(plain: str, iv: bytes) -> str:
    cipher = AES.new(_qm_key(), AES.MODE_GCM, nonce=iv)
    encrypted, tag = cipher.encrypt_and_digest(plain.encode())
    return base64.b64encode(encrypted + tag).decode()


def _gcm_decrypt(payload: str, iv: bytes) -> str:
    raw = _b64relax(payload)
    cipher = AES.new(_qm_key(), AES.MODE_GCM, nonce=iv)
    return cipher.decrypt_and_verify(raw[:-16], raw[-16:]).decode()


def login_by_code(store_id: str, code: str) -> Dict[str, Any]:
    body = qm_encrypted_post(
        LOGIN_URL,
        store_id or "0",
        "",
        {"code": code, "eVersion": "1.0"},
    )
    data = body.get("data") if isinstance(body, dict) else None
    token = data.get("token") if isinstance(data, dict) else None
    if body.get("status") is not True or int(body.get("code") or 0) != 0 or not token:
        raise RuntimeError(
            "林里登录失败: "
            f"code={body.get('code')} "
            f"{body.get('message') or body.get('msg') or '未返回 token'}"
        )
    return {"token": str(token), "data": data}


def qm_encrypted_post(
    url: str, store_id: str, token: str, payload: Dict[str, Any]
) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    if AES is None:
        raise RuntimeError("缺少 pycryptodome，林里接口需要 AES-GCM")
    iv = os.urandom(12)
    obj = dict(payload)
    obj.setdefault("appid", APPID)
    meta = base64.b64encode(
        json.dumps(
            {
                "version": QM_KEY_VERSION,
                "timestamp": int(time.time() * 1000),
                "iv": base64.b64encode(iv).decode(),
            },
            separators=(",", ":"),
        ).encode()
    ).decode()
    headers = qm_headers(store_id, token)
    headers["QM-Encrypt-Meta"] = meta
    response = requests.post(
        url,
        json={"payload": _gcm_encrypt(json.dumps(obj, separators=(",", ":")), iv)},
        headers=headers,
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(f"林里接口 HTTP {response.status_code}")
    try:
        body = response.json()
    except ValueError as exc:
        raise RuntimeError("林里接口返回非 JSON（可能被网关拦截）") from exc
    if isinstance(body, dict) and isinstance(body.get("payload"), str):
        headers_lower = {key.lower(): value for key, value in response.headers.items()}
        rmeta = headers_lower.get("qm-encrypt-meta")
        if not rmeta:
            raise RuntimeError("林里响应已加密，但缺少 QM-Encrypt-Meta")
        meta_obj = json.loads(_b64relax(rmeta).decode())
        return json.loads(_gcm_decrypt(body["payload"], _b64relax(meta_obj["iv"])))
    return body


def qm_post(
    path: str, store_id: str, token: str, payload: Dict[str, Any]
) -> Dict[str, Any]:
    return qm_encrypted_post(SIGN_BASE + path, store_id, token, payload)


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


def save_token(entry_ref: str, token: str) -> None:
    cache = load_cache()
    cache[entry_ref] = {"token": token, "updated": int(time.time())}
    save_cache(cache)


def notify(title: str, lines: List[str]) -> None:
    body = "\n".join(f"• {line}" for line in lines if line)
    print(f"\n[{SCRIPT_VERSION}] {title}\n{body}")
    try:
        from notify import send

        send(f"[{SCRIPT_VERSION}] {title}", body)
    except Exception:
        pass


def run_account(entry: YYBEntry, index: int, total: int = 1) -> tuple[bool, List[str]]:
    prefix = f"账号{index}"
    store_id = (os.getenv("LINLI_STORE_ID") or "").strip()
    activity_id = (os.getenv("LINLI_ACTIVITY_ID") or "").strip()
    try:
        require_linli_context()
    except RuntimeError as exc:
        return False, [f"{prefix} CONFIG ERROR: {exc}"]

    code = fetch_yyb_code(f"{entry.endpoint}@{entry.ref}", APPID)
    if not code:
        return False, [f"{prefix} 取码失败"]

    try:
        auth = login_by_code(store_id, code)
    except RuntimeError as exc:
        return False, [f"{prefix} {exc}"]
    token = auth["token"]
    save_token(entry.ref, token)

    stats = qm_post(
        "/userSignStatistics",
        store_id,
        token,
        {"activityId": activity_id, "storeId": store_id},
    )
    if stats.get("status") is not True:
        message = stats.get("message") or stats.get("msg") or str(stats)[:100]
        return False, [f"{prefix} 状态查询失败: {message}"]

    data = stats.get("data") or {}
    if int(data.get("signStatus") or 0) == 1:
        return True, [f"{prefix} 今日已签到 · 连续 {data.get('signDays', '?')} 天"]

    result = qm_post(
        "/takePartInSign",
        store_id,
        token,
        {"activityId": activity_id, "storeId": store_id},
    )
    message = str(result.get("message") or result.get("msg") or "")
    if result.get("status") is True:
        after = qm_post(
            "/userSignStatistics",
            store_id,
            token,
            {"activityId": activity_id, "storeId": store_id},
        )
        days = ((after.get("data") or {}).get("signDays")) or "?"
        rewards = [
            f"+{item.get('sendNum', 1)} {item.get('rewardName')}"
            for item in ((result.get("data") or {}).get("rewardDetailList") or [])
            if item.get("rewardName")
        ]
        suffix = f" · {'、'.join(rewards)}" if rewards else ""
        return True, [f"{prefix} 签到成功 · 连续 {days} 天{suffix}"]
    if "已签" in message or "重复" in message:
        return True, [f"{prefix} 今日已签到"]
    return False, [f"{prefix} 签到失败: {message or str(result)[:100]}"]


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
            ok, result = run_account(entry, index, len(entries))
            lines.extend(result)
            ok_flags.append(ok)
        except Exception as exc:
            lines.append(f"账号{index} 执行异常: {str(exc)[:160]}")
            ok_flags.append(False)
        if index < len(entries):
            time.sleep(1.5)
    notify("林里", lines)
    return 0 if ok_flags and all(ok_flags) else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main())

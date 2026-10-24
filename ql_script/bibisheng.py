#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
笔笔省 · 微信支付「笔笔省」每日免费券（独立脚本）

new Env('笔笔省')
cron: 30 7 * * *
tag: 微信小程序

环境变量：
  YYB_SERVER   取码服务，格式：地址@账号ref（多账号换行）
  YYB_API_KEY  可选，取码服务 Bearer Token

链路：YYB getCode -> GET /txbbs-user/user/login (jscode) -> Session-Token
      -> 拉取天天领券列表 -> 领取每日免费券

注意：session-token 是短效会话；每次运行优先通过 YYB 取新 code 登录，
缓存仅记录最近一次会话供排障，不把 code 落盘。
"""
import json
import os
import secrets
import string
import sys
import time
import gzip
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

try:
    import requests
except ImportError:
    requests = None


SCRIPT_VERSION = "2026-10-24.r1"
APPID = "wxdb3c0e388702f785"
HOST = "discount.wxpapp.wechatpay.cn"
BASE = f"https://{HOST}"
LOGIN = "/txbbs-user/user/login"
QUERY_COUPONS = "/txbbs-mall/coupon/querydailygiftcoupons"
CLAIM_COUPON = "/txbbs-mall/coupon/claimdailygiftcoupon"
CACHE_PATH = Path(__file__).with_name(".bibisheng_cache.json")
UA = (
    "Mozilla/5.0 (Linux; Android 12; M2012K11AC Build/SKQ1.220303.001; wv) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/134.0.6998.136 "
    "Mobile Safari/537.36 XWEB/1340129 MMWEBSDK/20240301 MMWEBID/9871 "
    "MicroMessenger/8.0.48.2580(0x28003036) WeChat/arm64 Weixin "
    "NetType/WIFI Language/zh_CN ABI/arm64 MiniProgramEnv/android"
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


def make_track_id() -> str:
    return "T" + "".join(secrets.choice("0123456789ABCDEF") for _ in range(31))


def make_session_id() -> str:
    alphabet = string.ascii_lowercase + string.digits
    suffix = "".join(secrets.choice(alphabet) for _ in range(10))
    return f"daily_reward-{int(time.time() * 1000)}-{suffix}"


def api_headers(
    token: str = "",
    jscode: str = "",
    track_id: str = "",
    session_id: str = "",
) -> Dict[str, str]:
    headers = {
        "Host": HOST,
        "User-Agent": UA,
        "Accept": "*/*",
        "Content-Type": "application/json",
        "X-Appid": APPID,
        "X-Module-Name": "mmpaytxbbsmp",
        "X-Page": "pages/gift/index",
        "X-Track-Id": track_id or make_track_id(),
        "xweb_xhr": "1",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Referer": f"https://servicewechat.com/{APPID}/180/page-frame.html",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }
    if session_id:
        headers["session-id"] = session_id
    if jscode:
        headers["jscode"] = jscode
    if token:
        headers["Session-Token"] = token
    return headers


def request_json(
    method: str,
    path: str,
    token: str = "",
    jscode: str = "",
    body: Any = None,
    track_id: str = "",
) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    response = requests.request(
        method,
        BASE + path,
        headers=api_headers(token, jscode, track_id),
        json=body if method == "POST" else None,
        timeout=25,
    )
    try:
        return response.json()
    except ValueError:
        raw = response.content
        for decoder in (
            lambda value: gzip.decompress(value),
            lambda value: zlib.decompress(value, -zlib.MAX_WBITS),
            lambda value: zlib.decompress(value),
        ):
            try:
                return json.loads(decoder(raw).decode("utf-8"))
            except Exception:
                continue
        return {"errcode": -1, "errmsg": f"HTTP {response.status_code}: {response.text[:120]}"}


def login_with_code(code: str) -> str:
    res = request_json("GET", LOGIN, jscode=code, track_id=make_track_id())
    data = res.get("data") if isinstance(res, dict) else None
    token = data.get("session_token") if isinstance(data, dict) else None
    if int(res.get("errcode", -1)) != 0 or not token:
        raise RuntimeError(
            f"登录失败: {res.get('errmsg') or res.get('msg') or '未返回 session_token'}"
        )
    return str(token)


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


def query_daily_coupons(token: str, track_id: str) -> Dict[str, Any]:
    return request_json("GET", QUERY_COUPONS, token, track_id=track_id)


def claim_daily_coupon(
    token: str,
    coupon_id: int,
    daily_gift_type: str,
    expected_send_amount: int,
    exposure_token: str,
    track_id: str,
) -> Dict[str, Any]:
    return request_json(
        "POST",
        CLAIM_COUPON,
        token,
        body={
            "daily_gift_type": daily_gift_type,
            "coupon_id": coupon_id,
            "expected_send_amount": expected_send_amount,
            "exposure_token": exposure_token,
        },
        track_id=track_id,
    )


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
    code = fetch_yyb_code(f"{entry.endpoint}@{entry.ref}", APPID)
    if not code:
        return False, [f"{prefix} 取码失败"]

    try:
        token = login_with_code(code)
    except RuntimeError as exc:
        return False, [f"{prefix} {exc}"]

    save_token(entry.ref, token)

    track_id = make_track_id()
    result = query_daily_coupons(token, track_id)
    if int(result.get("errcode", -1)) != 0:
        return False, [f"{prefix} 拉券失败: {result.get('errmsg') or '未知错误'}"]
    data = result.get("data") or {}
    items = data.get("coupon_items") or []
    exposure_token = str(data.get("exposure_token") or "")
    pending = [item for item in items if item.get("is_claimed") is not True]
    if pending and not exposure_token:
        return False, [f"{prefix} 拉券返回缺少 exposure_token，已停止领取"]
    claimed = len(items) - len(pending)
    if not pending:
        return True, [f"{prefix} 今日已领 {claimed} 张 · 暂无可领券"]

    got = []
    failed = []
    for item in pending:
        info = item.get("coupon_info") or {}
        coupon_id = info.get("coupon_id")
        if not isinstance(coupon_id, int):
            failed.append("券缺少整数 coupon_id")
            continue
        expected_amount = item.get("expected_send_amount")
        if expected_amount is None:
            expected_amount = info.get("face_value")
        res = claim_daily_coupon(
            token,
            coupon_id,
            str(item.get("daily_gift_type") or "DGCT_PLATFORM"),
            int(expected_amount if expected_amount is not None else 0),
            exposure_token,
            track_id,
        )
        if int(res.get("errcode", -1)) == 0:
            granted = (res.get("data") or {}).get("coupon_item") or {}
            granted_info = granted.get("coupon_info") or {}
            got.append(granted_info.get("name") or info.get("name") or "优惠券")
        else:
            failed.append(str(res.get("errmsg") or res.get("msg") or "领取失败"))
        time.sleep(1.5)

    parts = [f"领取 {len(got)} 张" if got else "未领到券"]
    if got:
        parts.append("、".join(got[:4]))
    if failed:
        parts.append(f"失败 {len(failed)} 张")
    if claimed:
        parts.append(f"另有 {claimed} 张今日已领")
    return not failed, [f"{prefix} " + " · ".join(parts)]


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
    notify("笔笔省", lines)
    return 0 if ok_flags and all(ok_flags) else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main())

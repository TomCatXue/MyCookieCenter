#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
惠省红包墙 · 微信小程序自动领券（独立脚本）

new Env('惠省')
cron: 5 0 * * *
tag: 微信小程序

环境变量：
  YYB_SERVER   取码服务，格式：地址@账号ref（多账号换行）
  YYB_API_KEY  可选，取码服务 Bearer Token

链路：YYB getCode -> 美团开放平台 weapplogin -> wm_logintoken/openId/openIdCipher
      -> 红包墙列表 -> grantActivityCoupon 一键领取

验证状态：登录与红包墙接口按社区已披露契约实现；惠省活动可能轮换且带美团风控，
首次接入需真机跑一次确认。失败会输出具体阶段，不伪装成功。
"""
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, urlsplit

try:
    import requests
except ImportError:
    requests = None


SCRIPT_VERSION = "2026-10-24.r1"
APPID = "wx0b42a347aafbe0d0"
OPEN_LOGIN = "https://open.meituan.com/user/v1/weapplogin"
HOST = "https://media.meituan.com"
LIST_PATH = "/fulishemini/couponActivity/listActivityCoupon"
GRANT_PATH = "/fulishemini/couponActivity/grantActivityCoupon"
CACHE_PATH = Path(__file__).with_name(".huisheng_cache.json")
APP_NAME = "group"
APP_VERSION = "1.52.0"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 "
    "MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI "
    "MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13) "
    "UnifiedPCWindowsWechat(0xf2541c37) XWEB/25364"
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


def login_headers() -> Dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "*/*",
        "xweb_xhr": "1",
        "Referer": f"https://servicewechat.com/{APPID}/270/page-frame.html",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }


def _pick_token(data: Any) -> Optional[str]:
    if not isinstance(data, dict):
        return None
    candidates = [data.get("token"), data.get("wm_logintoken"), data.get("accessToken")]
    inner = data.get("data")
    if isinstance(inner, dict):
        candidates.extend(
            [inner.get("token"), inner.get("wm_logintoken"), inner.get("accessToken")]
        )
        user = inner.get("user")
        if isinstance(user, dict):
            candidates.extend(
                [user.get("token"), user.get("wm_logintoken"), user.get("accessToken")]
            )
    for value in candidates:
        if isinstance(value, str) and value and value != "null":
            return value
    return None


def login_by_code(code: str) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    response = requests.post(
        OPEN_LOGIN,
        data={"code": code, "appName": APP_NAME},
        headers=login_headers(),
        timeout=30,
    )
    body = response.json()
    token = _pick_token(body)
    inner = body.get("data") if isinstance(body, dict) else {}
    inner = inner if isinstance(inner, dict) else {}
    open_id = (
        body.get("openId")
        or inner.get("openId")
        or inner.get("open_id")
    )
    open_id_cipher = body.get("openIdCipher") or inner.get("openIdCipher")
    if not token or not open_id or not open_id_cipher:
        raise RuntimeError(
            "惠省登录失败: "
            + str(body.get("message") or body.get("msg") or "未返回 token/openId/openIdCipher")
        )
    return {
        "token": str(token),
        "open_id": str(open_id),
        "open_id_cipher": str(open_id_cipher),
        "union_id": inner.get("unionId") or inner.get("unionid") or "",
        "user_id": inner.get("userId") or inner.get("userid") or "",
        "updated": int(time.time()),
    }


def wall_query() -> str:
    return urlencode(
        {
            "yodaReady": "wx",
            "csecappid": APPID,
            "csecplatform": "3",
            "csecversionname": APP_VERSION,
            "csecversion": "1.3.0",
        }
    )


def wall_headers(auth: Dict[str, Any]) -> Dict[str, str]:
    device = auth.get("device") if isinstance(auth.get("device"), dict) else {}
    return {
        "Host": urlsplit(HOST).hostname or "",
        "geographyInfo": "%7B%7D",
        "csecuuid": str(device.get("wm_uuid") or ""),
        "x-env": "online",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        "Accept": "*/*",
        "xweb_xhr": "1",
        "openIdCipher": str(auth.get("open_id_cipher") or ""),
        "openId": str(auth.get("open_id") or ""),
        "csecuserid": str(auth.get("user_id") or ""),
        "token": str(auth.get("token") or ""),
        "Referer": f"https://servicewechat.com/{APPID}/270/page-frame.html",
        "Accept-Language": "zh-CN,zh;q=0.9",
    }


def base_wall_body(auth: Dict[str, Any], event_time: int) -> Dict[str, Any]:
    device = auth.get("device") if isinstance(auth.get("device"), dict) else {}
    try:
        latitude = int(os.getenv("HUISHENG_LATITUDE", "23083309"))
        longitude = int(os.getenv("HUISHENG_LONGITUDE", "113317200"))
    except ValueError:
        latitude, longitude = 23083309, 113317200
    return {
        "wm_did": "",
        "wm_mac": "",
        "waimai_sign": "/",
        "wm_ctype": "fulishe_wxapp",
        "wm_dtype": "microsoft",
        "wm_dversion": "10.0.19045",
        "wm_dplatform": "windows",
        "wm_uuid": device.get("wm_uuid") or "1457266102798364772",
        "wm_visitid": device.get("wm_visitid")
        or "90357da0-9471-4a38-af91-bb7338fb81b7",
        "wm_appversion": APP_VERSION,
        "wm_logintoken": auth["token"],
        "wm_user_id": auth.get("user_id") or "",
        "wm_open_id": auth["open_id"],
        "wm_open_id_cipher": auth["open_id_cipher"],
        "unpl": str(auth.get("unpl") or ""),
        "req_time": event_time,
        "userid": auth.get("user_id") or "",
        "user_id": auth.get("user_id") or "",
        "lch": 1260,
        "wm_uuid_source": "server",
        "hostAppVersion": "",
        "open_id": auth["open_id"],
        "unionid": auth.get("union_id") or "",
        "fp_platform": 13,
        "appId": APPID,
        "expoId": auth["open_id_cipher"],
        "cPosition": 1005,
        "pBizLine": 9000,
        "pSubCode": 30300,
        "finger_applets": "",
        "requestType": 0,
        "requestSource": 1,
        "couponActivityScene": 1,
        "osType": "Windows",
        "distributorChannel": 0,
        "wm_latitude": latitude,
        "wm_longitude": longitude,
        "wm_actual_latitude": latitude,
        "wm_actual_longitude": longitude,
        "actual_city_id_level2": os.getenv("HUISHENG_CITY_ID_LEVEL2", "440100"),
        "actual_city_id_level3": os.getenv("HUISHENG_CITY_ID_LEVEL3", "440105"),
        "city_id_level2": os.getenv("HUISHENG_CITY_ID_LEVEL2", "440100"),
        "city_id_level3": os.getenv("HUISHENG_CITY_ID_LEVEL3", "440105"),
    }


def wall_post(
    path: str, auth: Dict[str, Any], body: Dict[str, Any]
) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    response = requests.post(
        f"{HOST}{path}?{wall_query()}",
        data=json.dumps(body, separators=(",", ":")).encode(),
        headers=wall_headers(auth),
        timeout=30,
    )
    try:
        return response.json()
    except ValueError:
        return {
            "code": -1,
            "message": f"HTTP {response.status_code}: {response.text[:160]}",
        }


def build_tabs(list_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    plans: Dict[str, List[str]] = {}
    seen = set()
    source = list_data.get("list") or []
    pre_grant = list_data.get("preGrantList") or []
    for item in source + pre_grant:
        payload = item.get("data") if isinstance(item, dict) else None
        if not isinstance(payload, dict):
            continue
        plan, right = payload.get("planCode"), payload.get("rightCode")
        if not plan or not right or payload.get("couponViewId"):
            continue
        if str(right) in seen:
            continue
        seen.add(str(right))
        plans.setdefault(str(plan), [])
        if str(right) not in plans[str(plan)]:
            plans[str(plan)].append(str(right))
    if plans:
        return [{"planCode": p, "rightCodes": codes} for p, codes in plans.items()]
    if source or pre_grant:
        return []
    config = list_data.get("config") or {}
    for tab in config.get("tabList") or []:
        if isinstance(tab, dict) and tab.get("planCode"):
            return [
                {
                    "planCode": str(tab["planCode"]),
                    "rightCodes": tab.get("rightCodes") or [],
                }
            ]
    return []


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


def attach_device(auth: Dict[str, Any], entry_ref: str) -> Dict[str, Any]:
    cache = load_cache()
    record = cache.get(entry_ref) if isinstance(cache.get(entry_ref), dict) else {}
    cached_auth = record.get("auth") if isinstance(record.get("auth"), dict) else {}
    device = record.get("device") if isinstance(record.get("device"), dict) else None
    if not device and isinstance(cached_auth.get("device"), dict):
        device = cached_auth["device"]
    if not device or not device.get("wm_uuid") or not device.get("wm_visitid"):
        device = {
            "wm_uuid": f"9{os.urandom(8).hex()}",
            "wm_visitid": (
                f"{os.urandom(4).hex()}-{os.urandom(2).hex()}-"
                f"{os.urandom(2).hex()}-{os.urandom(2).hex()}-{os.urandom(6).hex()}"
            ),
        }
    saved_auth = {**cached_auth, **auth}
    saved_auth["device"] = device
    record["auth"] = saved_auth
    for stale_key in ("token", "open_id", "open_id_cipher", "user_id", "union_id"):
        record.pop(stale_key, None)
    record["device"] = device
    cache[entry_ref] = record
    save_cache(cache)
    auth.update(saved_auth)
    cache[entry_ref] = record
    return auth


def mark_right_codes(entry_ref: str, right_codes: List[str]) -> None:
    cache = load_cache()
    record = cache.get(entry_ref) if isinstance(cache.get(entry_ref), dict) else {}
    used = record.get("used_right_codes")
    if not isinstance(used, dict):
        used = {}
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    used[today] = sorted(set(used.get(today) or []) | set(right_codes))
    record.update({"used_right_codes": used, "updated": int(time.time())})
    cache[entry_ref] = record
    save_cache(cache)


def known_right_codes(entry_ref: str) -> set:
    cache = load_cache()
    record = cache.get(entry_ref) if isinstance(cache.get(entry_ref), dict) else {}
    used = record.get("used_right_codes")
    if not isinstance(used, dict):
        return set(record.get("used_right_codes") or []) if isinstance(used, list) else set()
    today = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    return set(used.get(today) or [])


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
        auth = login_by_code(code)
    except RuntimeError as exc:
        return False, [f"{prefix} {exc}"]
    attach_device(auth, entry.ref)

    body = base_wall_body(auth, int(time.time() * 1000))
    listing = wall_post(LIST_PATH, auth, body)
    success_codes = (0, 200, "0", "200")
    if listing.get("code") not in success_codes and (
        listing.get("message") or listing.get("msg") or ""
    ):
        # 美团券活动接口错误壳存在 code/message 与 status/msg 两种写法。
        detail = str(listing.get("message") or listing.get("msg"))
        if "登录" in detail or "token" in detail.lower() or "未授权" in detail:
            return False, [f"{prefix} 登录态被拒绝: {detail}"]
    if listing.get("code") not in success_codes:
        return False, [
            f"{prefix} 拉券列表失败: "
            + str(listing.get("message") or listing.get("msg") or listing.get("code"))
        ]
    data = listing.get("data") or {}
    config = data.get("config") or {}
    tabs = build_tabs(data)
    if not (data.get("list") or data.get("preGrantList") or (data.get("config") or {}).get("tabList")):
        return False, [f"{prefix} 拉券返回缺少券列表结构"]
    already_sent = known_right_codes(entry.ref)
    filtered_tabs = []
    for tab in tabs:
        codes = [code for code in tab.get("rightCodes") or [] if code not in already_sent]
        if codes:
            filtered_tabs.append({"planCode": tab.get("planCode"), "rightCodes": codes})
    tabs = filtered_tabs
    if not tabs:
        return True, [f"{prefix} 今日无可领券包"]

    grant_body = dict(body)
    grant_body.update(
        {
            "req_time": int(time.time() * 1000),
            "tabs": tabs,
            "activityName": config.get("activityName") or "惠省红包墙活动配置",
            "activityCode": config.get("activityCode") or "101357000",
            "activityScene": 1,
            "preGrantSource": 2,
            "recallToken": data.get("recallToken") or "",
            "sessionId": (
                f"{os.urandom(6).hex()[:11]}-{os.urandom(2).hex()}-"
                f"{os.urandom(2).hex()}-{os.urandom(2).hex()}"
            ),
            "pageId": "c_waimai_7hs96y41",
            "moduleId": "b_waimai_gci8oda9_mc",
            "pSubCode": 30301,
        }
    )
    time.sleep(0.5)
    granted = wall_post(GRANT_PATH, auth, grant_body)
    if granted.get("code") not in success_codes:
        return False, [
            f"{prefix} 领券失败: "
            + str(granted.get("message") or granted.get("msg") or granted.get("code"))
        ]
    mark_right_codes(
        entry.ref,
        [code for tab in tabs for code in tab.get("rightCodes") or []],
    )

    coupons = []
    value = 0
    for tab in (granted.get("data") or {}).get("tabs") or []:
        for coupon in tab.get("couponList") or []:
            if coupon.get("status") in (0, 10):
                coupons.append(coupon.get("couponName") or "优惠券")
                value += int(coupon.get("couponValue") or 0)
    if coupons:
        return True, [f"{prefix} 领到 {len(coupons)} 张 · ¥{value / 100:.2f} · {'、'.join(coupons[:4])}"]
    return True, [f"{prefix} 本批无新增券（可能已领过）"]


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
    notify("惠省", lines)
    return 0 if ok_flags and all(ok_flags) else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main())

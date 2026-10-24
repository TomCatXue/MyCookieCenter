#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
海底捞 · 微信小程序每日签到（独立脚本）

new Env('海底捞')
cron: 23 7 * * *
tag: 微信小程序

环境变量：
  YYB_SERVER   取码服务，格式：地址@账号ref（多账号换行）
  YYB_API_KEY  可选，取码服务 Bearer Token

链路：YYB getCode -> /api/gateway/login/center/login/wechatLogin
      -> _haidilao_app_token -> 签到 -> 碎片余额

验证状态：登录接口按「codeType=1 + code」契约实现。上游公开脚本对这条
登录链路仍标注“推断、待真机核对”，因此脚本不会把未确认的 200 响应当成已验收；
失败时会保留服务端原始提示。
"""
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


SCRIPT_VERSION = "2026-10-24.r1"
APPID = "wx1ddeb67115f30d1a"
BASE = "https://superapp-public.kiwa-tech.com"
LOGIN_URL = f"{BASE}/api/gateway/login/center/login/wechatLogin"
SIGN_URL = f"{BASE}/activity/wxapp/signin/signin"
FRAGMENT_URL = f"{BASE}/activity/wxapp/signin/queryFragment"
CACHE_PATH = Path(__file__).with_name(".haidilao_cache.json")
UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 "
    "MicroMessenger/8.0.50(0x18003230) NetType/WIFI Language/zh_CN "
    "miniProgram/wx1ddeb67115f30d1a"
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


def common_headers(token: str = "") -> Dict[str, str]:
    headers = {
        "User-Agent": UA,
        "Content-Type": "application/json",
        "Accept": "*/*",
        "platformname": "wechat",
        "appid": "15",
        "appname": "HDLMember",
        "appversion": "3.257.0",
        "xweb_xhr": "1",
        "Referer": f"https://servicewechat.com/{APPID}/236/page-frame.html",
    }
    if token:
        headers["_haidilao_app_token"] = token
    return headers


def extract_token(body: Any) -> Optional[str]:
    if not isinstance(body, dict):
        return None
    candidates = [body.get("token"), body.get("accessToken"), body.get("access_token")]
    data = body.get("data")
    if isinstance(data, dict):
        candidates.extend(
            [data.get("token"), data.get("accessToken"), data.get("access_token")]
        )
    for value in candidates:
        if isinstance(value, str) and value and value != "null":
            return value
    return None


def login_by_code(code: str) -> str:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    response = requests.post(
        LOGIN_URL,
        json={
            "type": 1,
            "country": "CN",
            "codeType": 1,
            "code": code,
            "business": "登录",
            "terminal": "会员小程序",
        },
        headers=common_headers(),
        timeout=30,
    )
    if response.status_code in (401, 403):
        raise RuntimeError(f"登录失败: HTTP {response.status_code}")
    if response.status_code >= 500:
        raise RuntimeError(f"登录失败: 服务端 HTTP {response.status_code}，可稍后重试")
    if response.status_code != 200:
        raise RuntimeError(f"登录失败: HTTP {response.status_code}")
    try:
        body = response.json()
    except ValueError as exc:
        raise RuntimeError("登录失败: 网关返回非 JSON") from exc
    token = extract_token(body)
    if not token:
        message = body.get("msg") or body.get("message") or "未返回 token"
        raise RuntimeError(f"登录失败: {message}")
    return token


def api_post(url: str, token: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if requests is None:
        raise RuntimeError("缺少 requests，请先安装")
    response = requests.post(
        url,
        json=body if body is not None else {},
        headers=common_headers(token),
        timeout=30,
    )
    try:
        return response.json()
    except ValueError:
        return {
            "success": False,
            "msg": f"HTTP {response.status_code}: {response.text[:160]}",
        }


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
    if not entry_ref or not token:
        return
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


def run_account(entry: YYBEntry, index: int) -> tuple[bool, List[str]]:
    prefix = f"账号{index}"
    cached = load_cache().get(entry.ref)
    cached_token = cached.get("token") if isinstance(cached, dict) else ""
    if cached_token:
        probe = api_post(FRAGMENT_URL, cached_token)
        if probe.get("success") is True:
            token = cached_token
            reuse = True
        else:
            reuse = False
    else:
        reuse = False
    if reuse:
        code = None
    else:
        code = fetch_yyb_code(f"{entry.endpoint}@{entry.ref}", APPID)
    if not reuse:
        if not code:
            return False, [f"{prefix} 取码失败"]
        try:
            token = login_by_code(code)
        except RuntimeError as exc:
            return False, [f"{prefix} {exc}"]
        save_token(entry.ref, token)

    sign = api_post(SIGN_URL, token, {"signinSource": "MiniApp"})
    message = str(sign.get("msg") or sign.get("message") or "")
    if sign.get("success") is not True:
        if any(word in message for word in ("已签", "重复", "已完成")):
            return True, [f"{prefix} 今日已签到"]
        return False, [f"{prefix} 签到失败: {message or str(sign)[:120]}"]

    details = (sign.get("data") or {}).get("signinQueryDetailList") or []
    today = next((x for x in details if x.get("currentOr") == 1), {})
    status = today.get("dailySigninStatus")
    if not today:
        return False, [f"{prefix} 签到结果待确认: 未返回今日记录"]
    if status == 1:
        summary = "今日已签到"
    else:
        reward = []
        if today.get("fragment"):
            reward.append(f"碎片 {today['fragment']}")
        if today.get("growthSeries"):
            reward.append(f"成长值 {today['growthSeries']}")
        if today.get("dishes"):
            reward.append(f"菜品 {today['dishes']}")
        summary = "签到成功" + (f" · {'、'.join(reward)}" if reward else "")
    if today.get("daysSeries"):
        summary += f" · 连签 {today['daysSeries']} 天"

    fragment = api_post(FRAGMENT_URL, token)
    if fragment.get("success"):
        total = (fragment.get("data") or {}).get("total")
        if total is not None:
            summary += f" · 共 {total} 碎片"
    return True, [f"{prefix} {summary}{' · 缓存会话' if reuse else ''}"]


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
    notify("海底捞", lines)
    return 0 if ok_flags and all(ok_flags) else 1


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    sys.exit(main())

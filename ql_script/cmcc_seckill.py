#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中国移动 App · 签到有礼场次秒杀（独立脚本）

说明：场次秒杀的时间与奖品会轮换（上一期 5 元券、第二期 1 元券，时段也不固定），
因此本脚本不写死 cron。推荐流程：
  1. 先跑 `python3 cmcc_seckill.py --dry-run` 看真实排期，并会自动推送下一场时间与建议 cron；
  2. 按提示到面板里设置/调整签到（或本秒杀脚本）的定时任务；
  3. 确认后直接跑 `python3 cmcc_seckill.py`（自动等到下一场开抢）或 `--at HH:MM` 定向抢。

秒杀资格要求当日已完成签到（markStatus == marked）；脚本会自动补签一次。

new Env('中国移动 · 场次秒杀')
cron: 0 0 * * *
tag: 中国移动

用法：
  python3 cmcc_seckill.py --dry-run    # 只查排期并推送下一场时间/建议 cron，不抢
  python3 cmcc_seckill.py              # 自动等到下一场开抢
  python3 cmcc_seckill.py --once       # 立即打一发验证
  python3 cmcc_seckill.py --at HH:MM   # 指定时刻抢（覆盖服务端场次时间）

环境变量 CMCC_AUTH（多账号换行/&），JSON 或 app_token#手机号。
"""
import argparse, ipaddress, json, logging, os, random, re, ssl, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
try:
    import requests
    from requests.adapters import HTTPAdapter
except ImportError:
    requests = None
    HTTPAdapter = object

SCRIPT_VERSION = "v1.0.1"
TZ_CN = timezone(timedelta(hours=8))
BASE = "https://wx.10086.cn"
SSO_LOGIN = BASE + "/qwhdsso/login"
API_MARK = BASE + "/qwhdhub/api/mark"
USER_AGENT = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Mobile/15E148/wkwebview leadeon/12.5.4/CMCCIT")
LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost",
                   "metadata.google.internal", "instance-data"}
SECKILL_SYSTIME = f"{API_MARK}/markSeckill/sysTime"
SECKILL_CONFIG = f"{API_MARK}/markSeckill/secConfig"
SECKILL_TODAY = f"{API_MARK}/markSeckill/todayMarkStatus"
SECKILL_REDEEM = f"{API_MARK}/markSeckill/redeem"
SECKILL_STOP = {"PRIZE_NO_STOCK": "券已抢完", "PRIZE_LIMIT_DAY": "当日中奖次数已用完",
                "PRIZE_LIMIT_MONTH": "当月中奖次数已用完", "PRIZE_RESTRIC_LIMIT": "活动期间中奖次数已达上限",
                "WORK_ORDER_RESTRIC_LIMIT": "工单限流（黑名单/风控）"}

log = logging.getLogger("cmcc_seckill")
try:
    from notify import send as ql_send
except Exception:
    ql_send = None


def mask_phone(phone):
    phone = str(phone or "")
    if len(phone) >= 7:
        return f"{phone[:3]}****{phone[-4:]}"
    return phone or "????"


def now_cn():
    return datetime.now(TZ_CN)


class LegacyTLSAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)


def assert_safe_url(url, allowed_hosts=None):
    parts = urlsplit(url)
    if parts.scheme != "https":
        raise ValueError(f"仅允许 https 协议: {url!r}")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise ValueError(f"URL 缺少主机名: {url!r}")
    if host in LOCAL_HOSTNAMES:
        raise ValueError(f"拒绝访问内网主机名: {host}")
    if allowed_hosts is not None and host not in allowed_hosts:
        raise ValueError(f"主机 {host!r} 不在白名单内")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return
    if not ip.is_global:
        raise ValueError(f"拒绝访问非公网地址: {ip}")


def new_session():
    s = requests.Session()
    s.trust_env = False
    s.mount("https://", LegacyTLSAdapter())
    s.headers.update({"user-agent": USER_AGENT, "accept-language": "zh-CN,zh-Hans;q=0.9"})
    return s


class Account:
    def __init__(self, app_token, phone, province_code="", city_code="",
                 carrier_operator="002", app_version_code="12.5.4",
                 activity_id="1021122301", channel_id="P00000057578"):
        self.app_token = app_token
        self.phone = phone
        self.province_code = province_code
        self.city_code = city_code
        self.carrier_operator = carrier_operator
        self.app_version_code = app_version_code
        self.activity_id = activity_id
        self.channel_id = channel_id

    @property
    def act_url(self):
        return f"{BASE}/qwhdhub/qwhdmark/{self.activity_id}?channelId={self.channel_id}"

    def validate(self):
        if not self.app_token:
            return "缺少 app_token"
        if not re.fullmatch(r"1\d{10}", self.phone or ""):
            return "缺少合法 11 位手机号"
        return None


def _parse_one(raw):
    raw = str(raw or "").strip()
    if not raw:
        return None
    if raw.startswith("{"):
        try:
            d = json.loads(raw)
        except Exception:
            return None
        return Account(app_token=d.get("app_token", ""), phone=d.get("phone", ""),
                       province_code=str(d.get("province_code", "")),
                       city_code=str(d.get("city_code", "")),
                       carrier_operator=str(d.get("carrier_operator", "002")),
                       app_version_code=str(d.get("app_version_code", "12.5.4")),
                       activity_id=str(d.get("activity_id", "1021122301")),
                       channel_id=str(d.get("channel_id", "P00000057578")))
    parts = raw.split("#")
    if len(parts) < 2:
        return None
    return Account(app_token=parts[0].strip(), phone=parts[1].strip(),
                   province_code=parts[2].strip() if len(parts) > 2 else "",
                   city_code=parts[3].strip() if len(parts) > 3 else "",
                   channel_id=parts[4].strip() if len(parts) > 4 else "P00000057578")


def load_accounts():
    raw = os.environ.get("CMCC_AUTH", "")
    accounts = []
    for chunk in _auth_chunks(raw):
        accounts.append(_parse_one(chunk))
    return [a for a in accounts if a]


def _auth_chunks(raw):
    decoder = json.JSONDecoder()
    chunks = []
    rest = str(raw or "")
    while rest:
        start = rest.find("{")
        if start < 0:
            break
        try:
            obj, end = decoder.raw_decode(rest[start:])
        except json.JSONDecodeError:
            rest = rest[:start] + " " + rest[start + 1:]
            continue
        chunks.append(json.dumps(obj, ensure_ascii=False))
        rest = rest[:start] + " " + rest[start + end:]
    for line in rest.splitlines():
        line = line.strip()
        if not line:
            continue
        if "&" in line:
            head, *tails = line.split("&")
            if re.match(r"^[^\s#&]+#[^\s&#]+(?:\#[^\s&#]*)*$", head):
                chunks.append(head)
            for tail in tails:
                match = re.match(r"^([^\s#&]+#[^\s&#]+(?:\#[^\s&#]*)*)$", tail.strip())
                if match:
                    chunks.append(match.group(1))
            line = head.strip()
        if line.startswith(("http://", "https://", "www.")):
            match = re.search(r"(?:^|\s)([^\s&]+#[^\s&#]+(?:\#[^\s&#]*)*)\s*$", line)
            if match:
                chunks.append(match.group(1))
            continue
        if "#" in line and line not in chunks:
            chunks.append(line)
    deduped = []
    for chunk in chunks:
        if chunk not in deduped:
            deduped.append(chunk)
    return deduped


def jwt_cache_file(a):
    return Path(__file__).with_name(f".cmcc_jwt_cache_{a.phone[-4:]}.json")


def clear_jwt(a):
    try:
        p = jwt_cache_file(a)
        if p.exists():
            p.unlink()
    except Exception:
        pass

def load_jwt(a):
    try:
        d = json.loads(jwt_cache_file(a).read_text(encoding="utf-8"))
        if d.get("phone") == a.phone and time.time() - d.get("saved_at", 0) < 30 * 86400:
            return d.get("jwt")
    except Exception:
        pass
    return None


def save_jwt(a, jwt):
    if not jwt:
        return
    try:
        p = jwt_cache_file(a)
        first_seen = time.time()
        try:
            old = json.loads(p.read_text(encoding="utf-8"))
            if old.get("phone") == a.phone and old.get("first_seen"):
                first_seen = old["first_seen"]
        except Exception:
            pass
        p.write_text(json.dumps({"jwt": jwt, "phone": a.phone,
                                 "first_seen": first_seen, "saved_at": time.time()}),
                     encoding="utf-8")
    except Exception:
        pass


def api_headers(referer):
    return {"accept": "*/*", "content-type": "application/json;charset=UTF-8",
            "origin": BASE, "referer": referer, "login-check": "1",
            "x-requested-with": "XMLHttpRequest"}


def exchange_session(a, act_url=None):
    s = new_session()
    act = act_url or a.act_url
    r = s.get(SSO_LOGIN, params={"dlwmh": "true", "actUrl": act}, timeout=30)
    r.raise_for_status()
    m = re.search(r"loginPath\s*=\s*'([^']+)'", r.text)
    if not m:
        raise RuntimeError("登录页未返回 sid，SSO 入口可能已变更")
    login_url = BASE + "/qwhdsso" + m.group(1)
    base_body = {"userCheckId": format(int(a.phone), "x"),
                 "carrierOperator": a.carrier_operator,
                 "appVersionCode": a.app_version_code,
                 "took": random.randint(120, 900)}
    if a.province_code:
        base_body["provinceCode"] = a.province_code
    if a.city_code:
        base_body["cityCode"] = a.city_code
    resp = None
    if not getattr(a, "_jwt_failed", False):
        cached = load_jwt(a)
        if cached:
            r = s.post(login_url, json={**base_body, "jwtToken": cached, "token": ""}, timeout=30)
            cand = r.json()
            if cand.get("code") == "SUCCESS":
                resp = cand
            else:
                a._jwt_failed = True
                clear_jwt(a)
                log.info("jwt 已失效，已清理旧缓存并自动使用 app_token 重新换票")
    if resp is None:
        r = s.post(login_url, json={**base_body, "jwtToken": None, "token": a.app_token}, timeout=30)
        resp = r.json()
        if resp.get("code") != "SUCCESS":
            raise RuntimeError(f"appTokenLogin 失败: {resp.get('code')} {resp.get('msg')} —— "
                               "通常 app_token 已过期，请重新抓包")
        a._jwt_failed = False
    data = resp.get("data") or {}
    new_jwt = data.get("jwtToken") or data.get("jwt")
    if new_jwt:
        save_jwt(a, new_jwt)
    assert_safe_url(data.get("url"), allowed_hosts={"wx.10086.cn"})
    r = s.get(data["url"], timeout=30, allow_redirects=False)
    r.raise_for_status()
    token_name = next((n for n in s.cookies.keys() if n.endswith("SESSION_TOKEN")), None)
    if not token_name:
        raise RuntimeError("未取得活动会话令牌，会话兑换失败")
    return s, data["url"]


def api_post(s, referer, url, payload=None):
    r = s.post(url, json=payload if payload is not None else {},
               headers=api_headers(referer), timeout=20)
    r.raise_for_status()
    return r.json()


def notify(title, body):
    print(f"\n📣 [{SCRIPT_VERSION}]【{title}】\n{body}")
    if ql_send:
        try:
            ql_send(f"[{SCRIPT_VERSION}] {title}", body)
        except Exception:
            pass


def markstatus(s, referer):
    d = api_post(s, referer, f"{API_MARK}/mark31/markstatus", {})
    if d.get("code") != "SUCCESS":
        raise PermissionError(f"markstatus 失败: {d.get('code')} {d.get('msg')}")
    return d.get("data") or {}


def do_mark(s, referer, date):
    return api_post(s, referer, f"{API_MARK}/mark31/domark", {"date": date})


def server_now_ms(s, referer):
    try:
        ms = (api_post(s, referer, SECKILL_SYSTIME).get("data") or {}).get("sysTime")
        if isinstance(ms, int):
            return ms
    except Exception as e:
        log.warning("sysTime 请求失败: %s", e)
    from email.utils import parsedate_to_datetime
    r = s.post(SECKILL_SYSTIME, json={}, headers=api_headers(referer), timeout=10)
    date = r.headers.get("Date")
    if date:
        return int(parsedate_to_datetime(date).timestamp() * 1000)
    raise RuntimeError("无法获取服务器时间")


def suggest_cron(start_dt):
    t = start_dt - timedelta(minutes=1)
    return f"{t.minute:02d} {t.hour:02d} * * *"


def run_seckill(a, dry_run, once, at, interval, lead, max_attempts):
    s, referer = exchange_session(a)
    srv_ms = server_now_ms(s, referer)
    offset_ms = srv_ms - time.time() * 1000
    cfg = api_post(s, referer, SECKILL_CONFIG).get("data") or {}
    zones = (cfg.get("secKillData") or {}).get("secKillZones") or []
    if not zones:
        return ["秒杀：无可用场次（活动未配置或已结束）"]

    lines = [f"服务器时间 {datetime.fromtimestamp(srv_ms / 1000, TZ_CN).strftime('%m-%d %H:%M:%S')}"]
    for z in zones:
        st = datetime.fromtimestamp(int(z["startTime"]) / 1000, TZ_CN)
        et = datetime.fromtimestamp(int(z["endTime"]) / 1000, TZ_CN)
        pr = z.get("prize") or {}
        lines.append(f"场次{z['id']} {st.strftime('%m-%d %H:%M')}~{et.strftime('%H:%M')} "
                     f"{pr.get('name', '?')} 库存{pr.get('leaveStock', '?')}")

    mark = api_post(s, referer, SECKILL_TODAY).get("data") or {}
    eligible = mark.get("markStatus") == "marked"
    if not eligible and not dry_run:
        do_mark(s, referer, now_cn().strftime("%Y%m%d"))
        mark = api_post(s, referer, SECKILL_TODAY).get("data") or {}
        eligible = mark.get("markStatus") == "marked"

    def pick(now_ms):
        for z in zones:
            if int(z["startTime"]) <= now_ms <= int(z["endTime"]):
                return z, True
        up = sorted((z for z in zones if int(z["startTime"]) > now_ms),
                    key=lambda z: int(z["startTime"]))
        return (up[0] if up else None), False

    zone, active = pick(srv_ms)
    if zone is None:
        return lines + ["秒杀：全部场次已结束"]

    start_srv = int(zone["startTime"])
    end_srv = int(zone["endTime"])
    if at:
        hh, mm, *ss = at.split(":")
        target = now_cn().replace(hour=int(hh), minute=int(mm),
                                  second=int(ss[0]) if ss else 0, microsecond=0)
        start_srv = int(target.timestamp() * 1000)
        active = False

    zone_dt = datetime.fromtimestamp(start_srv / 1000, TZ_CN)
    prize = zone.get("prize") or {}
    lines.append(f"下一场：{zone_dt.strftime('%m-%d %H:%M')} {prize.get('name', '?')}")
    lines.append(f"建议秒杀 cron：{suggest_cron(zone_dt)}（提前 1 分钟拉起）")
    lines.append(f"秒杀资格：{'已具备（当日已签）' if eligible else '未获取（脚本会自动补签）'}")

    if dry_run:
        return lines + ["[dry-run] 到此为止，不抢购"]
    if not eligible:
        return lines + ["秒杀：资格缺失且补签失败"]
    if once:
        resp = api_post(s, referer, SECKILL_REDEEM,
                        {"secId": str(zone["id"]), "prizeId": str(zone["prize"]["id"])})
        return lines + [f"单发响应: code={resp.get('code')} status={resp.get('status')} msg={resp.get('msg', '')}"]

    if not active:
        wait_s = start_srv / 1000 - offset_ms / 1000 - lead - time.time()
        if wait_s > 0:
            time.sleep(wait_s)
    payload = {"secId": str(zone["id"]), "prizeId": str(zone["prize"]["id"])}
    for i in range(1, max_attempts + 1):
        if (time.time() + offset_ms) * 1000 > end_srv:
            lines.append("秒杀：窗口已结束")
            break
        resp = api_post(s, referer, SECKILL_REDEEM, payload)
        code, status, msg = resp.get("code"), resp.get("status"), resp.get("msg", "")
        if code == "SUCCESS":
            lines.append(f"秒杀成功！{zone['prize'].get('name', '')}")
            break
        if status in SECKILL_STOP:
            lines.append(f"秒杀停止：{SECKILL_STOP[status]}")
            break
        time.sleep(0.05 if status == "NOT_TIME_IN" else interval)
    return lines


def main():
    ap = argparse.ArgumentParser(description="中国移动场次秒杀")
    ap.add_argument("--dry-run", action="store_true", help="只查排期，不抢购")
    ap.add_argument("--once", action="store_true", help="立即打一发验证")
    ap.add_argument("--at", help="指定时刻 HH:MM[:SS]")
    ap.add_argument("--interval", type=float, default=0.35)
    ap.add_argument("--lead", type=float, default=0.4)
    ap.add_argument("--max-attempts", type=int, default=120)
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    if requests is None:
        log.error("缺少 requests，请先安装：pip3 install requests")
        return 1
    accounts = load_accounts()
    if not accounts:
        log.error("未配置 CMCC_AUTH。多账号格式：每行一个 JSON 或 app_token#手机号")
        return 1

    blocks, failed = [], 0
    for i, a in enumerate(accounts):
        err = a.validate()
        if err:
            blocks.append(f"• 账号{i + 1} 配置无效：{err}")
            failed += 1
            continue
        log.info("开始处理账号 %s", mask_phone(a.phone))
        try:
            lines = run_seckill(a, args.dry_run, args.once, args.at,
                                args.interval, args.lead, args.max_attempts)
        except Exception as e:
            log.exception("账号 %s 秒杀失败: %s", mask_phone(a.phone), e)
            lines = [f"异常：{e}"]
        bullets = "\n".join(f"• {ln}" for ln in lines if ln)
        if len(accounts) > 1:
            blocks.append(f"【账号 {i + 1}: {mask_phone(a.phone)}】\n{bullets}")
        else:
            blocks.append(bullets)
        if i < len(accounts) - 1:
            time.sleep(random.uniform(1, 3))

    summary = "\n\n".join(blocks)
    subtitle = (f"执行完成 ({len(accounts)}个账号)" if len(accounts) > 1
                else f"执行完成 (1个账号) - 【{mask_phone(accounts[0].phone) if accounts else '?'}】")
    print("\n========== 执行结果 ==========\n" + summary)
    notify("中国移动 · 场次秒杀", f"{subtitle}\n\n{summary}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

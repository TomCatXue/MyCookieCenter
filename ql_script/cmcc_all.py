#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中国移动 App 全功能聚合脚本（青龙/面板通用）
整合 TomCatXue/cmcc-auto-checkin 的 SSO 换票链路与全部 qwhdhub 活动模块。
协议：qwhdhub = 明文 JSON + QWHD_SESSION_TOKEN Cookie，非 Base64。
换票：GET /qwhdsso/login -> POST /qwhdsso/appTokenLogin?sid=... -> GET data.url -> Set-Cookie。
长期凭证 = appTokenLogin 返回 data.jwt，之后每次用 jwtToken 免票据续期。
环境变量 CMCC_AUTH（多账号换行/&），JSON 或 app_token#手机号。省/市码可选，仅辽宁等地域强校验活动才需填。
可选 CMCC_COC3_TICKET（AI豆苗）、CMCC_FEE_SESSION（话费余额），多账号换行/&。

new Env('中国移动 · 每日聚合')
cron: 20 8 * * *
tag: 中国移动

用法：
  python3 cmcc_all.py                     # ★默认全开：签到 + 连签领奖 + AI豆任务 + 顶格兑话费 + 拓展活动 + 周三拼图 + 豆苗 + 查话费
  python3 cmcc_all.py --dry-run           # 全量只读探测（只查状态与余额，不做写操作）
  python3 cmcc_all.py --only-sign         # 仅签到模式（跳过赚豆与兑换任务）
  python3 cmcc_all.py --no-gold           # 正常跑任务，但跳过兑换话费券
  python3 cmcc_all.py --wed-seckill       # 周三充值日秒杀模式（建议定时 58 7 * * 3）

青龙定时（直接使用默认命令，开箱即用）：
  # 每天 08:20：每日聚合全功能主任务（★默认全开，无需额外命令行参数）
  20 8 * * *  python3 cmcc_all.py

  # 每周三 07:58：充值日秒杀（提前 2 分钟拉起预热，自旋至 08:00 开抢）
  58 7 * * 3  python3 cmcc_all.py --wed-seckill

  # 签到有礼场次秒杀已拆分到独立脚本 cmcc_seckill.py：
  #   先跑 python3 cmcc_seckill.py --dry-run 看排期（会推送下一场时间与建议 cron）
  #   再按提示设置定时，执行 python3 cmcc_seckill.py
"""
import argparse, base64, ipaddress, json, logging, os, random, re, ssl, sys, time, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
try:
    import requests
    from requests.adapters import HTTPAdapter
except ImportError:
    requests = None
    HTTPAdapter = object

SCRIPT_VERSION = "v1.0.0"
TZ_CN = timezone(timedelta(hours=8))
BASE = "https://wx.10086.cn"
SSO_LOGIN = BASE + "/qwhdsso/login"
API_MARK = BASE + "/qwhdhub/api/mark"
USER_AGENT = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 "
              "(KHTML, like Gecko) Mobile/15E148/wkwebview leadeon/12.5.4/CMCCIT")
LOCAL_HOSTNAMES = {"localhost", "localhost.localdomain", "ip6-localhost",
                   "metadata.google.internal", "instance-data"}
GOLD_TIERS = ("5元话费券", "2元话费券", "1.5元话费券", "1元话费券")
GOLD_MIN_STOCK = 100

# ==================== ⚙️ 全局业务开关 (默认全开，可直接修改) ====================
CONFIG = {
    # --- 每日聚合常规任务 (默认全部自动执行) ---
    "ENABLE_SIGN": True,         # 每日签到与累计连签阶梯领奖
    "ENABLE_TASKS": True,        # AI豆日常任务（自动完成浏览、分享等赚豆任务）
    "ENABLE_GOLD": True,         # AI豆顶格自动兑换话费券（按可用豆余额兑换最大面额）
    "ENABLE_GAMES": True,        # 拓展活动（游戏试玩打卡、热门剧集打卡等轻量任务）
    "ENABLE_WED_PUZZLE": True,   # 周三充值日拼图抽奖（全周做任务攒次数，自动拼图领券）
    "ENABLE_SEED": True,         # AI豆苗养成记（配置了 CMCC_COC3_TICKET 时自动执行，未配自动跳过）
    "ENABLE_FEE": True,          # 实时话费余额查询（配置了 CMCC_FEE_SESSION 时自动执行，未配自动跳过）
}
WED_ACT_URL = (BASE + "/hlwyxhdhub/act-wedrecharge/1024101716"
               "?pageId=1849008675699650560&channelId=P00000093619")
API_WED = BASE + "/hlwyxhdhub/api/wedrecharge"
TIER_NAMES = {"dp1": "95折话费券", "dp2": "9折话费券", "dp3": "8折话费券"}
PUZZLE_RECEIVE = {1: "r6", 2: "r5", 3: "r4"}
RECEIVE_LABELS = {"r6": "95折话费券", "r5": "9折话费券", "r4": "8折话费券"}
WED_MANUAL_SKIP = {"yqyh": "需邀请真实用户助力", "czhf": "需真实充值满10元",
                   "llym": "需在 App 内真实浏览签到页", "dlhd": "进页自动完成"}
SEED_BASE = "https://dev.coc.10086.cn/coc3/coc3-market-activity"
SEED_LOGIN = "https://dev.coc.10086.cn/coc3/gr/login/ssoRights/userLoginV2"
SEED_PAGE = ("https://dev.coc.10086.cn/coc3/canvas/rightsmarket-h5-canvas"
             "/online/2026dmycj?pageRecorded=true")
SEED_ACTIVITY_ID = 17692
SEED_TASK_LIST_ID = 55
SEED_SIGN_TASK_ID = 3115
SEED_CHANNEL = "P00000011939"
SEED_WTAC = "P00000008211_"
SEED_SKIP = {3: "需真实办理/订购", 6: "需真实好友助力"}
FEE_BASE = "https://touch.10086.cn"
FEE_KEY = b"043AOQGK6ykklyZA"
log = logging.getLogger("cmcc_all")
try:
    from notify import send as ql_send
except Exception:
    ql_send = None

def mask_phone(phone):
    phone = str(phone or "")
    if len(phone) >= 7:
        return f"{phone[:3]}****{phone[-4:]}"
    return phone or "????"

def safe_get(d, *keys, default=None):
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur

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
                 activity_id="1021122301", channel_id="P00000057578",
                 coc3_ticket="", fee_session=""):
        self.app_token = app_token
        self.phone = phone
        self.province_code = province_code
        self.city_code = city_code
        self.carrier_operator = carrier_operator
        self.app_version_code = app_version_code
        self.activity_id = activity_id
        self.channel_id = channel_id
        self.coc3_ticket = coc3_ticket
        self.fee_session = fee_session

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
                       channel_id=str(d.get("channel_id", "P00000057578")),
                       coc3_ticket=d.get("coc3_ticket", ""),
                       fee_session=d.get("fee_session", ""))
    parts = raw.split("#")
    if len(parts) < 2:
        return None
    return Account(app_token=parts[0].strip(), phone=parts[1].strip(),
                   province_code=parts[2].strip() if len(parts) > 2 else "",
                   city_code=parts[3].strip() if len(parts) > 3 else "",
                   channel_id=parts[4].strip() if len(parts) > 4 else "P00000057578")

def load_accounts():
    raw = os.environ.get("CMCC_AUTH", "")
    accounts = [a for a in (_parse_one(x) for x in re.split(r"[\n&]+", raw)) if a]
    coc3 = [x.strip() for x in re.split(r"[\n&]+", os.environ.get("CMCC_COC3_TICKET", "")) if x.strip()]
    fee = [x.strip() for x in re.split(r"[\n&]+", os.environ.get("CMCC_FEE_SESSION", "")) if x.strip()]
    for i, a in enumerate(accounts):
        if i < len(coc3):
            a.coc3_ticket = coc3[i]
        if i < len(fee):
            a.fee_session = fee[i]
    return accounts

def jwt_cache_file(a):
    return Path(__file__).with_name(f".cmcc_jwt_cache_{a.phone[-4:]}.json")

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
    cached = load_jwt(a)
    if cached:
        r = s.post(login_url, json={**base_body, "jwtToken": cached, "token": ""}, timeout=30)
        cand = r.json()
        if cand.get("code") == "SUCCESS":
            resp = cand
        else:
            log.info("jwt 续期失败(%s)，回落 app_token 引导", cand.get("msg"))
    if resp is None:
        r = s.post(login_url, json={**base_body, "jwtToken": None, "token": a.app_token}, timeout=30)
        resp = r.json()
        if resp.get("code") != "SUCCESS":
            raise RuntimeError(f"appTokenLogin 失败: {resp.get('code')} {resp.get('msg')} —— "
                               "通常 app_token 已过期，请重新抓包")
    data = resp.get("data") or {}
    save_jwt(a, data.get("jwt"))
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

# ============================== 签到 + 累计连签领奖 ==============================

def markstatus(s, referer):
    d = api_post(s, referer, f"{API_MARK}/mark31/markstatus", {})
    if d.get("code") != "SUCCESS":
        raise PermissionError(f"markstatus 失败: {d.get('code')} {d.get('msg')}")
    return d.get("data") or {}

def do_mark(s, referer, date):
    return api_post(s, referer, f"{API_MARK}/mark31/domark", {"date": date})

def claim_mark_awards(s, referer, status_data):
    names = {}
    pools = [status_data.get("taskAwardChance") or [],
             status_data.get("accumulateTaskInfo") or [],
             status_data.get("myTaskInfo") or []]
    for pool in pools:
        for t in pool:
            tid = t.get("id")
            if not tid or names.get(tid):
                continue
            nm = (t.get("prize") or {}).get("name") or t.get("lotteryText") \
                or t.get("prizeAlertText") or ""
            if nm:
                names[tid] = nm
    out = []
    for t in status_data.get("taskAwardChance") or []:
        tid = t.get("id")
        if not tid:
            continue
        r = api_post(s, referer, f"{API_MARK}/mark31/taskAward/{tid}", {})
        data = r.get("data") or {}
        label = names.get(tid) or f"任务{tid}"
        if isinstance(data, dict) and data.get("prizeName"):
            out.append(f"{label}→{data['prizeName']}")
        else:
            out.append(f"{label}→失败({r.get('status') or r.get('code')})")
        time.sleep(random.uniform(0.5, 1.2))
    return out

def run_sign(a, dry_run):
    for attempt in (1, 2):
        try:
            s, referer = exchange_session(a)
            st = markstatus(s, referer)
            break
        except PermissionError:
            if attempt == 2:
                raise
    today = now_cn().strftime("%Y%m%d")
    userinfo = st.get("userinfo") or {}
    acc = userinfo.get("accumulateTimes", "?")
    signed = any(d.get("date") == today and str(d.get("status")) == "1"
                 for d in st.get("markstatus") or [])
    sign_word = "已签" if signed else "未签"
    lines = [f"签到：{sign_word}，本月累计 {acc} 天"]
    if not signed and not dry_run:
        r = do_mark(s, referer, today)
        code, status, msg = r.get("code"), r.get("status"), r.get("msg", "")
        if code == "SUCCESS" or "已签" in msg or status == "HAVE_MARKED":
            st2 = markstatus(s, referer)
            acc = (st2.get("userinfo") or {}).get("accumulateTimes", acc)
            lines[0] = f"签到：成功，本月累计 {acc} 天"
        else:
            lines[0] = f"签到：失败 {code} {msg}".strip()
    latest = markstatus(s, referer)
    chances = latest.get("taskAwardChance") or []
    if dry_run:
        if chances:
            lines.append(f"[dry-run] 连签领奖 {len(chances)} 个待领")
    elif chances:
        claimed = claim_mark_awards(s, referer, latest)
        lines.append(f"连签领奖：{'、'.join(claimed)}")
    return lines

# ============================== AI豆任务 ==============================

def _open_handshake(a, jt_token, scan=0):
    try:
        s2, ref2 = exchange_session(a, act_url=WED_ACT_URL)
        def get_ct():
            info = api_post(s2, ref2, BASE + "/hlwyxhdhub/api/open/_pub/task/getOneTaskInfo",
                            {"jtToken": jt_token})
            return (info.get("data") or {}).get("cToken") or "", info.get("data") or {}
        ct, d = get_ct()
        if not ct:
            return False
        fin = api_post(s2, ref2, BASE + "/hlwyxhdhub/api/open/_pub/task/openFinish", {"cToken": ct})
        if fin.get("code") == "SUCCESS":
            return True
        ct, d = get_ct()
        if not ct:
            return False
        time.sleep(int(d.get("scanTime") or scan or 0) + 1)
        fin = api_post(s2, ref2, BASE + "/hlwyxhdhub/api/open/_pub/task/openFinish", {"cToken": ct})
        return fin.get("code") == "SUCCESS"
    except Exception as e:
        log.debug("开放平台握手失败: %s", e)
        return False

def run_tasks(a, s, referer, dry_run):
    tl = api_post(s, referer, f"{API_MARK}/task/taskList", {})
    data = tl.get("data") or {}
    tasks = data.get("tasks") or []
    current_fee = data.get("currentFee")
    todo = [t for t in tasks if t.get("status") == 0 and t.get("taskClasifiName") != "外部合作区"]
    lines = [f"AI豆 {current_fee}，待办任务 {len(todo)} 个"]
    if dry_run or not todo:
        return lines
    done_names = []
    for t in todo:
        tid = str(t.get("taskId") or "")
        if not tid:
            continue
        info = api_post(s, referer, f"{API_MARK}/task/taskInfo", {"taskId": tid})
        d = info.get("data") or {}
        ttype = str(d.get("taskType") or "")
        scan = int(d.get("scanTime") or 0)
        jt = d.get("taskToken") or ""
        ju = str(t.get("jumpUrl") or "")
        done = False
        if jt:
            done = _open_handshake(a, jt, scan)
        if not done:
            r = api_post(s, referer, f"{API_MARK}/task/finishTask",
                         {"taskId": tid, "taskType": ttype})
            msg = r.get("msg") or ""
            if r.get("code") != "SUCCESS" and "公众号" in msg:
                time.sleep(0.3)
                continue
            if r.get("code") != "SUCCESS" and ju.startswith("https://"):
                try:
                    assert_safe_url(ju)
                    s.get(ju, timeout=15)
                    r = api_post(s, referer, f"{API_MARK}/task/finishTask",
                                 {"taskId": tid, "taskType": ttype})
                except (ValueError, requests.RequestException):
                    pass
        if done or r.get("code") == "SUCCESS":
            aw = api_post(s, referer, f"{API_MARK}/task/getTaskAward", {"taskId": tid})
            n = (aw.get("data") or {}).get("awardNum") if aw.get("code") == "SUCCESS" else "?"
            done_names.append(f"{t.get('taskName', tid)} +{n}")
        time.sleep(random.uniform(0.2, 0.6))
    if done_names:
        lines.append(f"任务完成：{'、'.join(done_names)}")
    return lines

# ============================== AI豆兑换话费券 ==============================

def run_gold(a, s, referer, dry_run):
    def fetch():
        d = api_post(s, referer, f"{API_MARK}/task/getExchangeList", {"channel": "app"}).get("data") or {}
        prizes = d.get("prizes") if isinstance(d.get("prizes"), list) else []
        def num(k):
            try:
                return float(d.get(k) or 0)
            except (TypeError, ValueError):
                return 0.0
        return num("currentFee"), d, prizes
    balance, data, prizes = fetch()
    lines = [f"AI豆余额 {balance:g}"]
    if dry_run:
        return lines
    exchanged = []
    for _ in range(8):
        balance, _, prizes = fetch()
        target = None
        by_name = {p.get("name"): p for p in prizes}
        for name in GOLD_TIERS:
            p = by_name.get(name)
            if (p and p.get("status") == "WITHOUT"
                    and float(p.get("stock") or 0) > GOLD_MIN_STOCK
                    and float(p.get("cost") or 0) <= balance):
                target = p
                break
        if not target:
            break
        st = api_post(s, referer, f"{API_MARK}/task/checkStock", {"prizeId": target["id"]})
        left = (st.get("data") or {}).get("stock")
        if not isinstance(left, (int, float)) or left <= GOLD_MIN_STOCK:
            continue
        r = api_post(s, referer, f"{API_MARK}/task/exchange", {"prizeId": target["id"]})
        if r.get("code") == "SUCCESS":
            exchanged.append(target["name"])
        elif r.get("data") == 1:
            break
        time.sleep(1)
    if exchanged:
        lines.append(f"兑换成功：{'、'.join(exchanged)}")
    return lines

# ============================== 拓展活动（游戏/追剧） ==============================

ACTS = {
    "saturday": {"name": "周六游戏中心",
                 "entry": f"{BASE}/qwhdhub/diy-client/1126086939?A_C_CODE=pXMkQhEmZ7&channelId=P00000119581",
                 "sign": ("POST", "/qwhdhub/api/diySaturdayGame/clockIn",
                          "POST", "/qwhdhub/api/diySaturdayGame/getClockInStatus"),
                 "signed": lambda d: bool(d.get("signed")) or "已签到" in (d.get("message") or ""),
                 "task_component": "50HQAg0-9YaSW4St7MDT",
                 "lottery": {"component": "50HQAg0-9YaSW4St7MDT", "wallet_key": "remainGameVal",
                             "cost": 10, "count_key": "remain", "weekday": 6, "start_hour": 12,
                             "label": "游戏币", "stop_on_miss": True}},
    "video": {"name": "追剧领福利",
              "entry": f"{BASE}/qwhdhub/diy-client/1126082530?A_C_CODE=10hep1ZhkL&channelId=P00000119581",
              "sign": ("GET", "/qwhdhub/api/diyVideoDayRedesign/sign/doSign",
                       "GET", "/qwhdhub/api/diyVideoDayRedesign/sign/querySignStatus"),
              "signed": lambda d: d.get("todaySignFlag") == "1",
              "task_component": "4EC96l0-9btuobajC9Yu", "video_day": True,
              "lottery": {"component": "4EC96l0-9btuobajC9Yu", "wallet_key": "remain",
                          "cost": 1, "count_key": None, "weekday": 7, "label": "次数",
                          "stop_on_miss": False}},
    "game666": {"name": "玩游戏抽话费",
                "entry": f"{BASE}/qwhdhub/diy-client/1126090514?A_C_CODE=aEvxYYAV3C&channelId=P00000119581",
                "sign": None, "task_component": "7M6vIq0-TFMj5T-ZGjks"},
}

def _api_call(s, referer, method, path, body=None):
    headers = api_headers(referer)
    try:
        if method == "GET":
            r = s.get(BASE + path, headers=headers, timeout=30)
        else:
            r = s.post(BASE + path, json=body or {}, headers=headers, timeout=30)
        return r.json()
    except ValueError:
        return {"code": f"HTTP_{getattr(r, 'status_code', 0)}", "msg": "响应非 JSON"}
    except requests.RequestException as e:
        return {"code": "NETWORK_ERROR", "msg": str(e)}

def _diy_tasks(s, referer, component, dry_run):
    resp = _api_call(s, referer, "GET", f"/qwhdhub/diyTask/list/{component}")
    tasks = resp.get("data") or []
    todo = [t for t in tasks if t.get("taskStage") == "UNDO"]
    if dry_run or not todo:
        return None
    done = 0
    for t in todo:
        tid = t.get("taskId")
        if not tid:
            continue
        _api_call(s, referer, "POST", f"/qwhdhub/diyTask/finish/{tid}", {})
        chk = _api_call(s, referer, "GET", f"/qwhdhub/diyTask/list/{component}")
        cur = next((x for x in (chk.get("data") or []) if x.get("taskId") == tid), None)
        if cur is None or cur.get("taskStage") == "DONE":
            done += 1
        time.sleep(random.uniform(0.8, 1.8))
    return f"任务 +{done}"

def _diy_lottery(s, referer, cfg, dry_run):
    comp = cfg["component"]
    rem = _api_call(s, referer, "POST", f"/qwhdhub/diyLottery/period/remain/{comp}", {})
    d = rem.get("data") or {}
    wallet = d.get(cfg["wallet_key"]) or 0
    limit = d.get(cfg["count_key"]) if cfg.get("count_key") else None
    n = wallet // cfg["cost"]
    if limit is not None:
        n = min(n, int(limit))
    head = f"抽奖[{cfg['label']}] 余额 {wallet}（{cfg['cost']}/次）→ 可抽 {n} 次"
    if dry_run:
        return head
    if n <= 0:
        return None
    now = datetime.now()
    if (cfg.get("weekday") and now.isoweekday() != cfg["weekday"]) or \
       (cfg.get("start_hour") and now.hour < cfg["start_hour"]):
        return None
    results = []
    for _ in range(n):
        r = _api_call(s, referer, "GET", f"/qwhdhub/diyLottery/lotterySafely/{comp}")
        won = (r.get("data") or [{}])[0] if r.get("code") == "SUCCESS" else None
        if won:
            results.append(str(won.get("prizeName") or "?"))
        elif r.get("code") in ("SUCCESS", "NOT_WON"):
            if cfg.get("stop_on_miss", True):
                results.append("未中奖")
                break
            results.append("未中奖")
        else:
            results.append("失败")
            break
        time.sleep(random.uniform(1, 2.5))
    return f"抽奖：{' / '.join(results)}"

def run_games(a, dry_run):
    lines = []
    for key, act in ACTS.items():
        s, referer = exchange_session(a, act_url=act["entry"])
        name = act["name"]
        parts = []
        if act["sign"]:
            dm, dp, _, qm, qp = act["sign"]
            st = _api_call(s, referer, qm, qp, {} if qm == "POST" else None)
            data = st.get("data") or {}
            if act["signed"](data):
                parts.append("已打卡")
            elif dry_run:
                parts.append("[dry-run]未打卡")
            else:
                r = _api_call(s, referer, dm, dp, {})
                ok = r.get("code") == "SUCCESS" or "已签" in (r.get("msg") or "")
                parts.append("打卡成功" if ok else "打卡失败")
        if act.get("task_component"):
            t = _diy_tasks(s, referer, act['task_component'], dry_run)
            if t:
                parts.append(t)
        if act.get("lottery"):
            t = _diy_lottery(s, referer, act['lottery'], dry_run)
            if t:
                parts.append(t)
        if parts:
            lines.append(f"{name}：{'，'.join(parts)}")
        time.sleep(random.uniform(1, 3))
    return lines

# ============================== 周三充值日拼图 ==============================

def wed_api(s, referer, path, payload=None):
    r = s.post(f"{API_WED}/{path}", json=payload or {}, headers=api_headers(referer), timeout=30)
    r.raise_for_status()
    resp = r.json()
    if resp.get("code") != "0":
        raise RuntimeError(f"{path} 失败: {resp.get('code')} {resp.get('msg')}")
    return resp.get("data") or {}

def run_wed(a, dry_run):
    s, referer = exchange_session(a, act_url=WED_ACT_URL)
    wed_api(s, referer, "queryActivityInfo")
    state = wed_api(s, referer, "queryPictureActInfo")
    tasks = wed_api(s, referer, "taskList")
    lines = [f"周三充值日：抽奖 {state.get('drawTimes')} 次"]
    pics = state.get("pictureList") or {}
    if dry_run:
        return lines
    todo = [t for t in tasks if t.get("taskId") not in WED_MANUAL_SKIP and t.get("status") != 2]
    for t in todo:
        tid = t.get("taskId")
        title = t.get("title", tid)
        try:
            wed_api(s, referer, "finishTask", {"taskId": tid})
        except Exception:
            pass
        time.sleep(random.uniform(0.5, 1))
    for _ in range(30):
        state = wed_api(s, referer, "queryPictureActInfo")
        times = int(state.get("drawTimes") or 0)
        if times <= 0:
            break
        active = int(state.get("activeIndex") or 1)
        pieces = (state.get("pictureList") or {}).get(str(active)) or {}
        if pieces and all(str(v).isdigit() and int(v) >= 1 for v in pieces.values()):
            break
        r = s.post(f"{API_WED}/drawPicture", json={"round": f"dp{active}"},
                   headers=api_headers(referer), timeout=30).json()
        if r.get("code") != "0":
            break
        time.sleep(random.uniform(0.8, 1.5))
    final = wed_api(s, referer, "queryPictureActInfo")
    got = []
    for idx in sorted((final.get("pictureList") or {}), key=int):
        pieces = (final.get("pictureList") or {}).get(str(idx)) or {}
        if pieces and all(str(v).isdigit() and int(v) >= 1 for v in pieces.values()):
            rnd = PUZZLE_RECEIVE.get(int(idx))
            if not rnd:
                continue
            r = s.post(f"{API_WED}/receiveNew", json={"round": rnd},
                       headers=api_headers(referer), timeout=30).json()
            if r.get("code") == "0":
                got.append(RECEIVE_LABELS.get(rnd, rnd))
            elif "已领取" in (r.get("msg") or ""):
                got.append(f"{RECEIVE_LABELS.get(rnd, rnd)}(已领)")
    if got:
        lines.append(f"领取：{'、'.join(got)}")
    return lines

# ============================== 周三充值日秒杀 ==============================

def wed_seckill(a, dry_run, at, interval, lead, max_attempts, force):
    s, referer = exchange_session(a, act_url=WED_ACT_URL)
    def fresh_session():
        return exchange_session(a, act_url=WED_ACT_URL)
    d = wed_api(s, referer, "queryDrawPrizeInfo")
    now_sv = d["currentTime"] / 1000
    skew_ms = (now_sv - time.time()) * 1000
    now_dt = datetime.fromtimestamp(now_sv)
    weekday_cn = "一二三四五六日"[now_dt.weekday()]
    try:
        rec = s.get(f"{API_WED}/_pub/rec_login", timeout=15).json().get("data") or {}
    except Exception:
        rec = {}
    sk_raw = rec.get("seckillTime")
    sk_hours = [int(h) for h in sk_raw] if sk_raw else [8]
    nfos = rec.get("Seckillnfos") or []
    lines = [f"周三秒杀：场次 {('、'.join(f'{h:02d}:00' for h in sk_hours))}"]
    if nfos:
        lines.append("奖品：" + "、".join(p.get('name', '') for p in nfos))
    if at:
        hh, mm, *ss = at.split(":")
        target = now_dt.replace(hour=int(hh), minute=int(mm),
                                second=int(ss[0]) if ss else 0, microsecond=0)
        src = f"--at {at}"
    else:
        future = [h for h in sk_hours
                  if now_dt.replace(hour=h, minute=0, second=0, microsecond=0).timestamp() >= now_sv]
        if not future:
            return lines + ["今日场次已结束"]
        target = now_dt.replace(hour=future[0], minute=0, second=0, microsecond=0)
        src = f"场次 {future[0]:02d}:00"
    if target.timestamp() < now_sv - 3600:
        target += timedelta(days=1)
        src += "+1天"
    if target.weekday() != 2 and not force:
        return lines + [f"{target.strftime('%m-%d')} 为周{weekday_cn}，非周三（--force 可强制）"]
    away = int(target.timestamp() - now_sv)
    lines.append(f"目标：{target.strftime('%m-%d %H:%M')}（{src}），{away} 秒后开抢")
    if dry_run:
        return lines + ["[dry-run] 不发抢购请求"]
    deadline_local = time.time() + max(0.0, target.timestamp() - lead - now_sv)
    refreshed = False
    while True:
        remain = deadline_local - time.time()
        if remain <= 0:
            break
        if refreshed and remain > 30:
            time.sleep(min(remain - 30, 20))
            continue
        if remain > 150:
            time.sleep(min(30, remain - 150))
            if not refreshed:
                try:
                    d = wed_api(s, referer, "queryDrawPrizeInfo")
                    now_sv = d["currentTime"] / 1000
                    deadline_local = time.time() + max(0.0, target.timestamp() - lead - now_sv)
                except Exception:
                    s, referer = fresh_session()
            continue
        if not refreshed and remain > 30:
            s, referer = fresh_session()
            refreshed = True
            continue
        time.sleep(min(0.2, remain))
    last, fired = "", 0
    for i in range(1, max_attempts + 1):
        fired = i
        t0 = time.monotonic()
        try:
            r = s.post(f"{API_WED}/drawPrize", json={}, headers=api_headers(referer), timeout=10)
            resp = r.json()
        except Exception as e:
            resp = {"code": "EXC", "msg": str(e)}
        code, msg = str(resp.get("code")), resp.get("msg") or ""
        log.info("[周三秒杀] 第%d发: %s %s", i, code, msg)
        if code == "0":
            prizes = (resp.get("data") or {}).get("actPrizes") or []
            won = []
            for p in prizes:
                won.append(p.get('prizeName') or p.get('shortName') or '?')
            lines.append(f"抢中：{'、'.join(won)}")
            break
        last = f"{code} {msg}"
        if code in {"160002"}:
            lines.append(f"停止：{last}")
            break
        remain = interval - (time.monotonic() - t0)
        if remain > 0:
            time.sleep(remain)
    else:
        lines.append(f"未中（{fired} 发，最后 {last}）")
    return lines


# ============================== AI豆苗养成记 ==============================

def run_seed(a, dry_run):
    if not a.coc3_ticket:
        return []
    s = new_session()
    s.headers.update({"accept": "application/json, text/plain, */*",
                      "content-type": "application/json;charset=utf-8",
                      "origin": "https://dev.coc.10086.cn", "referer": SEED_PAGE})
    r = s.post(SEED_LOGIN, json={"ticket": a.coc3_ticket, "ticketType": 11,
                                 "businessType": "RIGHTS_MARKET", "wxoaType": "",
                                 "m1": "", "m2": "", "s1": "", "s2": "", "from": "",
                                 "jsid": a.coc3_ticket}, timeout=30).json()
    token = (r.get("data") or {}).get("token")
    if not token:
        return ["AI豆苗：coc3_ticket 失效，请重新抓包"]
    s.headers["phone"] = token
    def post(path, body):
        for _ in (1, 2):
            try:
                return s.post(SEED_BASE + path, json=body, timeout=30).json()
            except requests.RequestException:
                time.sleep(1)
        return {"resultCode": "NETWORK_ERROR"}
    info = post("/cmpp-manage/task/getTaskSignInfo",
                {"taskId": SEED_SIGN_TASK_ID, "needQyCredits": 1, "needLimit": 0})
    data = info.get("data") or {}
    count = int(data.get("accumulateCount") or 0)
    lines = [f"AI豆苗：累计 {count} 天"]
    if not dry_run and info.get("resultCode") == 0 and count == 0:
        body = {"taskId": SEED_SIGN_TASK_ID, "channelCode": SEED_CHANNEL, "needLimit": 0}
        body["wtAc"] = SEED_WTAC
        body["wtAcId"] = str(uuid.uuid4())
        r = post("/cmpp-manage/task/accumulateSign", body)
        if r.get("resultCode") == 0:
            lines[0] = "AI豆苗：已签到"
    return lines

# ============================== 话费余额 ==============================

def run_fee(a):
    if not a.fee_session:
        return []
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    except ImportError:
        return []
    def enc(text):
        pad = 16 - len(text.encode()) % 16
        d = text.encode() + bytes([pad]) * pad
        e = Cipher(algorithms.AES(FEE_KEY), modes.CBC(FEE_KEY)).encryptor()
        b1 = base64.b64encode(e.update(d) + e.finalize()).decode()
        return base64.b64encode(b1.encode()).decode()
    def dec(nested):
        ct = base64.b64decode(base64.b64decode(nested))
        d = Cipher(algorithms.AES(FEE_KEY), modes.CBC(FEE_KEY)).decryptor()
        p = d.update(ct) + d.finalize()
        return json.loads(p[:-p[-1]])
    s = new_session()
    s.cookies.set("jsessionid-cmcc", a.fee_session, domain="10086.cn")
    token = enc(a.phone)
    headers = {"user-agent": USER_AGENT, "payphoneno": token + a.phone[5:7],
               "provcode": a.province_code or "731",
               "referer": f"{FEE_BASE}/i/reapp/v2.0/pages/recharge/recharge.html",
               "accept": "*/*"}
    r = s.get(f"{FEE_BASE}/i/v1/fee/real/{token}",
              params={"time": datetime.now().strftime('%Y%m%d%H%M%S%f')[:-3], "channel": "11"},
              headers=headers, timeout=15).json()
    if r.get("retCode") != "000000":
        return [f"话费余额：查询失败 {r.get('retCode')}"]
    fee = dec(r["data"]["outParam"])
    return [f"话费余额：{fee.get('realBalanceFee', '?')} 元"]

# ============================== 主流程 ==============================

def run_account(a, args, config=None):
    cfg = config or CONFIG
    lines = []
    try:
        # 1. 每日签到与连签领奖
        if cfg.get("ENABLE_SIGN", True):
            lines += run_sign(a, args.dry_run)

        # 2. AI豆任务与顶格兑话费
        do_tasks = cfg.get("ENABLE_TASKS", True)
        do_gold = cfg.get("ENABLE_GOLD", True)
        if do_tasks or do_gold:
            s, referer = exchange_session(a)
            if do_tasks:
                lines += run_tasks(a, s, referer, args.dry_run)
            if do_gold:
                lines += run_gold(a, s, referer, args.dry_run)

        # 3. 拓展活动（游戏试玩/追剧等轻量任务）
        if cfg.get("ENABLE_GAMES", True):
            lines += run_games(a, args.dry_run)

        # 4. 周三充值日拼图
        if cfg.get("ENABLE_WED_PUZZLE", True):
            lines += run_wed(a, args.dry_run)

        # 5. AI豆苗养成记 (仅在有 coc3_ticket 时执行)
        if cfg.get("ENABLE_SEED", True):
            if a.coc3_ticket:
                lines += run_seed(a, args.dry_run)
            else:
                log.debug("账号 %s 未配置 CMCC_COC3_TICKET，跳过豆苗任务", mask_phone(a.phone))

        # 6. 话费余额查询 (仅在有 fee_session 时执行)
        if cfg.get("ENABLE_FEE", True):
            if a.fee_session:
                lines += run_fee(a)
            else:
                log.debug("账号 %s 未配置 CMCC_FEE_SESSION，跳过话费查询", mask_phone(a.phone))
    except Exception as e:
        log.exception("账号 %s 执行失败: %s", mask_phone(a.phone), e)
        lines.append(f"异常: {e}")
    return lines

def main():
    ap = argparse.ArgumentParser(description="中国移动全功能聚合脚本 (默认全开模式)")
    ap.add_argument("--dry-run", action="store_true", help="只查状态与余额，不做写操作")
    ap.add_argument("--only-sign", action="store_true", help="仅执行每日签到，跳过其他全部任务")
    ap.add_argument("--no-tasks", action="store_true", help="跳过 AI 豆日常任务")
    ap.add_argument("--no-gold", action="store_true", help="跳过 AI 豆兑换话费券")
    ap.add_argument("--no-games", action="store_true", help="跳过拓展游戏与追剧任务")
    ap.add_argument("--no-wed", action="store_true", help="跳过周三充值日拼图")
    ap.add_argument("--no-seed", action="store_true", help="跳过 AI 豆苗养成记")
    ap.add_argument("--no-fee", action="store_true", help="跳过话费余额查询")
    # 兼容历史命令行开关
    ap.add_argument("--tasks", action="store_true", help="显式指定执行 AI 豆任务 (默认已开启)")
    ap.add_argument("--gold", action="store_true", help="显式指定执行 AI 豆兑话费 (默认已开启)")
    ap.add_argument("--games", action="store_true", help="显式指定执行拓展活动 (默认已开启)")
    ap.add_argument("--wed", action="store_true", help="显式指定执行周三拼图 (默认已开启)")
    ap.add_argument("--seed", action="store_true", help="显式指定执行 AI 豆苗 (默认已开启)")
    ap.add_argument("--fee", action="store_true", help="显式指定执行话费查询 (默认已开启)")
    # 周三秒杀专用模式开关
    ap.add_argument("--wed-seckill", action="store_true", help="周三充值日秒杀模式 (定时 07:58 执行)")
    ap.add_argument("--force", action="store_true", help="周三秒杀非周三也强制等待")
    ap.add_argument("--at", help="秒杀指定时刻 HH:MM[:SS]")
    ap.add_argument("--interval", type=float, default=0.35)
    ap.add_argument("--lead", type=float, default=0.4)
    ap.add_argument("--max-attempts", type=int, default=120)
    args = ap.parse_args()

    # 计算生效配置 (默认全开，按参数覆盖)
    active_cfg = dict(CONFIG)
    if args.only_sign:
        for k in active_cfg:
            if k != "ENABLE_SIGN":
                active_cfg[k] = False
    else:
        if args.no_tasks: active_cfg["ENABLE_TASKS"] = False
        if args.no_gold: active_cfg["ENABLE_GOLD"] = False
        if args.no_games: active_cfg["ENABLE_GAMES"] = False
        if args.no_wed: active_cfg["ENABLE_WED_PUZZLE"] = False
        if args.no_seed: active_cfg["ENABLE_SEED"] = False
        if args.no_fee: active_cfg["ENABLE_FEE"] = False

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    if requests is None:
        log.error("缺少 requests，请先安装：pip3 install requests")
        return 1
    accounts = load_accounts()
    if not accounts:
        log.error("未配置 CMCC_AUTH。多账号格式：每行一个 JSON 或 app_token#手机号")
        return 1
    log.info("检测到 %d 个账号", len(accounts))
    all_lines = []
    failed = 0
    for i, a in enumerate(accounts):
        err = a.validate()
        if err:
            all_lines.append(f"• 账号{i+1} 配置无效：{err}")
            failed += 1
            continue
        log.info("开始处理账号 %s", mask_phone(a.phone))
        if args.wed_seckill:
            lines = wed_seckill(a, args.dry_run, args.at, args.interval,
                                args.lead, args.max_attempts, args.force)
        else:
            lines = run_account(a, args, active_cfg)
        bullets = "\n".join(f"• {ln}" for ln in lines if ln)
        if len(accounts) > 1:
            all_lines.append(f"【账号 {i+1}: {mask_phone(a.phone)}】\n{bullets}")
        else:
            all_lines.append(bullets)
        if i < len(accounts) - 1:
            time.sleep(random.uniform(1, 3))
    summary = "\n\n".join(all_lines)
    subtitle = (f"执行完成 ({len(accounts)}个账号)" if len(accounts) > 1
                else f"执行完成 (1个账号) - 【{mask_phone(accounts[0].phone) if accounts else '?'}】")
    print("\n========== 执行结果 ==========\n" + summary)
    notify("中国移动 · 每日聚合", f"{subtitle}\n\n{summary}")
    return 1 if failed else 0

if __name__ == "__main__":
    sys.exit(main())

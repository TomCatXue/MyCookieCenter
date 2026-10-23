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
  python3 cmcc_all.py --no-qinbi          # 跳过陕西秦币专区任务
  python3 cmcc_all.py --qinbi-keepalive   # 陕西秦币20分钟轻量心跳保活 (滑动延期Session)
  python3 cmcc_all.py --wed-seckill       # 周三充值日秒杀模式（建议定时 58 7 * * 3）

青龙定时（直接使用默认命令，开箱即用）：
  # 每天 08:20：每日聚合全功能主任务（★默认全开，无需额外命令行参数）
  20 8 * * *  python3 cmcc_all.py

  # 陕西秦币心跳保活（可选，每20分钟轻量延期会话，维持30分钟滑动窗口长期有效）：
  */20 7-23 * * *  python3 cmcc_all.py --qinbi-keepalive

  # 每周三 07:58：充值日秒杀（提前 2 分钟拉起预热，自旋至 08:00 开抢）
  58 7 * * 3  python3 cmcc_all.py --wed-seckill

  # 签到有礼场次秒杀已拆分到独立脚本 cmcc_seckill.py：
  #   先跑 python3 cmcc_seckill.py --dry-run 看排期（会推送下一场时间与建议 cron）
  #   再按提示设置定时，执行 python3 cmcc_seckill.py
"""
import argparse, base64, ipaddress, json, logging, os, random, re, ssl, sys, time, uuid
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from pathlib import Path
from urllib.parse import urlsplit
try:
    import requests
    from requests.adapters import HTTPAdapter
except ImportError:
    requests = None
    HTTPAdapter = object

SCRIPT_VERSION = "v1.1.0"
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
    # --- 陕西移动 · 秦币专区任务模块 (默认全部自动执行) ---
    "ENABLE_QINBI": True,                # 陕西秦币专区总开关
    "ENABLE_QINBI_BUBBLE": True,         # 气泡收割（天天登录气泡，每次+5秦币）
    "ENABLE_QINBI_SIGN": True,           # 每日星星打卡（点亮星星）
    "ENABLE_QINBI_TASKS": True,          # 赚秦币/领福利子任务（自动完成并核销）
    "ENABLE_QINBI_LOTTERY": True,        # 每日免费抽奖（严格安全防线：仅在有免费次数时抽奖，绝不消耗秦币）
    "ENABLE_QINBI_MONTHLY_GIFT": True,   # 月末集星大礼包（集满3星领取30秦币+1GB日包）
    "ENABLE_QINBI_PRIVILEGE": True,      # 月度福利特权查验与提醒 (1GB流量/5元话费加赠券)
    "ENABLE_QINBI_EXCHANGE": True,       # 大额资产自动兑换（达到 1500 秦币自动兑换话费/AI豆）
    "QINBI_EXCHANGE_MODE": 1,            # 兑换模式：1 仅15元话费；2 话费优先，无货顺位备选1000 AI豆
    "QINBI_HEARTBEAT_NOTIFY": False,     # 保活心跳模式是否发通知 (默认 False 彻底静默，领到后绝不打扰)
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
                 coc3_ticket="", fee_session="", qinbi_token=""):
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
        self.qinbi_token = qinbi_token

    @property
    def act_url(self):
        return f"{BASE}/qwhdhub/qwhdmark/{self.activity_id}?channelId={self.channel_id}"

    def validate(self):
        if not self.app_token and not self.qinbi_token:
            return "缺少凭证 (app_token 与 qinbi_token 至少需提供一个)"
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
                       fee_session=d.get("fee_session", ""),
                       qinbi_token=str(d.get("qinbi_token", "")).strip())
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
    accounts = [a for a in accounts if a]
    coc3 = [x.strip() for x in re.split(r"[\n&]+", os.environ.get("CMCC_COC3_TICKET", "")) if x.strip()]
    fee = [x.strip() for x in re.split(r"[\n&]+", os.environ.get("CMCC_FEE_SESSION", "")) if x.strip()]
    qinbi_raw = [x.strip() for x in re.split(r"[\n&]+", os.environ.get("CMCC_QINBI_AUTH", "")) if x.strip()]

    for i, a in enumerate(accounts):
        if i < len(coc3):
            a.coc3_ticket = coc3[i]
        if i < len(fee):
            a.fee_session = fee[i]

    # 关联 CMCC_QINBI_AUTH (优先按手机号匹配，其次按索引对齐)
    for q in qinbi_raw:
        q_token, q_phone = "", ""
        if q.startswith("{"):
            try:
                qd = json.loads(q)
                q_token = str(qd.get("token") or qd.get("qinbi_token") or "").strip()
                q_phone = str(qd.get("phone") or qd.get("phoneNum") or "").strip()
            except Exception:
                pass
        elif "#" in q:
            qp = q.split("#")
            q_token = qp[0].strip()
            q_phone = qp[1].strip() if len(qp) > 1 else ""
        else:
            q_token = q.strip()
        if not q_token:
            continue

        matched = False
        if q_phone:
            for a in accounts:
                if a.phone == q_phone:
                    a.qinbi_token = q_token
                    matched = True
                    break
        if not matched:
            for a in accounts:
                if not a.qinbi_token:
                    a.qinbi_token = q_token
                    if not a.phone and q_phone:
                        a.phone = q_phone
                    break

    # 若仅配置了 CMCC_QINBI_AUTH，独立构建陕西秦币账号
    if not accounts and qinbi_raw:
        for q in qinbi_raw:
            qp = q.split("#") if "#" in q else [q, ""]
            tok = qp[0].strip()
            ph = qp[1].strip() if len(qp) > 1 else ""
            if tok:
                accounts.append(Account(app_token="", phone=ph, qinbi_token=tok))

    return accounts


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
            r = s.post(login_url, json={**base_body, "jwtToken": cached, "token": a.app_token}, timeout=30)
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
            dm, dp, qm, qp = act["sign"]
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

# ============================== 陕西移动 · 秦币专区 (模块化任务体系) ==============================

QINBI_BASE = "https://sn.clientaccess.10086.cn/html5/indivbusi"
QINBI_RECORD_FILE = Path(__file__).parent / "qincoin_exchange_cache.json"

def is_qinbi_claimed_this_month(phone):
    """查验账号当月是否已成功完成大额奖品兑换 (领到后后续保活彻底静默)"""
    if not QINBI_RECORD_FILE.exists():
        return False
    try:
        data = json.loads(QINBI_RECORD_FILE.read_text(encoding="utf-8"))
        user_rec = data.get(str(phone), {})
        current_month = now_cn().strftime("%Y-%m")
        return user_rec.get("claimed_month") == current_month
    except Exception:
        return False

class QinbiSessionExpiredError(Exception):
    """陕西秦币 Session 30分钟无操作超时异常"""
    pass

class QinbiContext:
    """陕西秦币会话上下文：封装网络会话、Token、鉴权头与信息缓存"""
    def __init__(self, phone, token, session=None, dry_run=False):
        self.phone = phone
        self.token = str(token or "").replace("JSESSIONID=", "").strip()
        self.session = session or new_session()
        self.dry_run = dry_run
        self.query_data = None

    def post(self, endpoint, req_body=None):
        import urllib.request
        url = f"{QINBI_BASE}/{endpoint}"
        body = req_body if req_body is not None else {}
        payload = {
            "token": self.token,
            "phoneNum": self.phone,
            "reqBody": body
        }
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": USER_AGENT,
            "Origin": "https://sn.clientaccess.10086.cn",
            "Referer": "https://sn.clientaccess.10086.cn/html5/sx/qinCoin/index.html?channelId=P00000063983&yx=1390514002",
            "Cookie": f"JSESSIONID={self.token}; loginName={self.phone}; is_login=true",
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                res = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                res = json.loads(e.read().decode("utf-8", errors="replace"))
            except Exception:
                return {"resCode": str(e.code), "resDesc": str(e)}
        except Exception as e:
            log.warning("秦币接口 [%s] 请求异常: %s", endpoint, e)
            return {"resCode": "999", "resDesc": str(e)}

        res_code = str(res.get("resCode", ""))
        if res_code == "201":
            raise QinbiSessionExpiredError("陕西秦币会话已休眠 (超过30分钟未操作)，请在手机打开一次手厅由Loon自动捕获自愈")
        return res

    def get_info(self, force_refresh=False):
        if self.query_data is None or force_refresh:
            res = self.post("qinCoin/queryInfo", {})
            if res.get("resCode") == "200":
                self.query_data = res.get("resBody") or {}
            else:
                self.query_data = {}
        return self.query_data


# -------------------- 模块化子任务体系 (基类与具体模块) --------------------

class QinbiBaseModule:
    """标准秦币子任务模块基类，确保任何模块可随时独立插拔或增删"""
    tag = ""          # 模块英文标识
    name = ""         # 模块中文名称
    cfg_key = ""      # 全局配置开关键名

    def is_enabled(self, cfg):
        return cfg.get(self.cfg_key, True)

    def execute(self, ctx: QinbiContext, cfg: dict):
        """
        子模块执行入口，返回字符串行或 None
        若执行正常且无可汇报增量，返回 None
        """
        raise NotImplementedError


class QinbiBubbleModule(QinbiBaseModule):
    """子模块 1：天天登录气泡查收与倒计时探测"""
    tag = "bubble"
    name = "气泡收割"
    cfg_key = "ENABLE_QINBI_BUBBLE"

    def execute(self, ctx, cfg):
        bubble_res = ctx.post("qinCoin/queryBubble", {})
        if bubble_res.get("resCode") != "200":
            return f"气泡查询失败: {bubble_res.get('resDesc', '接口异常')}"
        bubbles = bubble_res.get("resBody") or []
        if not bubbles:
            return None

        results = []
        for b in bubbles:
            b_id = b.get("id", "qp1")
            b_name = b.get("qpName", "天天登录")
            b_coins = b.get("qb", 5)
            if_get = b.get("ifGet", False)
            remaining = b.get("remainingTime", "")

            if if_get:
                if not ctx.dry_run:
                    rec = ctx.post("qinCoin/receive", {"type": b_id})
                    if rec.get("resCode") == "200":
                        results.append(f"成功收取 [{b_name}] +{b_coins} 秦币")
                    else:
                        results.append(f"[{b_name}] 领取失败: {rec.get('resDesc', '未知')}")
                else:
                    results.append(f"(只读) [{b_name}] 已成熟待收 +{b_coins} 秦币")
            else:
                results.append(f"[{b_name}] 冷却倒计时 (剩余 {remaining or '冷却中'})")
        return "\n".join(results) if results else None


class QinbiSignModule(QinbiBaseModule):
    """子模块 2：每日星星打卡点亮"""
    tag = "sign"
    name = "星星打卡"
    cfg_key = "ENABLE_QINBI_SIGN"

    def execute(self, ctx, cfg):
        info = ctx.get_info()
        star_info = info.get("starInfo") or {}
        signin_state = star_info.get("signinBtnState", 0)
        current_star = star_info.get("star", 0)

        if signin_state == 1:
            if not ctx.dry_run:
                res = ctx.post("qinCoin/signinLightUp", {})
                if res.get("resCode") == "200":
                    new_star = (res.get("resBody") or {}).get("star", current_star + 1)
                    return f"成功点亮今日星星 (当前当月累积 {new_star} 颗星)"
                else:
                    return f"打卡失败 ({res.get('resDesc', '未知')})"
            else:
                return f"(只读) 今日未打卡，可点亮第 {current_star + 1} 颗星"
        else:
            return f"今日已打卡 (当前当月累积 {current_star} 颗星)"


class QinbiGiftModule(QinbiBaseModule):
    """子模块 3：月末集星大礼包一键领取 (满3星自动领 30秦币+1GB流量日包)"""
    tag = "gift"
    name = "月末礼包"
    cfg_key = "ENABLE_QINBI_MONTHLY_GIFT"

    def execute(self, ctx, cfg):
        info = ctx.get_info()
        star_info = info.get("starInfo") or {}
        btn_state = star_info.get("btnState", 0)
        current_star = star_info.get("star", 0)

        if btn_state == 1:
            if not ctx.dry_run:
                rec = ctx.post("qinCoin/receive", {"type": "yjlq"})
                if rec.get("resCode") == "200":
                    return "🎉 成功领取月末集星大礼包 [30秦币 + 1GB流量日包]！"
                else:
                    return f"大礼包领取失败 ({rec.get('resDesc', '未知')})"
            else:
                return "(只读) 已集齐满星，可领取 [30秦币 + 1GB流量日包]"
        elif btn_state == 2:
            return "本月集星大礼包已领取"
        else:
            return f"未达满星达标线 (当前累积 {current_star}/3 颗星)"


class QinbiTasksModule(QinbiBaseModule):
    """子模块 4：赚秦币日常浏览与领福利子任务"""
    tag = "tasks"
    name = "赚币日常"
    cfg_key = "ENABLE_QINBI_TASKS"

    def execute(self, ctx, cfg):
        info = ctx.get_info()
        zqb_info = info.get("zqbInfo") or {}
        task_total = zqb_info.get("taskTotal", 0)
        task_over = zqb_info.get("taskOver", 0)
        task_id = zqb_info.get("taskId", "")
        lfl_cnt = zqb_info.get("lflCnt", 0)

        lines = []
        if task_id and task_over < task_total:
            if not ctx.dry_run:
                rec = ctx.post("qinCoin/receive", {"type": "zqb", "id": task_id})
                if rec.get("resCode") == "200":
                    lines.append(f"成功核销任务奖励 [{task_id}]")
                else:
                    lines.append(f"任务 [{task_id}] 核销失败 ({rec.get('resDesc', '未知')})")
            else:
                lines.append(f"(只读) 发现待核销任务奖励 [{task_id}]")
        else:
            lines.append(f"今日日常任务已全部完成 ({task_over}/{task_total})")

        if lfl_cnt > 0:
            if not ctx.dry_run:
                rec = ctx.post("qinCoin/receive", {"type": "lfl"})
                if rec.get("resCode") == "200":
                    lines.append("成功领取专属福利")
            else:
                lines.append(f"(只读) 发现待领取福利 (剩余 {lfl_cnt} 次)")
        return "\n".join(lines) if lines else None


class QinbiLotteryModule(QinbiBaseModule):
    """子模块 5：每日免费幸运抽奖 (绝不付费，严禁消耗秦币)"""
    tag = "lottery"
    name = "免费抽奖"
    cfg_key = "ENABLE_QINBI_LOTTERY"

    def execute(self, ctx, cfg):
        info = ctx.get_info()
        zqb_info = info.get("zqbInfo") or {}
        gift_lottery = zqb_info.get("giftLottery", 0)

        if gift_lottery > 0:
            if not ctx.dry_run:
                rec = ctx.post("qinCoin/lottery", {"type": 1})
                if rec.get("resCode") == "200":
                    rb = rec.get("resBody") or {}
                    prize_name = rb.get("prizeName") or "谢谢参与"
                    return f"获得 [{prize_name}] (消耗免费抽奖 1 次)"
                else:
                    return f"抽奖失败 ({rec.get('resDesc', '未知')})"
            else:
                return f"(只读) 剩余免费抽奖 {gift_lottery} 次"
        else:
            return "今日无免费次数 (严格跳过付费抽奖，杜绝蚕食秦币)"


class QinbiPrivilegeModule(QinbiBaseModule):
    """子模块 6：月度福利特权查验与提醒 (1GB流量 / 5元话费加赠券)"""
    tag = "privilege"
    name = "福利特权"
    cfg_key = "ENABLE_QINBI_PRIVILEGE"

    def execute(self, ctx, cfg):
        info = ctx.get_info()
        priv_info = info.get("privilegeInfo") or {}
        tq1_list = priv_info.get("tq1") or []
        claimable = []
        for t in tq1_list:
            if t.get("state") == 1:
                claimable.append(f"{t.get('title')}({t.get('desc')})")
        if claimable:
            return f"发现可用月度特权 [{', '.join(claimable)}] (可前往手厅秦币专区激活)"
        return None


class QinbiExchangeModule(QinbiBaseModule):
    """子模块 7：大额资产达到 1500 秦币自动兑换 (15元话费优先，AI豆备选，防重保护)"""
    tag = "exchange"
    name = "资产兑换"
    cfg_key = "ENABLE_QINBI_EXCHANGE"

    def execute(self, ctx, cfg):
        # 1. 查验本月是否已经领到了
        current_month = now_cn().strftime("%Y-%m")
        record = {}
        if QINBI_RECORD_FILE.exists():
            try:
                record = json.loads(QINBI_RECORD_FILE.read_text(encoding="utf-8"))
            except Exception:
                pass
        user_record = record.get(str(ctx.phone), {})
        if user_record.get("claimed_month") == current_month:
            return f"本月 ({current_month}) 已兑换领到 [{user_record.get('prod_name')}] (自动休眠)"

        # 2. 查验实时余额
        info = ctx.get_info(force_refresh=True)
        coin_info = info.get("qinCoinInfo") or {}
        balance = coin_info.get("qinCoinBalance", 0)

        if balance < 1500:
            return f"当前秦币 {balance} 个，未达 1500 门槛 (距 15元话费还差 {1500 - balance} 个)"

        # 3. 检索可兑商品列表
        priv_info = info.get("privilegeInfo") or {}
        tq4 = priv_info.get("tq4") or []
        prod_map = {}
        for cat in tq4:
            for item in cat.get("items", []):
                prod_map[item.get("id")] = item

        mode = cfg.get("QINBI_EXCHANGE_MODE", 1)
        target_prod = None

        # 优先 15元直充话费 (prodId: 19)
        item_19 = prod_map.get(19)
        if item_19 and item_19.get("exchange") is True:
            target_prod = item_19
        elif mode == 2:
            # 备选 1000 AI豆 (prodId: 25)
            item_25 = prod_map.get(25)
            if item_25 and item_25.get("exchange") is True:
                target_prod = item_25

        if not target_prod:
            return f"当前秦币 {balance} 个已达标，但目标商品暂无可兑资格或库存已告罄"

        target_id = target_prod.get("id")
        target_name = target_prod.get("prodName", "目标商品")

        if ctx.dry_run:
            return f"(只读探测) 达到 1500 门槛，检测到 [{target_name}] 可直接兑换"

        # 发起真实兑换
        res = ctx.post("qinCoin/exchange", {"prodId": target_id})
        if res.get("resCode") == "200":
            user_record = {
                "claimed_month": current_month,
                "prod_id": target_id,
                "prod_name": target_name,
                "time": now_cn().strftime("%Y-%m-%d %H:%M:%S")
            }
            record[str(ctx.phone)] = user_record
            try:
                QINBI_RECORD_FILE.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception as ex:
                log.warning("保存兑换记录文件失败: %s", ex)
            return f"🎉 成功兑换 [{target_name}]！消耗 1500 秦币"
        else:
            return f"兑换 [{target_name}] 失败: {res.get('resDesc', '未知错误')}"


# ==================== 🛠️ 模块化任务流水线 (可随时拔插、增删、注释单行屏蔽) ====================
QINBI_MODULES = [
    QinbiBubbleModule(),       # 1. 气泡成熟查收 (天天登录气泡 +5)
    QinbiSignModule(),         # 2. 每日星星打卡点亮 (月度打卡)
    QinbiGiftModule(),         # 3. 月末集星大礼包 (满3星领 30秦币+1GB流量日包)
    QinbiTasksModule(),        # 4. 赚秦币与领福利日常子任务
    QinbiLotteryModule(),      # 5. 每日免费幸运抽奖 (安全底线：绝不花秦币抽奖)
    QinbiPrivilegeModule(),    # 6. 月度福利特权查验与提醒 (1GB流量/5元话费加赠券)
    QinbiExchangeModule(),     # 7. 大额资产自动兑换 (1500秦币话费/AI豆，带防重落盘)
]


def run_qinbi(a, args, cfg):
    """陕西移动秦币专区模块化调度主流程"""
    lines = ["【陕西移动 · 秦币专区】"]
    ctx = QinbiContext(a.phone, a.qinbi_token, dry_run=args.dry_run)

    # 1. 验证会话并拉取全局基础数据
    try:
        info = ctx.get_info()
    except QinbiSessionExpiredError as e:
        log.warning("账号 %s 陕西秦币会话失效: %s", mask_phone(a.phone), e)
        return ["陕西秦币: 会话已休眠 (超过30分钟未操作)，请在手机打开一次手厅由Loon自动捕获自愈"]
    except Exception as e:
        log.warning("账号 %s 陕西秦币连接异常: %s", mask_phone(a.phone), e)
        return [f"陕西秦币: 查询失败 ({e})"]

    if not info:
        return ["陕西秦币: 无法获取专区基础数据"]

    initial_coins = info.get("qinCoinInfo", {}).get("qinCoinBalance", 0)

    # 2. 依次调度模块流水线中的所有子任务 (相互独立隔离)
    for mod in QINBI_MODULES:
        if not mod.is_enabled(cfg):
            log.debug("秦币模块 [%s] 开关关闭，跳过", mod.name)
            continue

        try:
            res_text = mod.execute(ctx, cfg)
            if res_text:
                for sub_line in res_text.splitlines():
                    if sub_line.strip():
                        lines.append(f"【秦币·{mod.name}】{sub_line.strip()}")
        except QinbiSessionExpiredError as e:
            lines.append("• 会话超时休眠: 请在手机打开手厅自愈")
            break
        except Exception as e:
            log.warning("秦币模块 [%s] 执行异常: %s", mod.name, e)
            lines.append(f"【秦币·{mod.name}】执行异常 ({e})")

    # 3. 最终资产核验
    try:
        final_info = ctx.get_info(force_refresh=True)
        final_coins = final_info.get("qinCoinInfo", {}).get("qinCoinBalance", initial_coins)
        diff = final_coins - initial_coins
        delta_str = f" (+{diff})" if diff > 0 else ""
        lines.append(f"【秦币·资产汇总】当前可用总额: {final_coins} 个{delta_str}")
    except Exception:
        pass

    return lines


def run_qinbi_heartbeat(accounts, cfg, dry_run=False):
    """
    轻量级心跳保活模式 (建议 Cron: */20 7-23 * * *)
    保持后端 30 分钟无操作滑动窗口持续刷新，Session 不失效
    【核心原则】：
      1. 正常保活：100% 静默，绝不发送打扰通知
      2. 若本月大额奖励已兑换领到 (15元话费/AI豆)：后续保活失效彻底静默，绝不发通知打扰
      3. 默认 QINBI_HEARTBEAT_NOTIFY=False，杜绝高频轰炸
    """
    log.info("💓 启动陕西移动秦币心跳保活检测...")
    expired_accounts = []
    active_count = 0

    for a in accounts:
        if not a.qinbi_token:
            continue
        ctx = QinbiContext(a.phone, a.qinbi_token, dry_run=dry_run)
        try:
            info = ctx.get_info(force_refresh=True)
            if info:
                balance = info.get("qinCoinInfo", {}).get("qinCoinBalance", 0)
                log.info("账号 %s 秦币心跳保活成功，Session 已顺延 30 分钟 (秦币余额: %s)", mask_phone(a.phone), balance)
                active_count += 1
        except QinbiSessionExpiredError:
            # 查验本月是否已经领到了大额奖励
            if is_qinbi_claimed_this_month(a.phone):
                log.info("账号 %s 本月已成功领到兑换奖励，后续保活保持静默，不发通知打扰", mask_phone(a.phone))
            else:
                log.warning("账号 %s 秦币会话已休眠，等待 Loon 插件自动捕获自愈", mask_phone(a.phone))
                expired_accounts.append(a)
        except Exception as e:
            log.warning("账号 %s 秦币心跳检测异常: %s", mask_phone(a.phone), e)

    log.info("💓 心跳保活完成: %d 个在线活跃，%d 个已休眠", active_count, len(expired_accounts))

    # 仅当开启了通知开关、且确实有未领到奖的失效账号时，才发送轻量提醒
    if expired_accounts and cfg.get("QINBI_HEARTBEAT_NOTIFY", False):
        phones = ", ".join(mask_phone(x.phone) for x in expired_accounts)
        notify("中国移动 · 秦币会话休眠提醒",
               f"• 账号 [{phones}] 陕西秦币会话已超时休眠\n• 请在手机上打开一次中国移动App秦币专区，Loon将自动静默捕获并同步最新凭据。")
    return 0

# ============================== 全局模块化任务流水线 (Task Pipeline) ==============================

def get_qwhd_session(a):
    """会话级缓存：避免 AI豆赚豆与兑换话费重复调用 exchange_session 消耗网络"""
    if not hasattr(a, "_qwhd_session_cache") or a._qwhd_session_cache is None:
        a._qwhd_session_cache = exchange_session(a)
    return a._qwhd_session_cache


class CmccBaseTaskModule:
    """中国移动通用任务模块基类，统一支持启停开关、依赖凭据自检与执行隔离"""
    tag = ""          # 模块英文标识
    name = ""         # 模块中文名称
    cfg_key = ""      # 全局配置开关键名

    def is_enabled(self, a, cfg: dict) -> bool:
        """检查该账号与全局配置下是否允许运行该模块"""
        return cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg: dict) -> list:
        """执行该模块业务逻辑，返回标准化通知行列表"""
        raise NotImplementedError


class CmccSignTaskModule(CmccBaseTaskModule):
    """模块 1：每日签到与连签阶梯领奖"""
    tag = "sign"
    name = "每日签到与连签"
    cfg_key = "ENABLE_SIGN"

    def is_enabled(self, a, cfg):
        return bool(a.app_token) and cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        return run_sign(a, args.dry_run)


class CmccAITasksTaskModule(CmccBaseTaskModule):
    """模块 2：AI豆日常赚豆任务 (浏览/分享)"""
    tag = "ai_tasks"
    name = "AI豆赚豆任务"
    cfg_key = "ENABLE_TASKS"

    def is_enabled(self, a, cfg):
        return bool(a.app_token) and cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        s, referer = get_qwhd_session(a)
        return run_tasks(a, s, referer, args.dry_run)


class CmccGoldTaskModule(CmccBaseTaskModule):
    """模块 3：AI豆顶格兑换话费券"""
    tag = "gold"
    name = "AI豆顶格兑话费"
    cfg_key = "ENABLE_GOLD"

    def is_enabled(self, a, cfg):
        return bool(a.app_token) and cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        s, referer = get_qwhd_session(a)
        return run_gold(a, s, referer, args.dry_run)


class CmccGamesTaskModule(CmccBaseTaskModule):
    """模块 4：拓展活动 (游戏试玩打卡、热门剧集打卡等轻量任务)"""
    tag = "games"
    name = "拓展活动(游戏/追剧)"
    cfg_key = "ENABLE_GAMES"

    def is_enabled(self, a, cfg):
        return bool(a.app_token) and cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        return run_games(a, args.dry_run)


class CmccWedPuzzleTaskModule(CmccBaseTaskModule):
    """模块 5：周三充值日拼图抽奖与领券"""
    tag = "wed_puzzle"
    name = "周三充值日拼图"
    cfg_key = "ENABLE_WED_PUZZLE"

    def is_enabled(self, a, cfg):
        return bool(a.app_token) and cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        return run_wed(a, args.dry_run)


class CmccSeedTaskModule(CmccBaseTaskModule):
    """模块 6：AI豆苗养成记 (coc3)"""
    tag = "seed"
    name = "AI豆苗养成记"
    cfg_key = "ENABLE_SEED"

    def is_enabled(self, a, cfg):
        if not a.coc3_ticket:
            log.debug("账号 %s 未配置 CMCC_COC3_TICKET，跳过豆苗任务", mask_phone(a.phone))
            return False
        return cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        return run_seed(a, args.dry_run)


class CmccFeeTaskModule(CmccBaseTaskModule):
    """模块 7：实时话费余额查询"""
    tag = "fee"
    name = "实时话费查询"
    cfg_key = "ENABLE_FEE"

    def is_enabled(self, a, cfg):
        if not a.fee_session:
            log.debug("账号 %s 未配置 CMCC_FEE_SESSION，跳过话费查询", mask_phone(a.phone))
            return False
        return cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        return run_fee(a)


class CmccQinbiTaskModule(CmccBaseTaskModule):
    """模块 8：陕西移动 · 秦币专区 (含7大模块化子任务)"""
    tag = "qinbi"
    name = "陕西移动·秦币专区"
    cfg_key = "ENABLE_QINBI"

    def is_enabled(self, a, cfg):
        return bool(a.qinbi_token) and cfg.get(self.cfg_key, True)

    def execute(self, a, args, cfg):
        return run_qinbi(a, args, cfg)


# ==================== 🛠️ 中国移动主任务流水线 (可随时拔插、增删、注释单行下架归档) ====================
CMCC_PIPELINE = [
    CmccSignTaskModule(),          # 1. 每日签到与阶梯领奖
    CmccAITasksTaskModule(),       # 2. AI豆日常赚豆任务 (浏览/分享)
    CmccGoldTaskModule(),          # 3. AI豆顶格兑换话费券
    CmccGamesTaskModule(),         # 4. 拓展游戏与追剧打卡轻量任务
    CmccWedPuzzleTaskModule(),     # 5. 周三充值日拼图抽奖与领券
    CmccSeedTaskModule(),          # 6. AI豆苗养成记 (coc3)
    CmccFeeTaskModule(),           # 7. 实时话费余额查询
    CmccQinbiTaskModule(),         # 8. 陕西移动 · 秦币专区 (含7大模块化子任务)
]


def run_account(a, args, config=None):
    """统一账户执行管线：按 CMCC_PIPELINE 流水线依次调度各业务模块"""
    cfg = config or CONFIG
    lines = []
    # 重置单账号会话缓存
    a._qwhd_session_cache = None

    for mod in CMCC_PIPELINE:
        if not mod.is_enabled(a, cfg):
            continue
        try:
            res_lines = mod.execute(a, args, cfg)
            if res_lines:
                lines.extend(res_lines)
        except Exception as e:
            log.exception("账号 %s 模块 [%s] 执行失败: %s", mask_phone(a.phone), mod.name, e)
            lines.append(f"【{mod.name}】执行异常: {e}")

    return lines

def main():
    ap = argparse.ArgumentParser(description="中国移动全功能聚合脚本 (默认全开模式)")
    ap.add_argument("--dry-run", action="store_true", help="只查状态与余额，不做写操作")
    ap.add_argument("--only-sign", action="store_true", help="仅执行每日签到，跳过其他全部任务")
    ap.add_argument("--no-random", action="store_true", help="跳过 15-30 分钟随机延时，立即执行")
    ap.add_argument("--no-tasks", action="store_true", help="跳过 AI 豆日常任务")
    ap.add_argument("--no-gold", action="store_true", help="跳过 AI 豆兑换话费券")
    ap.add_argument("--no-games", action="store_true", help="跳过拓展游戏与追剧任务")
    ap.add_argument("--no-wed", action="store_true", help="跳过周三充值日拼图")
    ap.add_argument("--no-seed", action="store_true", help="跳过 AI 豆苗养成记")
    ap.add_argument("--no-fee", action="store_true", help="跳过话费余额查询")
    ap.add_argument("--no-qinbi", action="store_true", help="跳过陕西秦币专区任务")
    ap.add_argument("--qinbi-keepalive", "--heartbeat", action="store_true", dest="qinbi_keepalive", help="陕西秦币20分钟轻量心跳保活模式")
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
        if args.no_qinbi: active_cfg["ENABLE_QINBI"] = False

    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    if requests is None:
        log.error("缺少 requests，请先安装：pip3 install requests")
        return 1

    # 防风控随机延时 (每日 08:20 自动定时主任务默认随机延时 15-30 分钟，周三秒杀与探测模式除外)
    if not args.wed_seckill and not args.dry_run and not args.no_random:
        env_delay = os.environ.get("CMCC_RANDOM_DELAY", "").strip().lower()
        if env_delay not in ("0", "false", "no", "off"):
            min_min = int(os.environ.get("CMCC_RANDOM_MIN", 15))
            max_min = int(os.environ.get("CMCC_RANDOM_MAX", 30))
            if max_min < min_min:
                max_min = min_min + 5
            delay_sec = random.randint(min_min * 60, max_min * 60)
            target_time = (datetime.now() + timedelta(seconds=delay_sec)).strftime("%H:%M:%S")
            log.info("🎲 [防风控随机延时] 计划随机延时 %d 分 %d 秒 (%d 秒)，预计将于 %s 正式开始执行...",
                     delay_sec // 60, delay_sec % 60, delay_sec, target_time)
            log.info("（提示：如需立即运行，可传参 --no-random 或设置环境变量 CMCC_RANDOM_DELAY=0）")
            time.sleep(delay_sec)

    accounts = load_accounts()
    if args.qinbi_keepalive:
        return run_qinbi_heartbeat(accounts, active_cfg, args.dry_run)
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

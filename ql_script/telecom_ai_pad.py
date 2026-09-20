#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v1.0.7 (2026-09-20 身份Cookie补齐与全闭环翻牌版)
中国电信 · AI奇遇赢Pad (一键做同款获取点数与翻牌抽奖)
===================================================================
new Env('中国电信 · AI奇遇赢Pad');
cron: 30 9 * * *
tag: 中国电信
# @tag 中国电信
===================================================================
活动说明：
  1. 完整身份指纹：补齐 loginState/cc/imusic 核心鉴权 Cookie，彻底解决制作接口 0007 报错。
  2. 一键做同款与体验券闭环：
     - 每次执行前通过 queryAiMakePkgInfo 实时核验官方制作余量(balanceMakeTimesTip)。
     - 动态适配渠道模板，执行 AI 视频制作，每次获得 20点数 + 1张Pad抽奖券码。
     - 若翻牌抽中「AI制作体验券」，自动前往继续制作赚取新点数，直到全部耗尽。
  3. 点数翻牌抽奖：每次消耗 20 点数翻牌抽奖(act/LaborApi/operationIntegralLottery)，
     若抽中点数(20/40点)则一直抽直到没有点数为止，汇报通知中严格统计共获得的话费总额。
  4. 规范通知：对齐微信读书单行 Bullet 极简排版，使用青龙默认推送。

环境变量配置：
  dxlin (或 CHINA_TELECOM_AUTH / dxqy)
  格式: 手机号#服务密码#AndroidID (多账号换行或使用 & 分隔)
===================================================================
"""

import os
import sys
import re
import json
import time
import random
import string
import base64
import hashlib
import certifi
import urllib.parse
from typing import Dict, Any, Union, Optional, List, Tuple
from datetime import datetime
from collections import OrderedDict

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import requests
from Crypto.Cipher import AES, DES3, PKCS1_v1_5
from Crypto.Util.Padding import pad, unpad
from Crypto.PublicKey import RSA
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# -------------------------- 青龙默认推送模块 --------------------------
try:
    from notify import send as ql_send
    HAS_NOTIFY = True
except ImportError:
    HAS_NOTIFY = False
    ql_send = None

SCRIPT_VERSION = "v1.0.7"

# ==================== 🛠️ 活动与平台常量配置 (对齐最新抓包事实) ====================
CHANNEL_ID = "156000009083"
ACTIVITY_ID = "ai119"
TEMPLATE_ID = "ve_4361"
DEFAULT_TEMPLATE_CONF_ID = "2T3C"
DEFAULT_ARRANGE_ID = 451
LOTTERY_COST_SCORE = 20

CHANNEL_RANKS = {
    "156000008545": "ai119_1",
    "156000009009": "ai119_2",
    "156000008996": "ai119_3",
    "156000009079": "ai119_4",
    "156000009080": "ai119_5",
    "156000009081": "ai119_6",
    "156000009082": "ai119_7",
    "156000009083": "ai119_8"
}

KEYS = {
    'login_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----""",
    'data_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----""",
    'des3': b"1234567`90koiuyhgtfrdews"
}

def log(msg: str):
    t = datetime.now().strftime('%H:%M:%S')
    print(f"[{t}] {msg}")

def mask(phone: str) -> str:
    if not phone or len(phone) < 7:
        return phone
    return f"{phone[:3]}****{phone[-4:]}"

def ts() -> str:
    return datetime.now().strftime('%Y%m%d%H%M%S')

def rd_str(length: int = 16) -> str:
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def md5(t: str) -> str:
    return hashlib.md5(t.encode('utf-8')).hexdigest()

def safe_get(d: Any, *keys, default=None) -> Any:
    curr = d
    for k in keys:
        if isinstance(curr, dict) and k in curr:
            curr = curr[k]
        elif isinstance(curr, (list, tuple)) and isinstance(k, int) and 0 <= k < len(curr):
            curr = curr[k]
        else:
            return default
    return curr

def encode(s: str) -> str:
    return "".join(chr(ord(c) + 2) for c in s)

# --- 网络适配器 ---
class CustomSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context(ciphers='DEFAULT@SECLEVEL=1:!aNULL:!eNULL:!MD5')
        ctx.check_hostname = False
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

def create_session() -> requests.Session:
    sess = requests.Session()
    sess.verify = False
    sess.headers.update({
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*"
    })
    sess.mount('https://', CustomSSLAdapter())
    return sess

def encrypt_des3(data: str, mode='enc') -> str:
    cipher = DES3.new(KEYS['des3'], DES3.MODE_CBC, 8 * b'\0')
    if mode == 'enc':
        return cipher.encrypt(pad(data.encode('utf-8'), 8)).hex()
    return unpad(cipher.decrypt(bytes.fromhex(data)), 8).decode('utf-8')

def encrypt_rsa(data: Any, key_pem: str, out: str = 'b64') -> str:
    cipher = PKCS1_v1_5.new(RSA.import_key(key_pem))
    data = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else str(data)
    if out == 'hex':
        return ''.join(cipher.encrypt(data[i:i+32].encode('utf-8')).hex() for i in range(0, len(data), 32))
    return base64.b64encode(cipher.encrypt(data.encode('utf-8'))).decode('utf-8')

# ==================== 🔐 爱音乐专属 AES 动态加解密引擎 ====================
class ImCrypto:
    def __init__(self):
        self.refresh()

    def refresh(self):
        self.ts = str(int(time.time() * 1000))
        self.rdm = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
        m_ts = md5(self.ts)
        self.key_h = md5(base64.b64encode((m_ts + self.rdm).encode('utf-8')).decode('utf-8') + self.rdm)
        self.e_k = md5(base64.b64encode(self.rdm.encode('utf-8')).decode('utf-8') + m_ts + self.key_h)[:16]
        self.e_i = md5(base64.b64encode(self.ts.encode('utf-8')).decode('utf-8') + md5(self.rdm) + self.key_h)[:16]

    def encrypt(self, d: Any) -> str:
        s = json.dumps(d, separators=(',', ':'), ensure_ascii=False)
        c = AES.new(self.e_k.encode('utf-8'), AES.MODE_CBC, self.e_i.encode('utf-8'))
        return base64.b64encode(c.encrypt(pad(s.encode('utf-8'), 16))).decode('utf-8')

    def decrypt(self, t: str) -> str:
        try:
            d_k = md5(base64.b64encode(self.ts.encode('utf-8')).decode('utf-8') + self.key_h + md5(self.rdm))[:16]
            d_i = md5(base64.b64encode(self.rdm.encode('utf-8')).decode('utf-8') + self.key_h + md5(self.ts))[:16]
            c = AES.new(d_k.encode('utf-8'), AES.MODE_CBC, d_i.encode('utf-8'))
            raw_b64 = t.strip('"')
            return unpad(c.decrypt(base64.b64decode(raw_b64)), 16).decode('utf-8', errors='ignore')
        except Exception:
            return t

def get_imusic_headers(crypto_inst: ImCrypto, token: str = "") -> dict:
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://ai.imusic.cn",
        "Referer": f"https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc={CHANNEL_ID}&ca=KCHF",
        "imencrypt": "1",
        "imtimestamp": crypto_inst.ts,
        "imrandomnum": crypto_inst.rdm,
        "imencryptkey": crypto_inst.key_h,
        "Accept-Language": "zh-CN,zh;q=0.9"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers

def post_encrypted_api(sess: requests.Session, crypto_inst: ImCrypto, token: str, api_path: str, payload: Any) -> Tuple[requests.Response, str]:
    crypto_inst.refresh()
    enc_data = crypto_inst.encrypt(payload)
    url = f"https://ai.imusic.cn{api_path}?formData={urllib.parse.quote(enc_data)}"
    headers = get_imusic_headers(crypto_inst, token)
    res = sess.post(url, headers=headers, data="", timeout=15)
    new_auth = res.headers.get("authorization") or res.headers.get("Authorization")
    if new_auth:
        new_token = new_auth.replace("Bearer ", "").strip()
        if new_token:
            token = new_token
    return res, token

def refresh_sso_token(sess: requests.Session, ticket: str) -> Optional[str]:
    try:
        res = sess.post(
            "https://ai.imusic.cn/vapi/vue_login/sso_login_v2",
            json={"portal": "45", "channelId": CHANNEL_ID, "ticket": ticket, "user118100cn": "user118100cn"},
            headers={"Content-Type": "application/json", "Referer": f"https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc={CHANNEL_ID}&ca=KCHF"},
            timeout=15
        ).json()
        tok = res.get("token")
        if tok:
            sess.cookies.set('loginState', 'true', domain='ai.imusic.cn')
            sess.cookies.set('cc', CHANNEL_ID, domain='ai.imusic.cn')
        return tok
    except Exception:
        return None

def send_stat_message(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str, actname: str, actparam: str) -> Tuple[requests.Response, str]:
    payload = OrderedDict([
        ("channelId", CHANNEL_ID),
        ("portal", "45"),
        ("mobile", mobile),
        ("actname", actname),
        ("actparam", actparam),
        ("sid", "")
    ])
    return post_encrypted_api(sess, crypto_inst, token, "/vapi/vue_stat/sendMessage", payload)

def warmup_session(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str) -> str:
    h = get_imusic_headers(crypto_inst, token)
    try:
        r1 = sess.post(f"https://ai.imusic.cn/vapi/new_member/get_user_info?channelId={CHANNEL_ID}&portal=45&mobile={mobile}", headers=h, data="", timeout=10)
        auth1 = r1.headers.get("authorization") or r1.headers.get("Authorization")
        if auth1: token = auth1.replace("Bearer ", "").strip()
        
        r2 = sess.post(f"https://ai.imusic.cn/vapi/vrbt/check_user_state?mobile={mobile}&is4G=1&is5G=1&isDX=1&channelId={CHANNEL_ID}&portal=45", headers=get_imusic_headers(crypto_inst, token), data="", timeout=10)
        auth2 = r2.headers.get("authorization") or r2.headers.get("Authorization")
        if auth2: token = auth2.replace("Bearer ", "").strip()
    except Exception:
        pass
    time.sleep(0.3)
    return token

def query_make_pkg_info(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str) -> Tuple[dict, str]:
    try:
        r, token = post_encrypted_api(
            sess, crypto_inst, token, "/hapi/en/api",
            OrderedDict([
                ("channelId", CHANNEL_ID),
                ("portal", "45"),
                ("mobile", mobile),
                ("aid", ACTIVITY_ID),
                ("apiName", "ismp/IsmpApi/queryAiMakePkgInfo")
            ])
        )
        dec = crypto_inst.decrypt(r.text)
        if dec.startswith('{'):
            d = json.loads(dec).get("data") or {}
            return d, token
    except Exception:
        pass
    return {}, token

def premake_prepare(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str, template_meta: dict) -> str:
    active_token = token
    try:
        t_id = template_meta.get("templateId", TEMPLATE_ID)
        t_conf = template_meta.get("templateConfId", "")
        _, active_token = post_encrypted_api(
            sess, crypto_inst, active_token, "/hapi/en/api",
            OrderedDict([
                ("channelId", CHANNEL_ID),
                ("portal", "45"),
                ("mobile", mobile),
                ("templateId", t_id),
                ("aid", ACTIVITY_ID),
                ("apiName", "ismp/IsmpApi/queryAiMakePkgInfo")
            ])
        )
        stat_events = [
            ("page_vring_index", f"玩转AI赢手机_activityID_{ACTIVITY_ID}_entrance_{CHANNEL_ID}"),
            ("activity_vring_make_1.9", f"_activityID_{ACTIVITY_ID}_templateID_{t_id}_entrance_{CHANNEL_ID}_templateconfID_{t_conf}"),
            ("activity_2603AI-meet_25.1", f"activityID_{ACTIVITY_ID}_undefined_templateID_{t_id}_entrance_{CHANNEL_ID}_templateconfID_{t_conf}"),
            ("page_2511AI-makeonekey_9", f"activityID_{ACTIVITY_ID}_templateID_{t_id}_entrance_{CHANNEL_ID}_templateConfID_{t_conf}"),
            ("page_2511AI-makeonekey_3", f"activityID_{ACTIVITY_ID}_templateID_{t_id}_entrance_{CHANNEL_ID}_templateConfID_{t_conf}"),
        ]
        for actname, actparam in stat_events:
            _, active_token = send_stat_message(sess, crypto_inst, active_token, mobile, actname, actparam)
            time.sleep(0.05)
    except Exception:
        pass
    return active_token

# ==================== 📱 电信官方登录与爱音乐 SSO 换发 ====================
def login_telecom(sess: requests.Session, phone: str, password: str, android_id: str = "") -> Optional[dict]:
    m_phone = mask(phone)
    log(f"[登录] 正在通过电信官方协议登录账号: {m_phone}")

    pwd = password.strip()
    aid = android_id.strip() if android_id else rd_str(16)
    cur_ts = ts()
    cipher_str = f"Xiaomi 20 8.0.0.{aid[:12]}{phone}{cur_ts}{pwd}0$$$0."
    login_cipher = encrypt_rsa(cipher_str, KEYS['login_rsa'], 'b64')

    body = {
        "headerInfos": {
            "code": "userLoginNormal", "timestamp": cur_ts, "broadAccount": "", "broadToken": "",
            "clientType": "#11.0.0#channel8#Xiaomi 20#", "shopId": "20002",
            "source": "110003", "sourcePassword": "Sid98s", "token": "",
            "userLoginName": encode(phone)
        },
        "content": {
            "attach": "test",
            "fieldData": {
                "loginType": "4", "accountType": "",
                "loginAuthCipherAsymmertric": login_cipher,
                "deviceUid": "", "phoneNum": encode(phone),
                "isChinatelecom": "", "systemVersion": "8.0.0",
                "androidId": encode(aid), "loginAuthCipher": "",
                "authentication": encode(pwd)
            }
        }
    }

    try:
        res = sess.post('https://appgologin.189.cn:9031/login/client/userLoginNormal', json=body, timeout=15).json()
    except Exception as e:
        log(f"❌ [登录异常] {m_phone}: {str(e)}")
        return None

    login_data = safe_get(res, 'responseData', 'data', 'loginSuccessResult')
    if not login_data:
        err_msg = safe_get(res, 'responseData', 'resultDesc') or safe_get(res, 'headerInfos', 'reason') or '服务密码校验未通过'
        log(f"❌ [登录失败] {m_phone}: {err_msg}")
        return None

    app_token = login_data.get('token', '')
    user_id = login_data.get('userId', '')

    xml = f'''<Request><HeaderInfos><Code>getSingle</Code><Timestamp>{cur_ts}</Timestamp><BroadAccount></BroadAccount><BroadToken></BroadToken><ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType><ShopId>20002</ShopId><Source>110003</Source><SourcePassword>Sid98s</SourcePassword><Token>{app_token}</Token><UserLoginName>{phone}</UserLoginName></HeaderInfos><Content><Attach>test</Attach><FieldData><TargetId>{encrypt_des3(user_id)}</TargetId><Url>4a6862274835b451</Url></FieldData></Content></Request>'''
    try:
        xml_res = sess.post('https://appgologin.189.cn:9031/map/clientXML', data=xml.encode('utf-8'), headers={'Content-Type': 'application/xml'}, timeout=15).text
    except Exception as e:
        log(f"❌ [换取Ticket异常] {m_phone}: {str(e)}")
        return None

    if '<Ticket>' not in xml_res:
        log(f"❌ [换取Ticket失败] {m_phone}: 响应未包含有效 Ticket 节点")
        return None

    try:
        raw_ticket = xml_res.split('<Ticket>')[1].split('</Ticket>')[0]
        ticket = encrypt_des3(raw_ticket, 'dec')
    except Exception as e:
        log(f"❌ [解析Ticket异常] {m_phone}: {str(e)}")
        return None

    # 换发爱音乐平台 SSO 登录 Token，并主动预置官方关键身份 Cookie
    log(f"[认证] 正在向爱音乐网关换发活动鉴权 Token: {m_phone}")
    sso_payload = {
        "portal": "45",
        "channelId": CHANNEL_ID,
        "ticket": ticket,
        "user118100cn": "user118100cn"
    }
    try:
        sso_resp = sess.post(
            "https://ai.imusic.cn/vapi/vue_login/sso_login_v2",
            json=sso_payload,
            headers={"Content-Type": "application/json", "Referer": f"https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc={CHANNEL_ID}&ca=KCHF"},
            timeout=15
        ).json()
    except Exception as e:
        log(f"❌ [爱音乐SSO异常] {m_phone}: {str(e)}")
        return None

    imusic_token = sso_resp.get("token")
    if not imusic_token:
        log(f"❌ [爱音乐SSO失败] {m_phone}: {sso_resp.get('description') or '未获取到平台Token'}")
        return None

    # 补齐官方 /au/ 接口必需身份 Cookie
    sess.cookies.set('loginState', 'true', domain='ai.imusic.cn')
    sess.cookies.set('cc', CHANNEL_ID, domain='ai.imusic.cn')
    sess.cookies.set('imusic', f'118100{int(time.time() * 1000)}', domain='ai.imusic.cn')

    log(f"✅ [认证成功] {m_phone}: 成功获取爱音乐活动鉴权 Token！")
    return {
        "phone": phone,
        "mobile": phone,
        "token": imusic_token,
        "ticket": ticket,
        "en_code": sso_resp.get("enDataCode", "")
    }

# ==================== 🎬 动态拉取当期模板元数据 ====================
def query_template_meta(sess: requests.Session, token: str) -> dict:
    rank_id = CHANNEL_RANKS.get(CHANNEL_ID, "ai119_8")
    url = f"https://ai.imusic.cn/hapi/de/api?pageNo=1&pageSize=10&activityId={rank_id}&apiName=diy/DiyVideoApi/queryActRecommendTemplateList&channelId={CHANNEL_ID}&portal=45"
    headers = {"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 (Linux; Android 13)"}
    default_meta = {
        "templateId": TEMPLATE_ID,
        "templateConfId": DEFAULT_TEMPLATE_CONF_ID,
        "arrangeId": DEFAULT_ARRANGE_ID,
        "videoName": "月满庆中秋",
        "userWords": "复古科幻风格，太空宇航员与飞船探索宇宙",
        "background": "",
        "isAI": 0,
        "all_templates": []
    }
    try:
        r = sess.post(url, headers=headers, timeout=10).json()
        items = safe_get(r, 'data', 'list') or []
        if items:
            t = items[0]
            return {
                "templateId": t.get("templateId") or TEMPLATE_ID,
                "templateConfId": t.get("templateConfId") or DEFAULT_TEMPLATE_CONF_ID,
                "arrangeId": t.get("arrangeId") or DEFAULT_ARRANGE_ID,
                "videoName": t.get("videoName") or "月满庆中秋",
                "userWords": t.get("userWords") or default_meta["userWords"],
                "background": t.get("background") or "",
                "isAI": 1 if str(t.get("isAI", 0)) == "1" else 0,
                "all_templates": items
            }
    except Exception:
        pass
    return default_meta

# ==================== 🎯 核心业务执行（一键做同款与翻牌连抽闭环） ====================
def run_ai_pad_tasks(sess: requests.Session, user: dict) -> List[str]:
    phone = user['phone']
    m_phone = mask(phone)
    token = user['token']
    ticket = user.get('ticket', '')
    en_code = user.get('en_code', '')
    bullets = []

    crypto = ImCrypto()

    # 1. 启动会话 Warmup 模拟与准备
    token = warmup_session(sess, crypto, token, phone)
    tpl_meta = query_template_meta(sess, token)

    # 2. 查询当期开奖期数与抽奖券码 (玩法一)
    ticket_count = "0"
    issue_name = "当期"
    draw_date_str = ""
    try:
        r_issue, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
            ("activityId", ACTIVITY_ID),
            ("apiName", "act/LaborApi/getOperationCurrentIssueInfo"),
            ("channelId", CHANNEL_ID),
            ("portal", "45")
        ]))
        dec_issue = crypto.decrypt(r_issue.text)
        if dec_issue.startswith('{'):
            i_data = json.loads(dec_issue).get('data') or {}
            issue_name = i_data.get('issueName') or "当期"
            raw_dt = i_data.get('drawTime') or ""
            if raw_dt:
                draw_date_str = raw_dt[5:10]

        r_tick, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
            ("activityId", ACTIVITY_ID),
            ("apiName", "act/LaborApi/getOperationIssueTicketNum"),
            ("channelId", CHANNEL_ID),
            ("portal", "45")
        ]))
        dec_tick = crypto.decrypt(r_tick.text)
        data_val = safe_get(json.loads(dec_tick), 'data') if dec_tick.startswith('{') else None
        if data_val:
            ticket_count = str(data_val)
    except Exception:
        pass

    # 3. 初始核验官方制作资格与余量
    pkg_data, token = query_make_pkg_info(sess, crypto, token, phone)
    initial_tip = pkg_data.get("balanceMakeTimesTip", "")
    exp_work_num = int(pkg_data.get("aiMakeExperienceWorkNum", 0) or pkg_data.get("privilegeVrbtAIMakeExperienceLeftNum", 0) or 0)
    free_left_num = int(pkg_data.get("privilegeVrbtAIVideoLeftNum", 0) or pkg_data.get("aidDailyNum", 0) or 0)
    log(f"[{m_phone}] 制作资格官方核验: {initial_tip or f'体验券{exp_work_num}次 / 免费{free_left_num}次'}")

    # 4. 闭环执行：AI视频制作赚点数 <-> 翻牌抽大奖(抽中体验券继续制作，抽中点数继续抽奖)
    total_make_success = 0
    total_earned_points = 0
    total_draw_count = 0
    total_bill_won = 0.0

    round_idx = 0
    max_rounds = 15  # 安全上限轮次

    candidate_templates = tpl_meta.get("all_templates", [])
    if not candidate_templates:
        candidate_templates = [tpl_meta]

    while round_idx < max_rounds:
        round_idx += 1
        round_made = 0

        # --- A. 执行「一键做同款」制作（消耗免费额度或抽中的体验券）---
        for t_item in candidate_templates:
            cur_tid = t_item.get("templateId") or TEMPLATE_ID
            cur_conf = t_item.get("templateConfId") or DEFAULT_TEMPLATE_CONF_ID
            cur_arr = t_item.get("arrangeId") or DEFAULT_ARRANGE_ID
            cur_vname = t_item.get("videoName") or tpl_meta["videoName"]
            cur_words = t_item.get("userWords") or tpl_meta["userWords"]
            cur_bg = t_item.get("background") or ""
            cur_is_ai = 1 if str(t_item.get("isAI", 0)) == "1" else 0

            for attempt in range(1, 4):
                token = premake_prepare(sess, crypto, token, phone, t_item)
                rand_name = f"{cur_vname}{random.randint(100000, 999999)}"
                payload = OrderedDict([
                    ("channelId", CHANNEL_ID), ("portal", "45"), ("mobile", phone),
                    ("openId", ""), ("makeId", ""), ("background", cur_bg), ("userPhotos", ""),
                    ("userWords", cur_words),
                    ("templateName", rand_name), ("videoName", rand_name),
                    ("templateId", cur_tid), ("templateConfId", cur_conf), ("aid", ACTIVITY_ID),
                    ("inviterMobile", en_code), ("isAI", cur_is_ai), ("aiPack", 0), ("arrangeId", cur_arr),
                    ("autoOrderUgc", 0), ("aiGatewayImagMakeId", ""), ("fromType", ""),
                    ("sessionId", ""), ("voice", ""), ("invitationCode", en_code)
                ])

                # 统一走标准 post_encrypted_api 加密通道
                r_make, token = post_encrypted_api(sess, crypto, token, "/hapi/diy_video/au/template_make_add_v2", payload)
                dec_resp = crypto.decrypt(r_make.text)

                # 0007 Token 自动续期
                if "0007" in dec_resp:
                    new_tok = refresh_sso_token(sess, ticket)
                    if new_tok:
                        token = new_tok
                        token = premake_prepare(sess, crypto, token, phone, t_item)
                        time.sleep(1)
                        r_make, token = post_encrypted_api(sess, crypto, token, "/hapi/diy_video/au/template_make_add_v2", payload)
                        dec_resp = crypto.decrypt(r_make.text)

                # 10013 风控自动 remedy 补救
                if "10013" in dec_resp:
                    trace_id = safe_get(json.loads(dec_resp), "imuTraceId", default="") if dec_resp.startswith('{') else ""
                    try:
                        send_stat_message(sess, crypto, token, phone, "page_vring_index", f"玩转AI赢手机_activityID_{ACTIVITY_ID}_entrance_{CHANNEL_ID}")
                        send_stat_message(sess, crypto, token, phone, "activity_vring_make_1.9", f"_activityID_{ACTIVITY_ID}_entrance_{CHANNEL_ID}")
                        rem_en = crypto.encrypt({"method": "remedy", "traceId": trace_id, "mobile": phone})
                        sess.post(f"https://ai.imusic.cn/hapi/en/api?formData={urllib.parse.quote(rem_en)}", headers=get_imusic_headers(crypto, token), data="", timeout=15)
                        new_tok = refresh_sso_token(sess, ticket)
                        if new_tok: token = new_tok
                        token = premake_prepare(sess, crypto, token, phone, t_item)
                        time.sleep(1)
                        r_make, token = post_encrypted_api(sess, crypto, token, "/hapi/diy_video/au/template_make_add_v2", payload)
                        dec_resp = crypto.decrypt(r_make.text)
                    except Exception:
                        pass

                if '"code":"0000"' in dec_resp:
                    round_made += 1
                    total_make_success += 1
                    total_earned_points += 20
                    log(f"[{m_phone}] ✅ 「一键做同款」制作成功！[{cur_vname}] (+20点数, +1Pad抽奖券码)")
                    time.sleep(1.5)
                elif "10014" in dec_resp or "次数已用完" in dec_resp or "免费次数已用完" in dec_resp or "机会已用" in dec_resp or "不足" in dec_resp:
                    break
                else:
                    log(f"[{m_phone}] 制作反馈: {dec_resp[:80]}")
                    break

            if round_made > 0 or ("10014" in dec_resp or "次数已用完" in dec_resp):
                break

        # --- B. 查询最新可用点数 ---
        total_score = "0"
        remaining_score = 0
        try:
            r_score, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
                ("activityId", ACTIVITY_ID),
                ("mobile", phone),
                ("apiName", "act/LaborApi/getOperationTotalScoreOrRemainingScore"),
                ("channelId", CHANNEL_ID),
                ("portal", "45")
            ]))
            dec_score = crypto.decrypt(r_score.text)
            if "0007" in dec_score:
                new_tok = refresh_sso_token(sess, ticket)
                if new_tok:
                    token = new_tok
                    r_score, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
                        ("activityId", ACTIVITY_ID),
                        ("mobile", phone),
                        ("apiName", "act/LaborApi/getOperationTotalScoreOrRemainingScore"),
                        ("channelId", CHANNEL_ID),
                        ("portal", "45")
                    ]))
                    dec_score = crypto.decrypt(r_score.text)

            if dec_score.startswith('{'):
                s_data = json.loads(dec_score).get("data") or {}
                total_score = str(s_data.get("totalScore", "0"))
                remaining_score = int(s_data.get("remainingScore", 0) or 0)
        except Exception:
            pass

        lottery_chances = remaining_score // LOTTERY_COST_SCORE
        log(f"[{m_phone}] [第{round_idx}轮] 积分核验: 可用点数={remaining_score}, 累计总点数={total_score}, 可翻牌={lottery_chances}次")

        # --- C. 翻牌抽大奖：点数连抽直到没有点数为止 ---
        round_won_tickets = 0

        while remaining_score >= LOTTERY_COST_SCORE and total_draw_count < 80:
            total_draw_count += 1
            remaining_score -= LOTTERY_COST_SCORE
            send_stat_message(sess, crypto, token, phone, "activity_2603AI-meet_1.15", f"activityID_{ACTIVITY_ID}_entrance_{CHANNEL_ID}")
            time.sleep(0.05)

            try:
                r_draw, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
                    ("activityId", ACTIVITY_ID),
                    ("mobile", phone),
                    ("apiName", "act/LaborApi/operationIntegralLottery"),
                    ("channelId", CHANNEL_ID),
                    ("portal", "45")
                ]))
                dec_draw = crypto.decrypt(r_draw.text)
            except Exception as e:
                log(f"[{m_phone}] 第 {total_draw_count} 次翻牌网络异常: {str(e)}")
                break

            if "0007" in dec_draw:
                new_tok = refresh_sso_token(sess, ticket)
                if new_tok:
                    token = new_tok
                    r_draw, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
                        ("activityId", ACTIVITY_ID),
                        ("mobile", phone),
                        ("apiName", "act/LaborApi/operationIntegralLottery"),
                        ("channelId", CHANNEL_ID),
                        ("portal", "45")
                    ]))
                    dec_draw = crypto.decrypt(r_draw.text)

            if dec_draw.startswith('{'):
                d_obj = json.loads(dec_draw)
                d_data = d_obj.get('data') or {}
                p_name = d_data.get('awardName') or d_data.get('prizeName') or d_data.get('name')
                award_idx = str(d_data.get('awardIndex') or '')

                if not p_name and d_obj.get('code') != '0000':
                    err_desc = d_obj.get('desc') or '翻牌未成功'
                    log(f"[{m_phone}] 翻牌反馈: {err_desc}")
                    break

                p_name = p_name or '谢谢参与'
                log(f"[{m_phone}] 🎴 第 {total_draw_count} 次翻牌获得: [{p_name}]")

                # 1. 话费统计
                if '1元' in p_name or award_idx in ['16320105', '16320205', '16320305']:
                    total_bill_won += 1.0
                    log(f"[{m_phone}] 💰 斩获话费: +1.00元话费！")
                elif '10元' in p_name or award_idx == '16330101':
                    total_bill_won += 10.0
                    log(f"[{m_phone}] 💰 斩获话费: +10.00元话费！")

                # 2. 抽中点数立即回补累加，一直抽直到没有点数为止
                if '20点数' in p_name or award_idx in ['16320101', '16320201', '16320301']:
                    remaining_score += 20
                    log(f"[{m_phone}] 🪙 抽中 20 点数，自动追加 1 次翻牌！(剩余可用: {remaining_score})")
                elif '40点数' in p_name or award_idx in ['16320102', '16320202', '16320302']:
                    remaining_score += 40
                    log(f"[{m_phone}] 🪙 抽中 40 点数，自动追加 2 次翻牌！(剩余可用: {remaining_score})")

                # 3. 抽中体验券：标记有新制作机会，退出抽奖后自动继续制作并赚取新点数！
                if '体验券' in p_name or '体验' in p_name or award_idx in ['16320103', '16320203', '16320303', '16320104', '16320204', '16320304']:
                    round_won_tickets += 1
                    log(f"[{m_phone}] 🎟️ 抽中 [{p_name}]！稍后将自动前往制作AI大片赚取新点数！")
            else:
                log(f"[{m_phone}] 翻牌响应解析异常: {dec_draw[:60]}")
                break

            time.sleep(1.2)

        # --- D. 检查是否需要继续闭环循环 ---
        pkg_data, token = query_make_pkg_info(sess, crypto, token, phone)
        exp_left = int(pkg_data.get("aiMakeExperienceWorkNum", 0) or pkg_data.get("privilegeVrbtAIMakeExperienceLeftNum", 0) or 0)

        if round_made == 0 and round_won_tickets == 0 and exp_left == 0 and remaining_score < LOTTERY_COST_SCORE:
            log(f"[{m_phone}] 今日制作机会与可用点数已全部耗尽，闭环任务结束。")
            break

        if round_won_tickets > 0 or exp_left > 0:
            log(f"[{m_phone}] 🔄 检测到有新的体验券制作机会(剩余{exp_left}次/本轮获{round_won_tickets}张)，即将自动开启下一轮制作与赚点！")
            time.sleep(1)

    # 5. 任务结束复核最新资产与制作余量
    try:
        r_score_after, _ = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
            ("activityId", ACTIVITY_ID),
            ("mobile", phone),
            ("apiName", "act/LaborApi/getOperationTotalScoreOrRemainingScore"),
            ("channelId", CHANNEL_ID),
            ("portal", "45")
        ]))
        dec_score_after = crypto.decrypt(r_score_after.text)
        if dec_score_after.startswith('{'):
            s_data_after = json.loads(dec_score_after).get("data") or {}
            total_score = str(s_data_after.get("totalScore", total_score))
            remaining_score = int(s_data_after.get("remainingScore", remaining_score) or 0)
    except Exception:
        pass

    final_pkg_data, _ = query_make_pkg_info(sess, crypto, token, phone)
    final_tip = final_pkg_data.get("balanceMakeTimesTip", "")
    final_exp = int(final_pkg_data.get("aiMakeExperienceWorkNum", 0) or 0)
    final_free = int(final_pkg_data.get("privilegeVrbtAIVideoLeftNum", 0) or final_pkg_data.get("aidDailyNum", 0) or 0)

    # 6. 生成微信读书规范通知
    if total_make_success > 0:
        bullets.append(f"• 一键做同款: 完成 {total_make_success} 次制作 [{tpl_meta['videoName']}] (+{total_earned_points}点数)")
    else:
        if final_tip and ("剩余" in final_tip or "次" in final_tip) and "0" not in final_tip:
            bullets.append(f"• 一键做同款: 当期余量 [{final_tip}] (体验券{final_exp}次/免费{final_free}次)")
        else:
            bullets.append("• 一键做同款: 今日制作次数已耗尽 (每3天赠送3次免费机会)")

    if draw_date_str:
        bullets.append(f"• Pad抽奖券码: {issue_name}总发放 {ticket_count} 张 ({draw_date_str} 11:00自动开奖)")
    else:
        bullets.append(f"• Pad抽奖券码: {issue_name}总发放 {ticket_count} 张 (每期送iPad·自动开奖)")

    if total_bill_won > 0:
        bill_msg = f"共获得 {total_bill_won:.2f}元话费 (已自动入账)"
    else:
        bill_msg = "共获得 0元话费"

    if total_draw_count > 0:
        bullets.append(f"• 点数翻牌抽奖: {bill_msg} (累计翻牌 {total_draw_count} 次)")
    else:
        bullets.append(f"• 点数翻牌抽奖: {bill_msg} (今日可用点数已耗尽)")

    bullets.append(f"• 账户当前点数: 剩余 {remaining_score} 点数 (累计总点数: {total_score})")
    return bullets

# ==================== 🚀 账号解析与主流程 ====================
def parse_accounts() -> List[Tuple[str, str, str]]:
    raw = os.environ.get('dxlin') or \
          os.environ.get('CHINA_TELECOM_AUTH') or \
          os.environ.get('dxqy') or ''
    accounts = []
    if not raw.strip():
        return accounts

    items = re.split(r'[&\r\n]+', raw.replace('\\n', '&').replace('\\r', ''))
    for item in items:
        item = item.strip()
        if not item or "你的手机号" in item:
            continue
        parts = [seg.strip() for seg in item.split('#')]
        if len(parts) >= 2:
            phone = parts[0]
            pwd = parts[1]
            aid = parts[2] if len(parts) > 2 else ""
            accounts.append((phone, pwd, aid))
    return accounts

def main():
    print("=" * 65)
    print(f"  🎉 [{SCRIPT_VERSION}] 中国电信 · AI奇遇赢Pad聚合脚本 🎉  ")
    print("=" * 65)

    accounts = parse_accounts()
    if not accounts:
        print("\n❌ 未检测到有效的电信账号配置！")
        print("👉 请在青龙面板添加环境变量: dxlin (或 CHINA_TELECOM_AUTH)")
        print("👉 格式示例: 18912345678#123456#8a2c4e6f12345678 (多账号换行粘贴)\n")
        return

    print(f"\n👤 检测到 {len(accounts)} 个有效电信账号，开始执行 AI 奇遇任务...\n")

    summary_blocks = []

    for idx, (phone, pwd, android_id) in enumerate(accounts, start=1):
        m_phone = mask(phone)
        print(f"=================== 正在处理账号 [{idx}/{len(accounts)}] {m_phone} ===================")
        sess = create_session()

        user = login_telecom(sess, phone, pwd, android_id)
        if not user:
            bullets = [
                "• 账号认证: 登录未通过 (服务密码有误或触发安全验证)",
                "• 任务状态: 今日AI制作与抽奖已跳过"
            ]
        else:
            bullets = run_ai_pad_tasks(sess, user)

        if len(accounts) > 1:
            summary_blocks.append(f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets))
        else:
            summary_blocks.append("\n".join(bullets))

        time.sleep(2)

    # --- 微信读书风格通知 ---
    first_phone = mask(accounts[0][0]) if accounts else "主账号"
    subtitle = f"执行完成 (1个账号) - 【{first_phone}】" if len(accounts) == 1 else f"执行完成 ({len(accounts)}个账号)"
    notify_body = "\n\n".join(summary_blocks)

    print("\n" + "=" * 65)
    print("                       📊 任务执行结果总报                       ")
    print("=" * 65)
    print(f"📣 [{SCRIPT_VERSION}]【中国电信 · AI奇遇赢Pad】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    if HAS_NOTIFY and ql_send and notify_body:
        try:
            ql_send(f"[{SCRIPT_VERSION}] 中国电信 · AI奇遇赢Pad", f"{subtitle}\n\n{notify_body}")
            print("🔔 青龙通知推送成功！")
        except Exception as e:
            print(f"⚠️ 青龙通知推送异常: {str(e)}")

if __name__ == '__main__':
    main()

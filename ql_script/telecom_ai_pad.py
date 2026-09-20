#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v1.0.2 (2026-09-20 纯净规范版)
中国电信 · AI奇遇赢Pad (一键做同款获取点数与抽大奖)
===================================================================
new Env('中国电信 · AI奇遇赢Pad');
cron: 30 9 * * *
tag: 中国电信
# @tag 中国电信
===================================================================
活动说明：
  1. 一键做同款：每位电信用户每3天获赠3次免费制作机会，每制作1次获得20点数+1张Pad抽奖券码。
  2. 券码抽iPad：每期15天送出苹果iPad平板，系统根据加密种子密文自动开奖。
  3. 点数抽大奖：每消耗20点数可参与一次抽奖，可抽取话费、点数返还与体验券。
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

SCRIPT_VERSION = "v1.0.2"

# ==================== 🛠️ 活动与平台常量配置 (对齐最新抓包事实) ====================
CHANNEL_ID = "156000009079"
ACTIVITY_ID = "ai119"
ACTIVITY_ID_TPL = "ai119_4"
TEMPLATE_ID = "ve_3949"
DEFAULT_TEMPLATE_CONF_ID = "2JCd"
DEFAULT_ARRANGE_ID = 463
LOTTERY_COST_SCORE = 20

KEYS = {
    'login_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----""",
    'data_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----""",
    'des3': b"1234567\x6090koiuyhgtfrdews"
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
        if not isinstance(curr, dict):
            return default
        curr = curr.get(k)
        if curr is None:
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
    raw = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else str(data)
    if out == 'hex':
        return ''.join(cipher.encrypt(raw[i:i+32].encode('utf-8')).hex() for i in range(0, len(raw), 32))
    return base64.b64encode(cipher.encrypt(raw.encode('utf-8'))).decode('utf-8')

# ==================== 🔐 爱音乐专属 AES 动态加解密引擎 ====================
class ImCrypto:
    def __init__(self):
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
        "Referer": f"https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc={CHANNEL_ID}&ca=w7x6",
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
    enc_data = crypto_inst.encrypt(payload)
    url = f"https://ai.imusic.cn{api_path}?formData={urllib.parse.quote(enc_data)}"
    headers = get_imusic_headers(crypto_inst, token)
    res = sess.post(url, headers=headers, data="")
    # 动态捕获下发刷新的 Token
    new_auth = res.headers.get("authorization") or res.headers.get("Authorization")
    if new_auth:
        new_token = new_auth.replace("Bearer ", "").strip()
        if new_token:
            token = new_token
    return res, token

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
        sess.post(f"https://ai.imusic.cn/vapi/new_member/get_user_info?channelId={CHANNEL_ID}&portal=45&mobile={mobile}", headers=h, data="", timeout=10)
        sess.post(f"https://ai.imusic.cn/vapi/vrbt/check_user_state?mobile={mobile}&is4G=1&is5G=1&isDX=1&channelId={CHANNEL_ID}&portal=45", headers=h, data="", timeout=10)
        en_init = crypto_inst.encrypt({"channelId": CHANNEL_ID, "portal": "45", "mobile": mobile, "method": "init"})
        sess.post(f"https://ai.imusic.cn/hapi/en/api?formData={urllib.parse.quote(en_init)}", headers=h, data="", timeout=10)
        ugc_p = crypto_inst.encrypt({"channelId": CHANNEL_ID, "portal": "45", "mobile": mobile})
        sess.post(f"https://ai.imusic.cn/hapi/diy_ugc/imu/get_ugc_info?formData={urllib.parse.quote(ugc_p)}", headers=h, data="", timeout=10)
    except Exception:
        pass
    time.sleep(0.3)
    return token

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

    res = sess.post('https://appgologin.189.cn:9031/login/client/userLoginNormal', json=body, timeout=15).json()
    login_data = safe_get(res, 'responseData', 'data', 'loginSuccessResult')
    if not login_data:
        err_msg = safe_get(res, 'responseData', 'resultDesc') or safe_get(res, 'headerInfos', 'reason') or '服务密码校验未通过'
        log(f"❌ [登录失败] {m_phone}: {err_msg}")
        return None

    app_token = login_data.get('token', '')
    user_id = login_data.get('userId', '')

    xml = f'''<Request><HeaderInfos><Code>getSingle</Code><Timestamp>{cur_ts}</Timestamp><BroadAccount></BroadAccount><BroadToken></BroadToken><ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType><ShopId>20002</ShopId><Source>110003</Source><SourcePassword>Sid98s</SourcePassword><Token>{app_token}</Token><UserLoginName>{phone}</UserLoginName></HeaderInfos><Content><Attach>test</Attach><FieldData><TargetId>{encrypt_des3(user_id)}</TargetId><Url>4a6862274835b451</Url></FieldData></Content></Request>'''
    xml_res = sess.post('https://appgologin.189.cn:9031/map/clientXML', data=xml.encode('utf-8'), headers={'Content-Type': 'application/xml'}, timeout=15).text

    if '<Ticket>' not in xml_res:
        log(f"❌ [换取Ticket失败] {m_phone}: 响应未包含有效 Ticket 节点")
        return None

    try:
        raw_ticket = xml_res.split('<Ticket>')[1].split('</Ticket>')[0]
        ticket = encrypt_des3(raw_ticket, 'dec')
    except Exception as e:
        log(f"❌ [解析Ticket异常] {m_phone}: {str(e)}")
        return None

    # 换发爱音乐平台 SSO 登录 Token
    log(f"[认证] 正在向爱音乐网关换发活动鉴权 Token: {m_phone}")
    sso_payload = {
        "portal": "45",
        "channelId": CHANNEL_ID,
        "ticket": ticket,
        "user118100cn": "user118100cn"
    }
    sso_resp = sess.post(
        "https://ai.imusic.cn/vapi/vue_login/sso_login_v2",
        json=sso_payload,
        headers={"Content-Type": "application/json", "Referer": f"https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc={CHANNEL_ID}&ca=w7x6"},
        timeout=15
    ).json()

    imusic_token = sso_resp.get("token")
    if not imusic_token:
        log(f"❌ [爱音乐SSO失败] {m_phone}: {sso_resp.get('description') or '未获取到平台Token'}")
        return None

    log(f"✅ [认证成功] {m_phone}: 成功获取爱音乐活动鉴权 Token！")
    return {
        "phone": phone,
        "mobile": phone,
        "token": imusic_token,
        "ticket": ticket
    }

# ==================== 🎬 动态拉取当期模板元数据 ====================
def query_template_meta(sess: requests.Session, token: str) -> dict:
    url = f"https://ai.imusic.cn/hapi/de/api?pageNo=1&pageSize=10&activityId={ACTIVITY_ID_TPL}&apiName=diy/DiyVideoApi/queryActRecommendTemplateList&channelId={CHANNEL_ID}&portal=45"
    headers = {"Authorization": f"Bearer {token}", "User-Agent": "Mozilla/5.0 (Linux; Android 13)"}
    default_meta = {
        "templateId": TEMPLATE_ID,
        "templateConfId": DEFAULT_TEMPLATE_CONF_ID,
        "arrangeId": DEFAULT_ARRANGE_ID,
        "videoName": "太空奇旅",
        "userWords": "复古科幻风格，太空宇航员与飞船探索宇宙"
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
                "videoName": t.get("videoName") or "太空奇旅",
                "userWords": t.get("userWords") or default_meta["userWords"]
            }
    except Exception:
        pass
    return default_meta

# ==================== 🎯 核心业务执行 ====================
def run_ai_pad_tasks(sess: requests.Session, user: dict) -> List[str]:
    phone = user['phone']
    m_phone = mask(phone)
    token = user['token']
    bullets = []

    crypto = ImCrypto()

    # 1. 查询当期开奖期数与抽奖券码
    ticket_count = "0"
    issue_name = "当期"
    try:
        _, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
            ("activityId", ACTIVITY_ID),
            ("apiName", "act/LaborApi/getOperationCurrentIssueInfo"),
            ("channelId", CHANNEL_ID),
            ("portal", "45")
        ]))
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

    ticket = user.get('ticket', '')
    en_code = user.get('en_code', '')

    # 1. 启动会话 Warmup 模拟与准备
    token = warmup_session(sess, crypto, token, phone)
    tpl_meta = query_template_meta(sess, token)

    # 2. 一键做同款：AI 视频制作获取抽奖点数 (每3天赠送3次免费机会，每次获得20点数+1张Pad抽奖券码)
    make_success = 0
    earned_points = 0

    log(f"[{m_phone}] 正在执行「一键做同款」AI制作 (获取抽奖点数与Pad券码)...")
    for attempt in range(1, 4):
        token = premake_prepare(sess, crypto, token, phone, tpl_meta)
        rand_name = f"{tpl_meta['videoName']}{random.randint(100000, 999999)}"
        payload = OrderedDict([
            ("channelId", CHANNEL_ID), ("portal", "45"), ("mobile", phone),
            ("openId", ""), ("makeId", ""), ("background", tpl_meta.get("background", "")), ("userPhotos", ""),
            ("userWords", tpl_meta["userWords"]),
            ("templateName", rand_name), ("videoName", rand_name),
            ("templateId", tpl_meta["templateId"]), ("templateConfId", tpl_meta["templateConfId"]), ("aid", ACTIVITY_ID),
            ("inviterMobile", en_code), ("isAI", tpl_meta.get("isAI", 0)), ("aiPack", 0), ("arrangeId", tpl_meta.get("arrangeId", DEFAULT_ARRANGE_ID)),
            ("autoOrderUgc", 0), ("aiGatewayImagMakeId", ""), ("fromType", ""),
            ("sessionId", ""), ("voice", ""), ("invitationCode", en_code)
        ])
        enc_str = crypto.encrypt(payload)
        api_url = f"https://ai.imusic.cn/hapi/diy_video/au/template_make_add_v2?formData={urllib.parse.quote(enc_str)}"
        h = get_imusic_headers(crypto, token)
        try:
            r_make = sess.post(api_url, headers=h, data="", timeout=15)
            dec_resp = crypto.decrypt(r_make.text)
        except Exception as e:
            log(f"[{m_phone}] 第 {attempt} 次制作网络异常: {str(e)}")
            break

        # 检查是否命中 10013 风控并触发官方 remedy 自动补救
        if "10013" in dec_resp:
            log(f"[{m_phone}] 触发风控校验 (10013)，正在执行官方 remedy 自动补救...")
            trace_id = safe_get(json.loads(dec_resp), "imuTraceId", default="") if dec_resp.startsWith('{') else ""
            try:
                send_stat_message(sess, crypto, token, phone, "page_vring_index", f"玩转AI赢手机_activityID_{ACTIVITY_ID}_entrance_{CHANNEL_ID}")
                send_stat_message(sess, crypto, token, phone, "activity_vring_make_1.9", f"_activityID_{ACTIVITY_ID}_entrance_{CHANNEL_ID}")
                rem_en = crypto.encrypt({"method": "remedy", "traceId": trace_id, "mobile": phone})
                sess.post(f"https://ai.imusic.cn/hapi/en/api?formData={urllib.parse.quote(rem_en)}", headers=get_imusic_headers(crypto, token), data="", timeout=15)
                # 重新刷新 SSO Token
                res_refresh = sess.post(
                    "https://ai.imusic.cn/vapi/vue_login/sso_login_v2",
                    json={"portal": "45", "channelId": CHANNEL_ID, "ticket": ticket, "user118100cn": "user118100cn"},
                    headers={"Content-Type": "application/json", "Referer": f"https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc={CHANNEL_ID}&ca=w7x6"},
                    timeout=15
                ).json()
                if res_refresh.get("token"):
                    token = res_refresh["token"]
                token = premake_prepare(sess, crypto, token, phone, tpl_meta)
                time.sleep(1)
                r_make_retry = sess.post(api_url, headers=get_imusic_headers(crypto, token), data="", timeout=15)
                dec_resp = crypto.decrypt(r_make_retry.text)
            except Exception:
                pass

        if '"code":"0000"' in dec_resp:
            make_success += 1
            earned_points += 20
            log(f"[{m_phone}] 第 {attempt} 次「一键做同款」制作成功！(+20点数, +1Pad抽奖券码)")
            time.sleep(1.5)
        elif "免费次数已用完" in dec_resp or "机会已用" in dec_resp or "不足" in dec_resp:
            log(f"[{m_phone}] 免费制作次数已耗尽 (每3天赠送3次免费机会)")
            break
        else:
            log(f"[{m_phone}] 第 {attempt} 次制作反馈: {dec_resp[:80]}")
            break

    if make_success > 0:
        bullets.append(f"• 一键做同款: 完成 {make_success} 次制作 [{tpl_meta['videoName']}] (+{earned_points}点数)")
    else:
        bullets.append("• 一键做同款: 今日免费制作次数已用完 (每3天赠送3次)")

    bullets.append(f"• Pad抽奖券码: 当期总发放 {ticket_count} 张 (每期送iPad·自动开奖)")

    # 3. 查询总点数与可用点数
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
        if dec_score.startswith('{'):
            s_data = json.loads(dec_score).get("data") or {}
            total_score = str(s_data.get("totalScore", "0"))
            remaining_score = int(s_data.get("remainingScore", 0) or 0)
    except Exception:
        pass

    # 4. 点数抽大奖 (每20点数抽奖1次)
    lottery_count = remaining_score // LOTTERY_COST_SCORE
    log(f"[{m_phone}] 积分核验: 可用点数={remaining_score}, 累计总点数={total_score}, 可抽奖={lottery_count}次")

    prizes = []
    if lottery_count > 0:
        for idx in range(1, lottery_count + 1):
            r_draw, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
                ("activityId", ACTIVITY_ID),
                ("mobile", phone),
                ("apiName", "act/LaborApi/funPlayFestivalLottery"),
                ("channelId", CHANNEL_ID),
                ("portal", "45")
            ]))
            dec_draw = crypto.decrypt(r_draw.text)
            if dec_draw.startswith('{'):
                d_obj = json.loads(dec_draw)
                p_name = safe_get(d_obj, 'data', 'awardName') or safe_get(d_obj, 'data', 'prizeName') or '神秘礼包'
                prizes.append(p_name)
                log(f"[{m_phone}] 🎁 第 {idx} 次抽奖获得: {p_name}")
            time.sleep(1)

    if prizes:
        bullets.append(f"• 点数抽大奖: 完成 {len(prizes)} 次: [{', '.join(prizes)}]")
    else:
        # 回显最近一次历史中奖
        try:
            r_hist, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", OrderedDict([
                ("activityId", ACTIVITY_ID),
                ("mobile", phone),
                ("pageNo", 1),
                ("pageSize", 1),
                ("apiName", "act/LaborApi/getOperationPrizeRecordList"),
                ("channelId", CHANNEL_ID),
                ("portal", "45")
            ]))
            dec_hist = crypto.decrypt(r_hist.text)
            h_items = safe_get(json.loads(dec_hist), 'data', 'list') or []
            if h_items:
                last_award = h_items[0].get('awardName', '礼品')
                last_date = (h_items[0].get('lotteryDate') or '')[5:10]
                bullets.append(f"• 点数抽大奖: 今日点数已抽完 · 最近中奖: [{last_date} {last_award}]")
            else:
                bullets.append("• 点数抽大奖: 今日可用点数已耗尽 (每20点抽1次)")
        except Exception:
            bullets.append("• 点数抽大奖: 今日可用点数已耗尽 (每20点抽1次)")

    # 5. 账户总点数
    bullets.append(f"• 账户当前点数: 剩余 {remaining_score % 20} 点数 (累计总点数: {total_score})")
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

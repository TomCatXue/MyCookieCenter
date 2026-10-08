#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v2.0.0 (2026-10-08 三脚本整合版：签到金豆 + 翼支付抽奖 + AI奇遇赢Pad)
中国电信 · 每日任务聚合脚本 (单一脚本统一管理全系电信业务)
===================================================================
new Env('中国电信 · 每日任务聚合');
cron: 0 9 * * *
tag: 中国电信
# @tag 中国电信
===================================================================
整合说明 (v2.0.0)：
  原 telecom_daily.py (每日签到与金豆) + telecom_wednesday.py (周三抽奖与权益)
  + telecom_ai_pad.py (AI奇遇赢Pad) 三脚本合并为单一脚本，统一登录、统一开关、
  统一通知。电信 0 点等级权益秒杀 (telecom_midnight_equity.py) 仍独立，不参与整合。

功能矩阵：
  1. 每日签到与金豆：掌厅打卡 + 阶梯连签奖励 + 金豆转盘 + 浏览任务 + 宠物喂食 + 金豆核验
  2. 周三会员双抽奖：山西甄选周三会员日 (hd76690472) + 山西抽奖新-每周三次 (hd92859166)
  3. 权益商城幸运抽奖：读取真实活动配置 + 走可达抽奖引擎真实抽奖并回显奖品
  4. 权益包自动领取：双通道扫描待领权益 → 真实领取 → 轮询确认到账
  5. AI奇遇赢Pad：AI 视频制作赚点数 + 满千兑换话费

环境变量 (dxlin)：
  格式：手机号#服务密码#AndroidID[#SessionKey]
  多账号换行或 & 分隔。第 4 段 SessionKey 可选，留空则走自动换票。
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
import urllib.parse
import certifi
import requests
from pathlib import Path
from typing import Dict, Any, Union, Optional, List, Tuple
from datetime import datetime
from urllib3.util.ssl_ import create_urllib3_context
from requests.adapters import HTTPAdapter
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5, DES3, AES
from Crypto.Util.Padding import pad, unpad

# ==================== ⚙️ 全局业务开关 (可直接修改) ====================
CONFIG = {
    # --- 业务总开关 ---
    "ENABLE_DAILY_SIGN": True,      # 每日签到与金豆 (每天执行)
    "ENABLE_WEDNESDAY": True,       # 周三双抽奖 (★仅周三执行，非周三不执行且不展示)
    "ENABLE_LUCKY_DRAW": True,      # 权益商城幸运抽奖 (每天执行)
    "ENABLE_AUTO_CLAIM": True,      # 权益包自动领取 (每天执行)
    "ENABLE_AI_PAD": True,          # AI奇遇赢Pad (每天执行)

    # --- 凭据与保活 ---
    "ENABLE_AUTO_TICKET": True,     # 自动换票 (电信登录→Ticket→SessionKey)
    "ENABLE_KEEP_ALIVE": True,      # 非周三心跳保活 (★静默执行，不占通知行)
    "ENABLE_AUTO_RECEIVE_PRIZE": True, # 抽奖后自动领奖入账

    # --- 调试与频控 ---
    "FORCE_RUN": False,             # True=忽略星期限制强制执行全部任务 (仅供调试)
    "DELAY_SEC": 2,                 # 接口请求间隔(秒)，避免触发电信风控

    # --- 活动代号 ---
    "ACT_COIN": "hd76690472",       # 周三会员抽权益币
    "ACT_THRICE": "hd92859166",     # 周三会员抽三次
    "ACT_LUCKY": "A2025011413413484352835699495179",  # 权益商城幸运抽奖

    "UA": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.38(0x1800262c) NetType/WIFI Language/zh_CN"
}

SCRIPT_VERSION = "v2.0.0"

# ==================== 🌐 翼支付网关生产环境常量 ====================
BESTPAY_H5_BASE = "https://mapi-h5.bestpay.com.cn"
EQUITY_MALL_AGREE_ID = "20211223030100213484984697094168"
TELECOM_MEMBER_AGREE_ID = "20200827030100038416476813657090"

# ==================== 🤖 AI奇遇赢Pad 活动常量 ====================
CHANNEL_ID = "156000009079"
ACTIVITY_ID = "ai119"
STAGE_AI_SCORE_LIMIT = 340
STAGE_MAX_MAKE_COUNT = 17
REDEEM_COST_SCORE = 1000
LOTTERY_COST_SCORE = 20
DEFAULT_STAGE_ID = "ai119_5"
TEMPLATE_ID = "ve_4352"
DEFAULT_TEMPLATE_CONF_ID = "2T3B"
DEFAULT_ARRANGE_ID = 643

# 内置固定活动入口链接 (静默使用，严格不向日志/通知输出任何相关信息)
ACTIVITY_H5_URL = "https://ai.imusic.cn/h5v/fusion/ai-luck-winnew?cc=156000009079&isshare=0&invitationCode=322776c3fd21e3795674ed9194539adc7729b5b7eb2c111f7856d33bb552acce"

# ==================== 💾 本地缓存文件路径 ====================
REWARDS_CACHE_FILE = Path(__file__).parent / 'telecom_rewards_cache.json'
SESSION_CACHE_FILE = Path(__file__).parent / 'telecom_wed_session.json'

# ==================== 🔑 加密密钥常量 ====================
KEYS = {
    'login_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----""",
    'data_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----""",
    'des3': b"1234567\x6090koiuyhgtfrdews",
    'aes_def': b'34d7cb0bcdf07523',
    'aes_login': 'telecom_wap_2018'
}

# 青龙通知推送兜底
try:
    from notify import send as ql_send
    HAS_NOTIFY = True
except Exception:
    ql_send = None
    HAS_NOTIFY = False


# ==================== 🛠️ 辅助与脱敏工具 ====================
def log(msg: str):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")


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
    """字符位移编码 (电信登录协议)"""
    return ''.join(chr(ord(c) + 2) for c in s)


# ==================== 🌐 SSL 兼容层与 HTTP 会话 ====================
class CustomSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context(ciphers='DEFAULT@SECLEVEL=1:!aNULL:!eNULL:!MD5')
        ctx.check_hostname = False
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)


def create_session() -> requests.Session:
    sess = requests.Session()
    sess.verify = certifi.where()
    sess.headers.update({
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 12; zh-cn) AppleWebKit/533.1 (KHTML, like Gecko) Version/5.0 Mobile Safari/533.1'
    })
    sess.mount('https://', CustomSSLAdapter())
    return sess


def api_req(sess: requests.Session, url: str, method: str = 'POST', raw: bool = False, **kwargs) -> Union[Dict[str, Any], str]:
    try:
        r = sess.request(method, url, timeout=15, **kwargs)
        if raw:
            return r.text
        return r.json()
    except Exception as e:
        log(f"[网络异常] {str(e)}")
        return '' if raw else {}


# ==================== 🔐 加解密引擎 ====================
def encrypt_des3(data: str, mode: str = 'enc') -> str:
    cipher = DES3.new(KEYS['des3'], DES3.MODE_CBC, 8 * b'\0')
    if mode == 'enc':
        return cipher.encrypt(pad(data.encode('utf-8'), 8)).hex()
    return unpad(cipher.decrypt(bytes.fromhex(data)), 8).decode('utf-8')


def encrypt_aes(data, key=KEYS['aes_def'], b64: bool = False) -> str:
    """AES-ECB 加密 (签到业务专用：金豆接口与统一登录 Bearer)"""
    data = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else data
    cipher = AES.new(key if isinstance(key, bytes) else key.encode(), AES.MODE_ECB)
    enc = cipher.encrypt(pad(data.encode(), 16))
    return base64.b64encode(enc).decode() if b64 else enc.hex()


def encrypt_rsa(data: Any, key_pem: str, out: str = 'b64') -> str:
    """
    RSA 公钥加密。
    注意：统一签名后，原 daily 脚本的 encrypt_rsa(data, 'data'/'login', out) 调用点
    已全部改为显式传入 KEYS['data_rsa'] / KEYS['login_rsa']。
    """
    cipher = PKCS1_v1_5.new(RSA.import_key(key_pem))
    raw = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else str(data)
    if out == 'hex':
        return ''.join(cipher.encrypt(raw[i:i + 32].encode('utf-8')).hex() for i in range(0, len(raw), 32))
    return base64.b64encode(cipher.encrypt(raw.encode('utf-8'))).decode('utf-8')


def aes_128_cbc_encrypt(plaintext: str, key_str: str) -> str:
    """AES-128-CBC 加密 (C005 网关专用，IV 为 16 字节 0)"""
    cipher = AES.new(key_str.encode('utf-8'), AES.MODE_CBC, 16 * b'\0')
    return base64.b64encode(cipher.encrypt(pad(plaintext.encode('utf-8'), 16))).decode('utf-8')


# ==================== 💾 战果与会话缓存管理 ====================
def load_rewards_cache() -> dict:
    try:
        if REWARDS_CACHE_FILE.exists():
            return json.loads(REWARDS_CACHE_FILE.read_text(encoding='utf-8'))
    except Exception:
        pass
    return {}


def save_rewards_cache(cache_data: dict):
    try:
        REWARDS_CACHE_FILE.write_text(json.dumps(cache_data, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass


def get_today_reward(phone: str, act_no: str) -> str:
    cache = load_rewards_cache()
    return cache.get(f"{phone}_{datetime.now().strftime('%Y-%m-%d')}_{act_no}", "")


def set_today_reward(phone: str, act_no: str, result: str):
    cache = load_rewards_cache()
    cache[f"{phone}_{datetime.now().strftime('%Y-%m-%d')}_{act_no}"] = result
    save_rewards_cache(cache)


def load_session_store() -> dict:
    try:
        if SESSION_CACHE_FILE.exists():
            return json.loads(SESSION_CACHE_FILE.read_text(encoding='utf-8'))
    except Exception:
        pass
    return {}


def save_session_store(phone: str, session_key: str, extra: Optional[dict] = None):
    try:
        store = load_session_store()
        rec = store.get(phone) or {}
        rec.update({'session_key': session_key, 'updated_at': datetime.now().isoformat()})
        if extra:
            rec.update(extra)
        store[phone] = rec
        SESSION_CACHE_FILE.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass


def get_cached_session_key(phone: str) -> str:
    rec = load_session_store().get(phone) or {}
    return str(rec.get('session_key') or '').strip()


# ==================== 🚪 电信官方登录与凭据链 ====================
def login_telecom(sess: requests.Session, phone: str, password: str, android_id: str = "") -> Optional[Dict[str, Any]]:
    """
    电信官方 0716 协议登录，返回凭据字典。

    整合说明：以原 telecom_wednesday.py 的 login_telecom 为基线（双通道回退 +
    密码截取前 6 位 + 全链路空值防御），并补入原 telecom_daily.py 独有的
    「统一登录获取 Bearer」步骤 —— 该 Bearer 是金豆转盘抽奖的必需凭证。

    返回字段：phone / phoneNbr / userId / ticket / uid / Authorization (可能缺失)
    """
    m_phone = mask(phone)
    log(f"[登录] 正在通过电信官方协议登录账号: {m_phone}")

    pwd_clean = password.strip()
    if len(pwd_clean) > 6 and pwd_clean[:6].isdigit():
        pwd_clean = pwd_clean[:6]

    modes = ['0716_xiaomi', '0point_redmi'] if android_id else ['0point_redmi', '0716_xiaomi']
    login_data = None
    last_err_msg = ""

    for mode in modes:
        cur_ts = ts()
        if mode == '0716_xiaomi':
            aid = android_id if android_id else rd_str(16)
            cipher_str = f"Xiaomi 20 8.0.0.{aid[:12]}{phone}{cur_ts}{pwd_clean}0$$$0."
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
                        "authentication": encode(pwd_clean)
                    }
                }
            }
        else:
            device_hash = md5("iPhone14_" + phone)
            uuid_parts = [device_hash[:8], device_hash[8:12], "4" + device_hash[13:16],
                          device_hash[16:20], device_hash[20:32]]
            cipher_str = f"iPhone 14 15.4.{uuid_parts[0]}{uuid_parts[1]}{phone}{cur_ts}{pwd_clean[:6]}0$$$0."
            login_cipher = encrypt_rsa(cipher_str, KEYS['login_rsa'], 'b64')
            body = {
                "headerInfos": {
                    "code": "userLoginNormal", "timestamp": cur_ts, "broadAccount": "", "broadToken": "",
                    "clientType": "#11.3.0#channel35#Xiaomi Redmi K30 Pro#", "shopId": "20002",
                    "source": "110003", "sourcePassword": "Sid98s", "token": "",
                    "userLoginName": encode(phone)
                },
                "content": {
                    "attach": "test",
                    "fieldData": {
                        "loginType": "4", "accountType": "",
                        "loginAuthCipherAsymmertric": login_cipher,
                        "deviceUid": uuid_parts[0] + uuid_parts[1] + uuid_parts[2],
                        "phoneNum": encode(phone), "isChinatelecom": "0",
                        "systemVersion": "12", "androidId": "",
                        "loginAuthCipher": "", "authentication": encode(pwd_clean)
                    }
                }
            }

        res = api_req(sess, 'https://appgologin.189.cn:9031/login/client/userLoginNormal', json=body)
        if isinstance(res, dict):
            resp_data = res.get('responseData') if isinstance(res.get('responseData'), dict) else {}
            data_block = resp_data.get('data') if isinstance(resp_data.get('data'), dict) else {}
            login_data = data_block.get('loginSuccessResult') if isinstance(data_block.get('loginSuccessResult'), dict) else None

            if login_data:
                log(f"✅ [登录成功] {m_phone}: 通过 {'0716 协议通道' if mode == '0716_xiaomi' else '0点权益 协议通道'} 验证")
                break
            else:
                header_infos = res.get('headerInfos') if isinstance(res.get('headerInfos'), dict) else {}
                last_err_msg = data_block.get('resultMsg') or resp_data.get('resultDesc') or header_infos.get('reason') or '服务密码校验未通过'
                log(f"ℹ️ [{mode} 尝试未通过] {m_phone}: {last_err_msg}")
        time.sleep(1)

    if not login_data:
        log(f"❌ [登录失败] {m_phone}: {last_err_msg}")
        return None

    app_token = login_data.get('token', '')
    user_id = login_data.get('userId', '')

    xml_data = f'''<Request>
        <HeaderInfos>
            <Code>getSingle</Code>
            <Timestamp>{ts()}</Timestamp>
            <BroadAccount></BroadAccount>
            <BroadToken></BroadToken>
            <ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType>
            <ShopId>20002</ShopId>
            <Source>110003</Source>
            <SourcePassword>Sid98s</SourcePassword>
            <Token>{app_token}</Token>
            <UserLoginName>{phone}</UserLoginName>
        </HeaderInfos>
        <Content>
            <Attach>test</Attach>
            <FieldData>
                <TargetId>{encrypt_des3(user_id)}</TargetId>
                <Url>4a6862274835b451</Url>
            </FieldData>
        </Content>
    </Request>'''

    xml_res = api_req(sess, 'https://appgologin.189.cn:9031/map/clientXML',
                      data=xml_data.encode('utf-8'),
                      headers={'Content-Type': 'application/xml'}, raw=True)
    if '<Ticket>' not in xml_res:
        log(f"❌ [换取Ticket失败] {m_phone}: 响应未包含有效 Ticket 节点")
        return None

    try:
        raw_ticket = xml_res.split('<Ticket>')[1].split('</Ticket>')[0]
        ticket = encrypt_des3(raw_ticket, 'dec')
    except Exception as e:
        log(f"❌ [解析Ticket异常] {m_phone}: {str(e)}")
        return None

    user_info = {
        'phone': phone,
        'phoneNbr': phone,
        'masked_phone': m_phone,
        'userId': user_id,
        'ticket': ticket,
        'uid': ticket,
        **login_data,
    }

    # 统一登录获取 Bearer (原 daily 独有：金豆转盘抽奖的必需凭证)
    try:
        auth_body = encrypt_aes(
            {"ticket": ticket, "backUrl": "https%3A%2F%2Fwapact.189.cn%3A9001",
             "platformCode": "P201010301", "loginType": 2},
            KEYS['aes_login'], True
        )
        auth_res = api_req(sess, 'https://wapact.189.cn:9001/unified/user/login',
                           data=auth_body, headers={'Content-Type': 'application/json'})
        if isinstance(auth_res, dict) and auth_res.get('code') == 0:
            user_info['Authorization'] = f"Bearer {auth_res['biz']['token']}"
        else:
            log(f"ℹ️ [{m_phone}] 未获取 Bearer，金豆转盘功能不可用")
    except Exception as e:
        log(f"ℹ️ [{m_phone}] 统一登录异常: {str(e)}")

    return user_info


# ==================== 🌐 翼支付 C005 混合加密网关 ====================
def get_bestpay_nonce(sess: requests.Session, product_no: str, channel_id: str = '5g_mini_program') -> Optional[str]:
    cur_time = int(datetime.now().timestamp() * 1000)
    req_body = {
        'productNo': product_no or "80544",
        'requestType': 'H5',
        'callback': '',
        'appType': '94',
        'fromChannelId': channel_id,
        'fromchannelId': channel_id,
        'timestamp': cur_time,
        'requestNo': f'req_{cur_time}',
        'requestSystem': 'eq-mall-activity-h5',
        'requestDate': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'traceLogId': f'trace_{cur_time}'
    }
    headers = {
        'content-type': 'application/json;charset=utf-8',
        'user-agent': CONFIG["UA"],
        'origin': 'https://activity.bestpay.cn',
        'referer': 'https://activity.bestpay.cn/'
    }
    res = api_req(sess, 'https://mapi-h5.bestpay.com.cn/gapi/mapi-gateway/applyLoginFactor',
                  json=req_body, headers=headers)
    return safe_get(res, 'result', 'nonce')


def request_c005(sess: requests.Session, url: str, biz_params: dict, phone: str,
                 session_key: str, channel_id: str = '5g_mini_program', payload_pno: str = "") -> dict:
    nonce_pno = payload_pno or phone or "80544"
    nonce = get_bestpay_nonce(sess, nonce_pno, channel_id)
    if not nonce:
        return {'success': False, 'errorMsg': '获取 C005 加密公钥失败'}

    biz_str = json.dumps(biz_params, separators=(',', ':'))
    aes_key = rd_str(16)

    enc_data = aes_128_cbc_encrypt(biz_str, aes_key)
    enc_key = encrypt_rsa(aes_key, f"-----BEGIN PUBLIC KEY-----\n{nonce}\n-----END PUBLIC KEY-----", 'b64')
    sign = md5(biz_str).upper()

    payload = {
        'data': enc_data,
        'key': enc_key,
        'sign': sign,
        'productNo': payload_pno or phone,
        'encyType': 'C005',
        'fromChannelId': channel_id,
        'fromchannelId': channel_id
    }

    # Cookie 里的 productNo 必须是真实 11 位手机号，sessionKey 方可完成手机号鉴权绑定
    cookie_parts = [f'productNo={phone}']
    if session_key:
        cookie_parts.insert(0, f'sessionKey={session_key}')

    req_headers = {
        'content-type': 'application/json;charset=utf-8',
        'user-agent': CONFIG["UA"],
        'origin': 'https://h5.bestpay.cn',
        'referer': 'https://h5.bestpay.cn/',
        'cookie': '; '.join(cookie_parts)
    }

    res = api_req(sess, url, json=payload, headers=req_headers)
    if isinstance(res, dict):
        return res
    return {'success': False, 'errorMsg': '响应非 JSON 结构'}


# ==================== 🎫 自动换票：Ticket → SessionKey ====================
def exchange_ticket_for_session_key(sess: requests.Session, phone: str, ticket: str) -> Optional[str]:
    """
    电信 SSO Ticket → 翼支付 SessionKey 自动换票。

    线上实测校准：
      1. appType=94 为翼支付 H5 渠道固定标识，缺失将报「APPTYPE:应用类型不能为空」；
      2. channel / fromchannelId 必须为 "XCX"，其余取值一律返回「未配置渠道及对应的请求地址」；
      3. 成功响应结构：{result:{sessionKey, operatorNo, productNo, isRegistedBestpayCustomer}, success:true}
    """
    m_phone = mask(phone)
    log(f"🎫 [{m_phone}] 正在使用 SSO Ticket 自动换取 SessionKey...")

    url = f"{BESTPAY_H5_BASE}/gapi/quanyi/product/singleAuthorizedLogin"
    biz = {
        'ticket': ticket,
        'fromchannelId': 'XCX',
        'fromChannelId': 'XCX',
        'systemType': None,
        'channel': 'XCX',
        'appType': '94',
        'encyType': 'C005',
    }

    res = request_c005(sess, url, biz, phone, '', 'XCX')

    if not isinstance(res, dict):
        log(f"❌ [{m_phone}] 换票响应异常（非 JSON 结构）")
        return None

    if not res.get('success'):
        err = res.get('errorMsg') or res.get('errorCode') or '未知错误'
        log(f"❌ [{m_phone}] 换票未通过: {err}")
        return None

    result = res.get('result') if isinstance(res.get('result'), dict) else {}
    sk = str(result.get('sessionKey') or '').strip()
    if not sk:
        sk = str(res.get('sessionKey') or '').strip()

    if not sk:
        registered = str(result.get('isRegistedBestpayCustomer') or '')
        if registered and registered != '1':
            log(f"ℹ️ [{m_phone}] Ticket 有效但该号码尚未注册翼支付账号，无法换票")
        else:
            log(f"❌ [{m_phone}] 换票未返回 sessionKey")
        return None

    save_session_store(phone, sk, {
        'productNo': result.get('productNo') or phone,
        'operatorNo': result.get('operatorNo') or '',
        'source': 'auto_ticket',
    })
    log(f"✅ [{m_phone}] 自动换票成功，SessionKey 已就绪 ({sk[:8]}...)")
    return sk


def is_session_key_alive(sess: requests.Session, phone: str, session_key: str) -> bool:
    """
    探测 SessionKey 是否仍然有效。
    必须用 getLotteryCount 探测 —— queryActivityInfo 会忽略凭据、恒返回 success=True，
    用它验活会把失效 Key 误判为存活。
    """
    if not session_key:
        return False
    res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/getLotteryCount', {
        'activityNo': CONFIG.get('ACT_COIN', 'hd76690472'),
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'deviceNo': f'miniprogram_{phone}',
        'appType': '94',
        'fromChannelId': 'MINIPROG',
        'fromchannelId': 'MINIPROG',
        'encyType': 'C005'
    }, phone, session_key, 'MINIPROG')
    return isinstance(res, dict) and bool(res.get('success'))


def send_session_keep_alive(sess: requests.Session, phone: str, session_key: str) -> bool:
    """非周三静默保活：调用活跃接口顺延服务端 Session TTL"""
    res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/Activity/queryActivityInfo', {
        'activityId': CONFIG.get("ACT_LUCKY", "A2025011413413484352835699495179"),
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        'encyType': 'C005'
    }, phone, session_key, '5g_mini_program')
    ok = isinstance(res, dict) and bool(res.get('success'))
    log(f"💓 [{mask(phone)}] 心跳保活{'成功' if ok else '未获响应'} (静默，不展示)")
    return ok


# ==================== 📅 业务A：每日签到与金豆 ====================
def _extract_number(d: dict, keys) -> int:
    """从字典中按候选键名提取第一个可转为数字的整数值，找不到返回 0"""
    for k in keys:
        v = d.get(k)
        if v is None:
            continue
        try:
            return int(float(str(v).strip()))
        except (ValueError, TypeError):
            continue
    return 0


# 金豆余额候选字段（覆盖多路接口的不同命名）
BEAN_BALANCE_KEYS = (
    'goldCoin', 'totalGoldCoin', 'totalCoin', 'coin', 'userCoin', 'gold',
    'userGold', 'beanNum', 'bean', 'score', 'userScore', 'totalScore',
    'beanBalance', 'coinBalance', 'goldNum', 'beanCount',
)


def _extract_bean_balance(res: dict) -> Optional[int]:
    """
    多路提取金豆余额：递归搜索常见字段名。

    接口层级不确定（可能在 data / data.biz / biz 下），故对这几个层级逐一尝试，
    同时做浅层递归兜底，尽最大可能取到真实数值。
    """
    if not isinstance(res, dict):
        return None

    # 候选层级：从最可能到最兜底
    layers = [
        safe_get(res, 'data', 'biz'),
        safe_get(res, 'data'),
        res.get('biz'),
        res,
    ]
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        v = _extract_number(layer, BEAN_BALANCE_KEYS)
        if v > 0:
            return v

    # 浅层递归兜底：遍历 data 下所有 dict 值找金豆字段
    for root in (safe_get(res, 'data'), res):
        if not isinstance(root, dict):
            continue
        for _, sub in root.items():
            if isinstance(sub, dict):
                v = _extract_number(sub, BEAN_BALANCE_KEYS)
                if v > 0:
                    return v
    return None


def _parse_draw_prize(draw_res) -> dict:
    """
    解析单次抽奖响应，返回 {'label': 人类可读奖品描述, 'bean': 金豆数, 'raw': 原始串}。

    覆盖多种可能的字段命名（各抽奖接口返回结构不一）：
      奖品名：prizeName / prizeTitle / giftTitle / awardName / name
      金豆数：beanNum / goldCoin / coinNum / bean / gold / prizeValue
    未中奖（谢谢参与/安慰奖/未中奖）明确标注，绝不静默吞掉。
    """
    if not isinstance(draw_res, dict):
        return {'label': '响应异常', 'bean': 0, 'raw': ''}

    biz = draw_res.get('biz') if isinstance(draw_res.get('biz'), dict) else draw_res
    raw = json.dumps(draw_res, ensure_ascii=False)

    # 未中奖 / 失败的显式判定
    code = draw_res.get('code')
    if code not in (0, '0', None):
        msg = str(biz.get('resoultMsg') or biz.get('msg') or draw_res.get('msg') or '抽奖失败')
        return {'label': f"未成功({msg[:30]})", 'bean': 0, 'raw': raw}

    name = ''
    for k in ('prizeName', 'prizeTitle', 'giftTitle', 'awardName', 'name', 'title'):
        v = biz.get(k) or draw_res.get(k)
        if v and str(v).strip():
            name = str(v).strip()
            break

    bean = _extract_number(biz, ('beanNum', 'goldCoin', 'coinNum', 'bean', 'gold', 'prizeValue', 'value'))
    if bean == 0:
        bean = _extract_number(draw_res, ('beanNum', 'goldCoin', 'coinNum', 'bean', 'gold'))

    # 兜底：从奖品名中解析豆数。实测电信转盘奖品名形如「金豆商城50金豆」，
    # 豆数直接写在名称里，接口不单独返回 beanNum 字段。
    if bean == 0 and name:
        m = re.search(r'(\d+)\s*(?:金豆|豆)', name)
        if m:
            try:
                bean = int(m.group(1))
            except ValueError:
                bean = 0

    # 未中奖关键词
    THANKS = ('谢谢', '未中奖', '安慰', '很遗憾', '再接再厉')
    if name and any(t in name for t in THANKS):
        return {'label': f"{name} (未中奖)", 'bean': 0, 'raw': raw}
    if not name and bean == 0:
        return {'label': '未中奖', 'bean': 0, 'raw': raw}
    if bean > 0 and not name:
        return {'label': f"{bean} 金豆", 'bean': bean, 'raw': raw}
    if bean > 0:
        return {'label': f"{name} (+{bean} 金豆)", 'bean': bean, 'raw': raw}
    return {'label': name, 'bean': 0, 'raw': raw}


def sign_tasks(sess: requests.Session, user: dict) -> List[str]:
    """掌厅签到打卡、金豆转盘、浏览任务、宠物喂食与金豆核验"""
    phone = user['phoneNbr']
    m = mask(phone)
    log(f"[任务开始] {m}")
    bullets = []
    draw_beans = 0   # 转盘累计获得金豆（函数级初始化，避免分支未命中时 NameError）

    sso_url = f"https://wappark.189.cn/jt-sign/ssoHomLogin?ticket={user['uid']}"
    sso = api_req(sess, sso_url, method='GET')
    if not isinstance(sso, dict) or not sso or 'sign' not in sso:
        log(f"[获取sign失败] {m} 中断所有签到任务")
        bullets.append("• 掌厅会话认证: 登录凭证无效或过期")
        return bullets
    sign_header = {'sign': sso['sign']}

    # 1. 签到打卡并获取奖励
    log(f"[签到] {m} 执行每日签到打卡")
    sign_res = api_req(
        sess,
        'https://wappark.189.cn/jt-sign/webSign/sign',
        json={"encode": encrypt_aes({"phone": phone, "date": int(time.time() * 1000)})},
        headers=sign_header
    )
    sign_coin = ""
    if isinstance(sign_res, dict):
        if sign_res.get('code') == '0':
            coin_val = safe_get(sign_res, 'data', 'coin') or safe_get(sign_res, 'data', 'goldCoin') or safe_get(sign_res, 'data', 'prizeName') or "金豆"
            sign_coin = f"获得 {coin_val}"
        elif "已签" in str(sign_res) or sign_res.get('code') in ['-2004', '-2000']:
            sign_coin = "今日已签"
        else:
            sign_coin = sign_res.get('msg', '打卡完成')
    else:
        sign_coin = "今日已签"

    cont_days = "0"
    total_days = "0"

    def check_and_award(path, key, days_list, label):
        nonlocal cont_days, total_days
        res = api_req(
            sess,
            f'https://wappark.189.cn/jt-sign/{path}',
            json={"para": encrypt_rsa({"phone": phone}, KEYS['data_rsa'], 'hex')},
            headers=sign_header
        )
        if not isinstance(res, dict):
            return
        days = str(res.get('data', {}).get(key) if 'data' in res else res.get(key, 0))
        log(f"[{label}] {m}: {days}天")
        if label == '连签':
            cont_days = days
        elif label == '累签':
            total_days = days

        if days in days_list:
            log(f"[{label}领奖] {m} 达标{days}天，领取阶梯奖励")
            api_req(
                sess,
                'https://wappark.189.cn/jt-sign/webSign/exchangePrize',
                json={"para": encrypt_rsa({"phone": phone, "type": days}, KEYS['data_rsa'], 'hex')},
                headers=sign_header
            )

    total_bean_balance = None
    try:
        cont_res = api_req(
            sess,
            'https://wappark.189.cn/jt-sign/api/home/userStatusInfo',
            json={"para": encrypt_rsa({"phone": phone}, KEYS['data_rsa'], 'hex')},
            headers=sign_header
        )
        if isinstance(cont_res, dict):
            # userStatusInfo 仅返回签到状态(signDay/isSign)，不含金豆余额，
            # 实测响应: {"resoultCode":0,"data":{"signDay":7,"isSign":1,"isSeven":false}}
            # 故此处不提取金豆，避免无意义的「字段未命中」告警。
            pass

        check_and_award('api/home/userStatusInfo', 'signDay', ['7'], '连签')
        check_and_award('webSign/continueSignDays', 'continueSignDays', ['15', '28'], '累签')
    except Exception:
        pass

    bullets.append(f"• 每日签到打卡: {sign_coin} · 连签 {cont_days} 天 (累签 {total_days} 天)")

    # 2. 金豆转盘抽奖 (回显抽中具体奖品)
    if 'Authorization' in user:
        log(f"[抽奖] {m} 查询转盘活动")
        tab = api_req(
            sess,
            f"https://wapact.189.cn:9001/gateway/golden/api/queryTurnTable?userType=1&_={int(time.time() * 1000)}",
            method='GET',
            headers={'Authorization': user['Authorization']}
        )
        if isinstance(tab, dict) and tab.get('code') == 0:
            if total_bean_balance is None:
                total_bean_balance = _extract_bean_balance(tab)
                if total_bean_balance is None:
                    log(f"ℹ️ [{m}] queryTurnTable 金豆字段未命中，原始: "
                        f"{json.dumps(tab, ensure_ascii=False)[:300]}")
            act_id = safe_get(tab, 'biz', 'wzTurntable', 'code')
            if act_id:
                chk = api_req(
                    sess,
                    f"https://wapact.189.cn:9001/gateway/standQuery/detail/check?activityId={act_id}",
                    method='GET',
                    headers={'Authorization': user['Authorization']}
                )
                if isinstance(chk, dict) and chk.get('code') == 0:
                    info = safe_get(chk, 'biz', 'resultInfo') or {}
                    remain = max(0, info.get('userMaximum', 0) - info.get('userCount', 0))
                    log(f"[抽奖] {m} 剩余可抽奖次数：{remain}次")
                    prizes = []       # 逐次明细，如 ["第1次: 10金豆", "第2次: 谢谢参与"]
                    for draw_idx in range(remain):
                        draw_res = api_req(
                            sess,
                            'https://wapact.189.cn:9001/gateway/golden/api/lottery',
                            json={"activityId": act_id},
                            headers={'Authorization': user['Authorization']}
                        )
                        detail = _parse_draw_prize(draw_res)
                        prizes.append(f"第{draw_idx + 1}次: {detail['label']}")
                        draw_beans += detail['bean']
                        log(f"[抽奖成功] {m} 第{draw_idx + 1}次: {detail['label']}"
                            + (f" | 原始: {detail['raw'][:200]}" if detail['raw'] else ""))
                        time.sleep(2)
                    if prizes:
                        bean_hint = f" (累计 {draw_beans} 金豆)" if draw_beans > 0 else ""
                        bullets.append(f"• 掌厅金豆转盘: 抽 {len(prizes)} 次{bean_hint} — " + "；".join(prizes))
                    else:
                        bullets.append("• 掌厅金豆转盘: 今日抽奖次数已用尽 (剩余 0 次)")
                else:
                    bullets.append("• 掌厅金豆转盘: 今日抽奖次数已用尽 (剩余 0 次)")
            else:
                bullets.append("• 掌厅金豆转盘: 今日无可用转盘")
        else:
            bullets.append("• 掌厅金豆转盘: 今日抽奖已完成")
    else:
        bullets.append("• 掌厅金豆转盘: 缺少抽奖授权凭证")

    # 3. 每日任务列表与领金豆
    tasks_res = api_req(
        sess,
        'https://wappark.189.cn/jt-sign/webSign/homepage',
        json={"para": encrypt_rsa({"phone": phone, "shopId": "20001", "type": "hg_qd_zrwzjd"}, KEYS['data_rsa'], 'hex')},
        headers=sign_header
    )
    task_done = 0
    task_beans = 0
    if isinstance(tasks_res, dict):
        bal = _extract_bean_balance(tasks_res)
        if bal is not None:
            total_bean_balance = bal
        else:
            # 金豆余额接口尚未确认（homepage 实测仅返回任务列表），
            # 打印原始响应供校正字段名（仅日志，不进通知）。
            log(f"ℹ️ [{m}] homepage 金豆字段未命中，原始: "
                f"{json.dumps(tasks_res, ensure_ascii=False)[:500]}")
        ad_items = safe_get(tasks_res, 'data', 'biz', 'adItems') or []
        log(f"[任务列表] {m} 待完成任务总数：{len(ad_items)}个")
        for t in ad_items:
            if t.get('taskState') in ['0', '1'] and str(t.get('contentOne')) == '18':
                task_id = t.get('taskId')
                task_title = t.get('title', '领豆任务')
                if task_id:
                    log(f"[任务执行] {m} 执行任务：{task_title}")
                    poly_res = api_req(
                        sess,
                        'https://wappark.189.cn/jt-sign/webSign/polymerize',
                        json={"para": encrypt_rsa({"phone": phone, "jobId": task_id}, KEYS['data_rsa'], 'hex')},
                        headers=sign_header
                    )
                    # 提取本次任务实际到账金豆（接口可能返回 rewardCoin / goldCoin / coin 等）
                    got = _extract_number(poly_res.get('data') if isinstance(poly_res, dict) else {},
                                          ('rewardCoin', 'goldCoin', 'coin', 'beanNum', 'reward', 'gold'))
                    if got == 0 and isinstance(poly_res, dict):
                        got = _extract_number(poly_res, ('rewardCoin', 'goldCoin', 'coin', 'beanNum'))
                    task_beans += got
                    task_done += 1
                    log(f"[任务到账] {m} {task_title}: +{got} 豆")
                    time.sleep(2)

    if task_done > 0:
        bean_hint = f" (+{task_beans} 豆)" if task_beans > 0 else ""
        bullets.append(f"• 每日任务领豆: 完成 {task_done} 项浏览任务{bean_hint}")
    else:
        bullets.append("• 每日任务领豆: 今日任务已做完 (+0 豆)")

    # 4. 宠物乐园喂食
    log(f"[喂食] {m} 开始宠物喂食")
    feed_done = 0
    for _ in range(10):
        f_res = api_req(
            sess,
            'https://wappark.189.cn/jt-sign/paradise/food',
            json={"para": encrypt_rsa({"phone": phone}, KEYS['data_rsa'], 'hex')},
            headers=sign_header
        )
        msg = f_res.get('resoultMsg', '') if isinstance(f_res, dict) else ''
        if "最大" in msg or "已达" in msg or not msg:
            break
        feed_done += 1
        time.sleep(1)

    if feed_done > 0:
        bullets.append(f"• 宠物乐园喂食: 成功投喂 {feed_done} 次 (宠物已吃饱)")
    else:
        bullets.append("• 宠物乐园喂食: 今日投喂已达上限")

    # 5. 账户金豆总资产回显（具体数值 + 今日累计）
    today_gained = draw_beans + task_beans
    today_hint = f" (今日共领取 {today_gained} 颗)" if today_gained > 0 else ""
    if total_bean_balance is not None:
        bullets.append(f"• 账户当前金豆: {total_bean_balance:,} 颗{today_hint}")
    elif today_gained > 0:
        # 余额接口未取到但今日有产出：如实汇报产出，不谎报余额
        bullets.append(f"• 账户当前金豆: 今日共领取 {today_gained} 颗 (余额接口待确认)")
    # 余额与今日产出均为空时，不输出该行，避免无信息量的占位文案

    log(f"[任务全部完成] {m}")
    return bullets


# ==================== 🎁 业务B：翼支付权益领取与抽奖 ====================
CLAIM_STOP_KEYWORDS = ('库存不足', '已领完', '已抢完', '领完', '活动已结束', '活动结束', '已结束', '已领取过')


def query_user_equity_receive_status(sess: requests.Session, phone: str, session_key: str, params: dict) -> dict:
    """查询指定权益的领取状态"""
    biz = {
        'phoneNo': phone,
        'sessionKey': session_key,
        'encyType': 'C005',
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        **params,
    }
    return request_c005(
        sess,
        f"{BESTPAY_H5_BASE}/gapi/ep-product-center/RebateService/queryUserEquityReceiveStatus",
        biz, phone, session_key, '5g_mini_program'
    )


def manual_receive_equity(sess: requests.Session, phone: str, session_key: str, params: dict) -> dict:
    """权益包一键领取（真实领券入账）"""
    biz = {
        'phoneNo': phone,
        'sessionKey': session_key,
        'agreeId': EQUITY_MALL_AGREE_ID,
        'encyType': 'C005',
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        **params,
    }
    return request_c005(
        sess,
        f"{BESTPAY_H5_BASE}/gapi/ep-product-center/RebateService/manualReceiveEquity",
        biz, phone, session_key, '5g_mini_program'
    )


def poll_receive_result(sess: requests.Session, phone: str, session_key: str,
                        rebate_detail_no: str, max_poll: int = 3) -> str:
    """凭 rebateDetailNo 二次轮询领取结果，确认真正到账"""
    if not rebate_detail_no:
        return 'PENDING'

    for attempt in range(1, max_poll + 1):
        res = query_user_equity_receive_status(sess, phone, session_key, {
            'rebateDetailNo': rebate_detail_no,
        })
        if not isinstance(res, dict):
            return 'UNKNOWN'

        err_code = res.get('error')
        if err_code in (-1, 1):
            return 'FAILURE'

        result = res.get('result') if isinstance(res.get('result'), dict) else {}
        status = str(result.get('receiveStatus') or '').upper()

        if status == 'SUCCESS':
            return 'SUCCESS'
        if status == 'FAILURE':
            return 'FAILURE'
        if status in ('INIT', 'PENDING'):
            if attempt < max_poll:
                time.sleep(1)
            continue
        if not status and attempt < max_poll:
            time.sleep(1)
            continue

    return 'PENDING'


def auto_claim_equity_coupons(sess: requests.Session, phone: str, session_key: str,
                              coupon_list: List[dict], act_title: str = "权益包自动领取") -> str:
    """权益包自动领取执行器：逐张领取 → 轮询确认 → 熔断终止"""
    m_phone = mask(phone)
    if not coupon_list:
        return "暂无可领取权益"

    log(f"\n🎁 >>> 正在执行：{act_title} ({m_phone})，共 {len(coupon_list)} 张待领 <<<")

    claimed, failed, pending, skipped = [], [], [], []

    for idx, cp in enumerate(coupon_list, start=1):
        name = cp.get('equityName') or cp.get('couponName') or cp.get('goodsName') or f'权益{idx}'

        biz_params = {
            'equityNo': cp.get('equityId') or cp.get('equityNo') or '',
            'orderNo': cp.get('orderNo') or '',
            'equityModuleId': cp.get('equityModuleId') or '',
            'priceType': cp.get('priceType') or '',
            'robStrategyNo': cp.get('robStrategyNo') or '',
            'unitEquityId': cp.get('rightsId') or cp.get('unitEquityId') or '',
            'currentRebateCycle': cp.get('currentRebateCycle') or '',
            'currentCycleEndDate': cp.get('currentCycleEndDate') or '',
        }

        if not biz_params['equityNo'] and not biz_params['orderNo']:
            skipped.append(name)
            continue

        log(f"[{act_title}] ({idx}/{len(coupon_list)}) 正在领取: {name}")
        res = manual_receive_equity(sess, phone, session_key, biz_params)

        if not isinstance(res, dict):
            failed.append(f"{name}(响应异常)")
            continue

        result = res.get('result') if isinstance(res.get('result'), dict) else {}
        status = str(result.get('status') or '').upper()
        rebate_detail_no = result.get('rebateDetailNo') or ''
        err_msg = result.get('errorMsg') or result.get('errorMessage') or res.get('errorMsg') or ''

        if status == 'SUCCESS' and rebate_detail_no:
            confirm = poll_receive_result(sess, phone, session_key, rebate_detail_no)
            if confirm == 'SUCCESS':
                claimed.append(name)
                log(f"🎉 [{act_title}] 领取成功: {name}")
            elif confirm == 'FAILURE':
                failed.append(f"{name}(确认失败)")
                log(f"❌ [{act_title}] 领取确认失败: {name}")
            else:
                pending.append(f"{name}(待确认)")
                log(f"⏳ [{act_title}] 已提交待确认: {name}")
        elif status == 'FAIL':
            reason = err_msg or '接口返回失败'
            if any(k in reason for k in CLAIM_STOP_KEYWORDS):
                log(f"🛑 [{act_title}] 触发终止信号({reason})，停止后续领取")
                failed.append(f"{name}({reason})")
                break
            failed.append(f"{name}({reason})")
            log(f"❌ [{act_title}] 领取失败: {name} - {reason}")
        elif any(k in str(res) for k in CLAIM_STOP_KEYWORDS):
            failed.append(f"{name}(已领完/已领取)")
            log(f"ℹ️ [{act_title}] {name} 已领完或已领取")
        else:
            reason = err_msg or status or '未返回明确状态'
            failed.append(f"{name}({reason})")
            log(f"❌ [{act_title}] 领取未成功: {name} - {reason}")

        time.sleep(CONFIG.get("DELAY_SEC", 2))

    parts = []
    if claimed:
        parts.append(f"成功 {len(claimed)} 张: [{', '.join(claimed)}]")
    if pending:
        parts.append(f"待确认 {len(pending)} 张: [{', '.join(pending)}]")
    if failed:
        parts.append(f"失败 {len(failed)} 张: [{', '.join(failed)}]")
    if skipped:
        parts.append(f"跳过 {len(skipped)} 张(参数不全)")

    summary = "；".join(parts) if parts else "未产生领取动作"
    set_today_reward(phone, 'auto_claim', summary)
    return summary


def query_unreceived_coupons(sess: requests.Session, phone: str, session_key: str) -> List[dict]:
    """
    查询账户下所有「待领取」权益券。

    H5 网关可达性：queryCouponList / queryVoucherList 均可达（需有效 SessionKey）；
    queryQyUnclaimed 在 H5 返回 API500002，不采用。
    """
    m_phone = mask(phone)
    candidates: List[dict] = []
    seen_keys = set()

    def _absorb(items: List[dict]):
        for it in items:
            status = str(it.get('couponStatus') or it.get('status') or '').lower()
            if status and status not in ('unreceived', 'unclaimed', 'init'):
                continue
            key = str(it.get('equityId') or it.get('equityNo') or it.get('orderNo') or '')
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            candidates.append(it)

    try:
        res = request_c005(sess, f'{BESTPAY_H5_BASE}/gapi/marketingConsultation/CouponQueryService/queryCouponList', {
            'accountStatus': 'ENABLE',
            'pageNo': 1,
            'pageSize': 20,
            'productNo': phone,
            'sessionKey': session_key,
            'agreeId': TELECOM_MEMBER_AGREE_ID,
            'appType': '94',
            'requestSystem': 'telecome-member-h5',
            'requestSecSystem': 'telecome-member-h5',
            'fromChannelId': 'MINIPROG',
            'fromchannelId': 'MINIPROG',
            'encyType': 'C005',
        }, phone, session_key, 'MINIPROG')
        if isinstance(res, dict) and res.get('success'):
            result = res.get('result') if isinstance(res.get('result'), dict) else {}
            for key in ('couponList', 'list', 'resList', 'dataList'):
                v = result.get(key)
                if isinstance(v, list):
                    _absorb([r for r in v if isinstance(r, dict)])
                    break
    except Exception as e:
        log(f"ℹ️ [{m_phone}] queryCouponList 扫描异常: {e}")

    try:
        res = request_c005(sess, f'{BESTPAY_H5_BASE}/gapi/marketingConsultation/ConsultationQueryService/queryVoucherList', {
            'voucherStatus': 'notUse',
            'pageNo': 1,
            'pageSize': 10,
            'productNo': phone,
            'sessionKey': session_key,
            'agreeId': TELECOM_MEMBER_AGREE_ID,
            'appType': '94',
            'requestSystem': 'telecome-member-h5',
            'requestSecSystem': 'telecome-member-h5',
            'fromChannelId': 'MINIPROG',
            'fromchannelId': 'MINIPROG',
            'encyType': 'C005',
        }, phone, session_key, 'MINIPROG')
        if isinstance(res, dict) and res.get('success'):
            result = res.get('result') if isinstance(res.get('result'), dict) else {}
            for key in ('voucherList', 'list', 'resList', 'dataList'):
                v = result.get(key)
                if isinstance(v, list):
                    _absorb([r for r in v if isinstance(r, dict)])
                    break
    except Exception as e:
        log(f"ℹ️ [{m_phone}] queryVoucherList 扫描异常: {e}")

    return candidates


def run_auto_claim(sess: requests.Session, phone: str, session_key: str) -> str:
    """权益包自动领取总入口；无待领权益时返回空字符串（不污染通知）"""
    m_phone = mask(phone)
    log(f"\n🔍 >>> 正在扫描 [{m_phone}] 账户下的待领取权益 <<<")

    try:
        coupons = query_unreceived_coupons(sess, phone, session_key)
    except Exception as e:
        log(f"⚠️ [{m_phone}] 待领权益扫描异常: {e}")
        return ""

    if not coupons:
        log(f"ℹ️ [{m_phone}] 当前无待领取权益，自动领取环节跳过")
        return ""

    log(f"📋 [{m_phone}] 扫描到 {len(coupons)} 张待领取权益，开始自动领取...")
    return auto_claim_equity_coupons(sess, phone, session_key, coupons)


def query_recent_lottery_history(sess: requests.Session, phone: str, session_key: str, act_no: str, top_n: int = 3) -> str:
    """查询指定活动最近中奖记录，今日已抽完时回显近 3 次日期与奖品"""
    try:
        res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/queryLotteryRecord', {
            'activityNo': act_no,
            'sessionKey': session_key,
            'productNo': phone,
            'phoneNo': phone,
            'pageNo': 1,
            'pageSize': 10,
            'appType': '94',
            'fromChannelId': 'MINIPROG',
            'fromchannelId': 'MINIPROG',
            'encyType': 'C005'
        }, phone, session_key, 'MINIPROG')

        records = safe_get(res, 'result', 'queryLotteryRecordDTOList') or []
        if not records:
            return "今日抽奖次数已用尽 (暂无历史中奖记录)"

        items = []
        for r in records[:top_n]:
            name = (r.get('prizeName') or '奖品').strip()
            t_str = r.get('prizeDistributeTime') or ''
            date_short = t_str[5:10] if len(t_str) >= 10 else ''
            items.append(f"{date_short} {name}" if date_short else name)

        return f"今日已抽完 (近{len(items)}次: {', '.join(items)})"
    except Exception:
        return "今日抽奖次数已用尽"


def receive_lottery_prize(sess: requests.Session, phone: str, session_key: str,
                          act_no: str, order_no: str, act_title: str) -> str:
    """抽奖中奖后自动领奖入账，返回 SUCCESS / PENDING / FAILED / UNKNOWN"""
    log(f"[{act_title}] 正在自动领取入账 (orderNo={order_no})...")
    try:
        res = request_c005(sess, f'{BESTPAY_H5_BASE}/gapi/op-lottery-system/DrawService/receivePrize', {
            'activityNo': act_no,
            'sessionKey': session_key,
            'productNo': phone,
            'orderNo': order_no,
            'sourceChannel': 'APPLET',
            'appType': '94',
            'fromChannelId': 'MINIPROG',
            'fromchannelId': 'MINIPROG',
            'encyType': 'C005'
        }, phone, session_key, 'MINIPROG')

        if not isinstance(res, dict):
            return 'UNKNOWN'

        if res.get('success'):
            result = res.get('result') if isinstance(res.get('result'), dict) else {}
            msg = str(result.get('resoultMsg') or result.get('msg') or res.get('errorMsg') or '')
            if '已领取' in msg or '重复' in msg:
                log(f"ℹ️ [{act_title}] 该奖品已领取过，无需重复操作")
                return 'SUCCESS'
            log(f"✅ [{act_title}] 领奖成功入账 (orderNo={order_no})")
            return 'SUCCESS'

        err = res.get('errorMsg') or res.get('errorCode') or '未返回明确状态'
        log(f"❌ [{act_title}] 领奖未成功: {err}")
        if '超时' in str(err) or 'TIMEOUT' in str(err).upper():
            return 'PENDING'
        return 'FAILED'
    except Exception as e:
        log(f"⚠️ [{act_title}] 领奖异常: {str(e)}")
        return 'UNKNOWN'


def run_wednesday_lottery(sess: requests.Session, act_no: str, act_title: str, session_key: str, phone: str,
                          closed_hint: str = "非周三活动暂未开放 (每周三 09:00 开放)") -> str:
    """周三抽奖标准化执行器 (查询活动 → 查次数 → 循环抽奖 → 自动领奖)"""
    m_phone = mask(phone)
    log(f"\n🎰 >>> 正在执行：{act_title} [活动号: {act_no}] ({m_phone}) <<<")

    act_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/queryDrawActivity', {
        'activityNo': act_no,
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'appType': '94',
        'fromChannelId': 'MINIPROG',
        'fromchannelId': 'MINIPROG',
        'encyType': 'C005'
    }, phone, session_key, 'MINIPROG')

    if not isinstance(act_res, dict) or not act_res.get('success'):
        err_msg = act_res.get('errorMsg', '活动查询失败') if isinstance(act_res, dict) else '响应异常'
        log(f"[{act_title}] 活动校验未通过: {err_msg}")
        now_weekday = datetime.now().weekday()
        if now_weekday != 2:
            return closed_hint
        if '登录' in err_msg or '100003' in err_msg or '100008' in err_msg:
            return "SessionKey已失效，请进小程序刷新"
        cached = get_today_reward(phone, act_no)
        return f"今日已抽完 (今日战果: {cached})" if cached else f"活动反馈: {err_msg}"

    act_name = safe_get(act_res, 'result', 'lotteryActivityConfigDTO', 'activityName') or act_title
    log(f"[{act_title}] 成功确认活动: {act_name}")

    count_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/getLotteryCount', {
        'activityNo': act_no,
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'deviceNo': f'miniprogram_{phone}',
        'appType': '94',
        'fromChannelId': 'MINIPROG',
        'fromchannelId': 'MINIPROG',
        'encyType': 'C005'
    }, phone, session_key, 'MINIPROG')

    count = safe_get(count_res, 'result', 'lotteryCount', default=0)
    log(f"[{act_title}] 剩余可用抽奖次数: {count}")

    if count <= 0:
        return query_recent_lottery_history(sess, phone, session_key, act_no, top_n=3)

    draw_count = 0
    prize_names = []

    while count > 0:
        draw_count += 1
        log(f"[{act_title}] 正在执行第 {draw_count} 次抽奖 (剩余 {count} 次)...")
        draw_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/lotteryAward', {
            'activityNo': act_no,
            'sessionKey': session_key,
            'productNo': phone,
            'phoneNo': phone,
            'deviceNo': f'miniprogram_{phone}',
            'appType': '94',
            'fromChannelId': 'MINIPROG',
            'fromchannelId': 'MINIPROG',
            'encyType': 'C005'
        }, phone, session_key, 'MINIPROG')

        if isinstance(draw_res, dict) and draw_res.get('success') and isinstance(draw_res.get('result'), dict):
            count -= 1
            prize = draw_res['result']
            prize_name = prize.get('prizeName') or '礼品'
            order_no = prize.get('orderNo')
            is_thanks = prize.get('prizeType') == 'THANKS_FOR_PARTICIPATE' or '谢谢' in prize_name
            log(f"🎉 [{act_title}] 抽奖成功: {prize_name}")
            prize_names.append(prize_name)

            if not is_thanks and order_no:
                if CONFIG.get("ENABLE_AUTO_RECEIVE_PRIZE", True):
                    receive_result = receive_lottery_prize(sess, phone, session_key, act_no, order_no, act_title)
                    if receive_result != 'SUCCESS':
                        log(f"⚠️ [{act_title}] 奖品「{prize_name}」领奖状态: {receive_result}")
                else:
                    log(f"[{act_title}] 自动领奖已关闭，跳过 orderNo={order_no}")
        else:
            err = draw_res.get('errorMsg', '抽奖未成功') if isinstance(draw_res, dict) else '响应异常'
            log(f"[{act_title}] 抽奖停止: {err}")
            break
        time.sleep(CONFIG.get("DELAY_SEC", 2))

    res_str = f"完成 {draw_count} 次，获得: [" + ", ".join(prize_names) + "]" if draw_count > 0 else "未产生抽奖"
    set_today_reward(phone, act_no, res_str)
    return res_str


def run_lucky_lottery(sess: requests.Session, act_id: str, act_title: str, session_key: str, phone: str) -> str:
    """
    权益商城幸运抽奖执行器。

    权益商城抽奖接口只在小程序 mgs 通道开放，H5 实测 API500002。
    H5 可达的是 queryActivityInfo（拿真实抽奖活动号）+ op-lottery-system 抽奖引擎。
    """
    m_phone = mask(phone)
    log(f"\n🎁 >>> 正在执行：{act_title} [活动ID: {act_id}] ({m_phone}) <<<")

    act_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/Activity/queryActivityInfo', {
        'activityId': act_id,
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        'encyType': 'C005'
    }, phone, session_key, '5g_mini_program')

    module: Dict[str, Any] = {}
    if isinstance(act_res, dict) and act_res.get('success'):
        module = safe_get(act_res, 'result', 't', 'activityLotteryModules', default=None) or []
        module = module[0] if isinstance(module, list) and module else {}

    if not module:
        detail = safe_get(act_res, 'result', 'errMsg') or safe_get(act_res, 'errorMsg') or '活动配置不可用'
        log(f"[{act_title}] 活动配置查询未通过: {detail}")
        cached = get_today_reward(phone, act_id)
        return f"活动配置反馈: {detail}" + (f" (今日战果: {cached})" if cached else "")

    lottery_act_no = module.get('lotteryActivityNo') or 'hd70226376'
    task_codes = module.get('taskList') or []
    task_status = module.get('taskLotteryStatus') or ''
    free_status = module.get('freeLotteryStatus') or ''
    log(f"[{act_title}] 活动号: {lottery_act_no}，任务抽奖状态: {task_status or '未知'}，"
        f"免费抽奖: {free_status or '未知'}，任务清单: {','.join(task_codes) or '无'}")

    TASK_LABELS = {
        'sharedToWeChat': '分享给微信好友',
        'orderMallMember': '订购权益商城会员',
        'inviteFriends': '邀请好友助力',
        'pointsExchange': '积分兑换抽奖机会',
        'viewActivity': '浏览活动页',
    }
    PENDING_TASKS = [c for c in task_codes if c not in ('orderMallMember',)]
    task_desc = "、".join(TASK_LABELS.get(c, c) for c in PENDING_TASKS)

    draw_res = run_wednesday_lottery(sess, lottery_act_no, f"{act_title}·抽奖引擎", session_key, phone,
                                     closed_hint="权益商城抽奖活动未开放或已结束")

    no_lottery = ('未产生抽奖' in draw_res or '今日已抽完' in draw_res or '暂无历史中奖记录' in draw_res
                  or '需 SessionKey' in draw_res)
    if task_desc and no_lottery:
        res_str = f"{draw_res}；待办任务(需在翼支付小程序内完成，脚本无法代办): {task_desc}；完成后本脚本会自动把机会抽完并回显奖品"
    elif task_desc:
        res_str = f"{draw_res}；其余任务(需小程序内完成): {task_desc}"
    else:
        res_str = draw_res

    set_today_reward(phone, act_id, res_str)
    return res_str


def query_equity_coin_balance(sess: requests.Session, phone: str, session_key: str) -> Optional[str]:
    """
    查询账户真实权益币余额。

    返回：具体余额文案（如 "20 权益币"）；接口失效/无数据时返回 None，
    由调用方静默跳过，不再向通知输出「查询异常 (接口服务不存在)」这类无意义报错。
    """
    # 接口失效特征：H5 网关返回 API500002「接口服务不存在」或 404/空响应
    DEAD_MARKERS = ('接口服务不存在', 'API500002', '不存在', 'not exist', '404')

    try:
        res = request_c005(sess, f'{BESTPAY_H5_BASE}/gapi/op-product-system/myCashPageService/myCashPage', {
            'encyType': 'C005',
            'appType': '94',
            'fromchannelId': 'MINIPROG',
            'fromChannelId': 'MINIPROG',
            'traceLogId': f'trace_{int(time.time() * 1000)}',
            'productNo': phone,
            'sessionKey': session_key
        }, phone, session_key, 'MINIPROG')
    except Exception as e:
        log(f"ℹ️ [{mask(phone)}] 权益币查询异常(已静默): {str(e)[:80]}")
        return None

    if not isinstance(res, dict):
        return None

    if not res.get('success'):
        err = str(res.get('errorMsg') or res.get('errorCode') or '')
        if any(m in err for m in DEAD_MARKERS):
            log(f"ℹ️ [{mask(phone)}] 权益币接口已失效({err})，静默降级不再输出")
            return None
        log(f"ℹ️ [{mask(phone)}] 权益币查询未成功(已静默): {err[:80]}")
        return None

    result = res.get('result') if isinstance(res.get('result'), dict) else {}
    for k in ('availableShowValue', 'totalAvailableValue', 'availableAmount',
              'availableQuota', 'availableValue', 'balance', 'coinBalance',
              'equityCoin', 'totalCoin', 'availableCoin', 'userCoin', 'coin'):
        v = result.get(k)
        if v is not None and str(v).strip() != '':
            return f"{v} 权益币"

    log(f"ℹ️ [{mask(phone)}] 权益币字段未命中，原始响应: {json.dumps(res, ensure_ascii=False)[:300]}")
    return None


# ==================== 🤖 业务C：AI奇遇赢Pad (爱音乐加密通道) ====================
class ImCrypto:
    """爱音乐动态 AES-128-CBC 加密器 (时间戳 + 随机盐派生密钥)"""

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
        "Referer": ACTIVITY_H5_URL,
        "imencrypt": "1",
        "imtimestamp": crypto_inst.ts,
        "imrandomnum": crypto_inst.rdm,
        "imencryptkey": crypto_inst.key_h,
        "Accept-Language": "zh-CN,zh;q=0.9"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def post_encrypted_api(sess: requests.Session, crypto_inst: ImCrypto, token: str,
                       api_path: str, payload: Any) -> Tuple[requests.Response, str]:
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
    """电信 Ticket → 爱音乐 JWT 换票 (必须同时注入 user118100cn Cookie)"""
    try:
        res = sess.post(
            "https://ai.imusic.cn/vapi/vue_login/sso_login_v2",
            json={"portal": "45", "channelId": CHANNEL_ID, "ticket": ticket, "user118100cn": "user118100cn"},
            headers={"Content-Type": "application/json", "Referer": ACTIVITY_H5_URL},
            timeout=15
        ).json()
        tok = res.get("token")
        if tok:
            sess.cookies.set('loginState', 'true', domain='ai.imusic.cn')
            sess.cookies.set('cc', CHANNEL_ID, domain='ai.imusic.cn')
            sess.cookies.set('imusic', f'118100{int(time.time() * 1000)}', domain='ai.imusic.cn')
        return tok
    except Exception:
        return None


def warmup_session(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str) -> str:
    """会话预热：拉取用户信息与用户状态，顺带续期 token"""
    h = get_imusic_headers(crypto_inst, token)
    try:
        r1 = sess.post(
            f"https://ai.imusic.cn/vapi/new_member/get_user_info?channelId={CHANNEL_ID}&portal=45&mobile={mobile}",
            headers=h, data="", timeout=10)
        auth1 = r1.headers.get("authorization") or r1.headers.get("Authorization")
        if auth1:
            token = auth1.replace

        r2 = sess.post(
            f"https://ai.imusic.cn/vapi/vrbt/check_user_state?mobile={mobile}&is4G=1&is5G=1&isDX=1&channelId={CHANNEL_ID}&portal=45",
            headers=get_imusic_headers(crypto_inst, token), data="", timeout=10)
        auth2 = r2.headers.get("authorization") or r2.headers.get("Authorization")
        if auth2:
            token = auth2.replace("Bearer ", "").strip()
    except Exception:
        pass
    time.sleep(0.3)
    return token


def query_make_pkg_info(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str) -> Tuple[Optional[dict], str]:
    try:
        r, token = post_encrypted_api(sess, crypto_inst, token, "/hapi/en/api", {
            "channelId": CHANNEL_ID,
            "portal": "45",
            "mobile": mobile,
            "aid": ACTIVITY_ID,
            "apiName": "ismp/IsmpApi/queryAiMakePkgInfo"
        })
        dec = crypto_inst.decrypt(r.text)
        if dec.startswith('{'):
            d = json.loads(dec)
            if d.get("code") == "0000":
                return d.get("data", {}), token
    except Exception:
        pass
    return None, token


def query_server_score(sess: requests.Session, crypto_inst: ImCrypto, token: str, mobile: str) -> Tuple[str, int, str]:
    total_score = "0"
    remaining_score = 0
    try:
        r_score, token = post_encrypted_api(sess, crypto_inst, token, "/hapi/en/api", {
            "activityId": ACTIVITY_ID,
            "mobile": mobile,
            "apiName": "act/LaborApi/getOperationTotalScoreOrRemainingScore",
            "channelId": CHANNEL_ID,
            "portal": "45"
        })
        dec_score = crypto_inst.decrypt(r_score.text)
        if dec_score.startswith('{'):
            s_data = json.loads(dec_score).get("data") or {}
            total_score = str(s_data.get("totalScore", "0"))
            remaining_score = int(s_data.get("remainingScore", 0) or 0)
    except Exception:
        pass
    return total_score, remaining_score, token


def post_make_request(sess: requests.Session, crypto_inst: ImCrypto, token: str,
                      mobile: str, tpl_meta: dict, rand_name: str) -> Tuple[str, str]:
    """
    AI 视频制作。主通道 /hapi/diy_video/au/template_make_add，
    失败时降级到免鉴权通道 /hapi/en/api (diy/DiyVideoApi/unTemplateMake)。
    """
    t_id = tpl_meta.get("templateId") or TEMPLATE_ID
    arr_id = tpl_meta.get("arrangeId") or DEFAULT_ARRANGE_ID
    words = tpl_meta.get("userWords", "")
    bg = tpl_meta.get("background", "")

    primary_payload = {
        "mobile": mobile, "makeId": "", "userPhotos": "", "userWords": words,
        "background": bg, "videoName": rand_name, "templateId": t_id,
        "templateName": rand_name, "aid": ACTIVITY_ID, "arrangeId": arr_id,
        "aiGatewayImagMakeId": "", "lastTaskId": "", "autoAddUgc": 0,
        "imuOtherParam": 1, "channelId": CHANNEL_ID, "portal": "45"
    }

    crypto_inst.refresh()
    enc_data = crypto_inst.encrypt(primary_payload)
    url = f"https://ai.imusic.cn/hapi/diy_video/au/template_make_add?formData={urllib.parse.quote(enc_data)}"
    try:
        res = sess.post(url, headers=get_imusic_headers(crypto_inst, token), data="", timeout=15)
        new_auth = res.headers.get("authorization") or res.headers.get("Authorization")
        if new_auth:
            new_tok = new_auth.replace("Bearer ", "").strip()
            if new_tok:
                token = new_tok
        dec_resp = crypto_inst.decrypt(res.text)
    except Exception as e:
        dec_resp = f'{{"code":"9999","desc":"网络异常: {str(e)}"}}'

    if '"code":"0000"' in dec_resp or any(k in dec_resp for k in ["10014", "次数已用完", "免费次数已用完", "机会已用", "火爆", "不足"]):
        return dec_resp, token

    # 备用免鉴权通道
    time.sleep(0.5)
    fallback_payload = {
        "apiName": "diy/DiyVideoApi/unTemplateMake",
        "mobile": mobile, "makeId": "", "userPhotos": "", "userWords": words,
        "background": bg, "videoName": rand_name, "templateId": t_id,
        "templateName": rand_name, "aid": ACTIVITY_ID, "arrangeId": arr_id,
        "aiGatewayImagMakeId": "", "lastTaskId": "", "autoAddUgc": 0,
        "imuOtherParam": 1, "channelId": CHANNEL_ID, "portal": "45"
    }
    try:
        r_fb, token = post_encrypted_api(sess, crypto_inst, token, "/hapi/en/api", fallback_payload)
        dec_fb = crypto_inst.decrypt(r_fb.text)
        if '"code":"0000"' in dec_fb or any(k in dec_fb for k in ["10014", "次数已用完", "免费次数已用完", "机会已用", "火爆", "不足"]):
            return dec_fb, token
    except Exception:
        pass

    return dec_resp, token


def query_template_meta(sess: requests.Session, token: str, stage_id: str = DEFAULT_STAGE_ID) -> dict:
    """动态读取当前期数模板 (严禁写死期数，跨期自动适配)"""
    try:
        res = sess.post(
            f"https://ai.imusic.cn/vapi/vue_activity/get_operate_info?aid={ACTIVITY_ID}&channelId={CHANNEL_ID}&portal=45",
            headers={"Content-Type": "application/json", "Referer": ACTIVITY_H5_URL},
            timeout=15
        ).json()
        stages = (res.get("data") or {}).get("stageList") or []
        for st in stages:
            if st.get("stageId") == stage_id:
                return st
    except Exception:
        pass
    return {}


def run_ai_pad_tasks(sess: requests.Session, user: dict) -> List[str]:
    """
    AI奇遇赢Pad 总入口：SSO 换票 → 会话预热 → 查询制作券与点数 → 循环制作 → 满千兑换话费。
    返回微信读书 Bullet 排版的结果行。
    """
    m_phone = mask(user['phoneNbr'])
    bullets = []

    crypto = ImCrypto()
    token = refresh_sso_token(sess, user.get('ticket', ''))
    if not token:
        log(f"[AI奇遇] {m_phone} 爱音乐 SSO 换票失败，跳过该业务")
        return ["• AI奇遇赢Pad: 爱音乐鉴权未通过"]

    token = warmup_session(sess, crypto, token, user['phoneNbr'])
    pkg, token = query_make_pkg_info(sess, crypto, token, user['phoneNbr'])
    total_score, remaining, token = query_server_score(sess, crypto, token, user['phoneNbr'])

    left_num = 0
    if isinstance(pkg, dict):
        try:
            left_num = int(pkg.get("privilegeVrbtAIVideoLeftNum") or 0)
        except Exception:
            left_num = 0

    log(f"[AI奇遇] {m_phone} 可用制作券: {left_num} 张，当前点数: {total_score}")

    if left_num <= 0:
        bullets.append(f"• AI奇遇赢Pad: 暂无可用制作券 (当前点数 {total_score})")
        return bullets

    tpl = query_template_meta(sess, token)
    made = 0
    for i in range(left_num):
        rand_name = f"AI视频{rd_str(6)}"
        resp, token = post_make_request(sess, crypto, token, user['phoneNbr'], tpl, rand_name)
        if '"code":"0000"' in resp:
            made += 1
            log(f"[AI奇遇] {m_phone} 第 {made} 次制作成功")
        else:
            log(f"[AI奇遇] {m_phone} 制作未成功: {resp[:120]}")
            break
        time.sleep(1)

    _, new_total, token = query_server_score(sess, crypto, token, user['phoneNbr'])
    if made > 0:
        bullets.append(f"• AI奇遇赢Pad: 完成 {made} 次制作 (当前点数 {new_total})")
    else:
        bullets.append(f"• AI奇遇赢Pad: 制作未成功 (当前点数 {new_total})")

    # 满千兑换话费
    try:
        cur = int(new_total)
    except Exception:
        cur = 0
    if cur >= REDEEM_COST_SCORE:
        log(f"[AI奇遇] {m_phone} 点数达 {cur}，执行话费兑换")
        try:
            r_ex, token = post_encrypted_api(sess, crypto, token, "/hapi/en/api", {
                "activityId": ACTIVITY_ID,
                "mobile": user['phoneNbr'],
                "apiName": "act/LaborApi/exchangeScore",
                "channelId": CHANNEL_ID,
                "portal": "45"
            })
            dec_ex = crypto.decrypt(r_ex.text)
            if '"code":"0000"' in dec_ex:
                bullets.append(f"• 话费兑换: 成功兑换 10 元话费 (消耗 {REDEEM_COST_SCORE} 点)")
            else:
                bullets.append(f"• 话费兑换: 兑换未成功 ({dec_ex[:80]})")
        except Exception as e:
            bullets.append(f"• 话费兑换: 兑换异常 ({str(e)[:60]})")

    return bullets


# ==================== 📇 账号解析 ====================
def parse_accounts() -> List[Tuple[str, str, str, str]]:
    """
    解析环境变量 dxlin。
    格式：手机号#服务密码#AndroidID[#SessionKey]
    多账号换行或 & 分隔。第 4 段 SessionKey 可选。
    """
    raw = os.environ.get('dxlin') or \
          os.environ.get('CHINA_TELECOM_AUTH') or \
          os.environ.get('dxqy') or \
          os.environ.get('TELECOM_WED_AUTH') or ''
    accounts = []
    if not raw.strip():
        return accounts

    items = re.split(r'[&\r\n]+', raw.replace('\\n', '&').replace('\\r', ''))
    for item in items:
        item = item.strip()
        if not item or "你的手机号" in item:
            continue
        parts = [p.strip() for p in item.replace('@', '#').split('#') if p.strip()]
        if len(parts) >= 2:
            phone = parts[0]
            pwd = parts[1]
            aid = parts[2] if len(parts) > 2 else ""
            sk = parts[3] if len(parts) > 3 else ""
            accounts.append((phone, pwd, aid, sk))
    return accounts


# ==================== 📊 微信读书风格汇总通知 ====================
def do_notify(account_blocks: List[str], account_count: int, first_mask: str):
    """微信读书单行 Bullet 极简排版推送"""
    if not account_blocks:
        log("无账号运行结果，跳过推送")
        return

    subtitle = f"执行完成 ({account_count}个账号)" if account_count > 1 else f"执行完成 (1个账号) - 【{first_mask}】"
    notify_body = "\n\n".join(account_blocks)

    print("\n" + "=" * 65)
    print("                       📊 任务执行结果总报                       ")
    print("=" * 65)
    print(f"📣 [{SCRIPT_VERSION}]【中国电信 · 每日任务聚合】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    if HAS_NOTIFY and ql_send and notify_body:
        try:
            ql_send(f"[{SCRIPT_VERSION}] 中国电信 · 每日任务聚合", f"{subtitle}\n\n{notify_body}")
            log("🔔 青龙通知推送成功！")
        except Exception as e:
            log(f"⚠️ 推送通知异常: {str(e)}")


# ==================== 🚀 主程序 ====================
def main():
    print("=" * 65)
    print(f"  🎉 [{SCRIPT_VERSION}] 中国电信 · 每日任务聚合脚本 🎉  ")
    print("=" * 65)

    now = datetime.now()
    is_wednesday = now.weekday() == 2  # 0=周一, 2=周三
    force_run = CONFIG.get("FORCE_RUN", False) or os.environ.get("FORCE_RUN", "").lower() in ["true", "1"]
    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    today_name = weekday_names[now.weekday()]

    # 是否执行周三专属抽奖：仅周三，或 FORCE_RUN 调试模式
    run_wed = is_wednesday or force_run

    print(f"  📅 今天是 {today_name} | 周三专属抽奖: {'启用' if run_wed else '跳过(非周三)'}")
    print(f"  📝 签到金豆: {'启用' if CONFIG.get('ENABLE_DAILY_SIGN', True) else '禁用'}"
          f" | 幸运抽奖: {'启用' if CONFIG.get('ENABLE_LUCKY_DRAW', True) else '禁用'}"
          f" | AI奇遇: {'启用' if CONFIG.get('ENABLE_AI_PAD', True) else '禁用'}")
    if force_run:
        print("  ⚠️ FORCE_RUN 调试模式已开启，忽略星期限制")
    print("=" * 65)

    accounts = parse_accounts()
    if not accounts:
        log("❌ 未检测到有效的账号配置！")
        log("👉 请在青龙面板添加环境变量 dxlin")
        log("👉 格式: 手机号#服务密码#AndroidID (第4段可选填 SessionKey)，多账号换行粘贴")
        return

    log(f"👤 检测到 {len(accounts)} 个有效电信账号，开始执行任务...")

    summary_blocks = []

    for idx, (phone, pwd, android_id, direct_sk) in enumerate(accounts, start=1):
        m_phone = mask(phone)
        log(f"\n{'=' * 10} 正在处理账号 [{idx}/{len(accounts)}] {m_phone} {'=' * 10}")
        sess = create_session()
        bullets: List[str] = []

        # ---- 单次登录，全业务共享 ----
        user = login_telecom(sess, phone, pwd, android_id)
        if not user:
            bullets = [
                "• 账号认证: 登录未通过 (服务密码有误或触发安全验证)",
                "• 任务状态: 全系业务已跳过"
            ]
            summary_blocks.append(
                f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets) if len(accounts) > 1 else "\n".join(bullets))
            time.sleep(CONFIG.get("DELAY_SEC", 2))
            continue

        # ---- 业务A：每日签到与金豆 ----
        if CONFIG.get("ENABLE_DAILY_SIGN", True):
            try:
                bullets.extend(sign_tasks(sess, user))
            except Exception as e:
                log(f"⚠️ [{m_phone}] 签到业务异常: {str(e)}")
                bullets.append(f"• 每日签到与金豆: 执行异常 ({str(e)[:40]})")

        # ---- 翼支付 SessionKey 获取（三级降级链）----
        session_key = direct_sk
        ticket_source = "环境变量" if session_key else ""

        if session_key and not is_session_key_alive(sess, phone, session_key):
            log(f"⚠️ [{m_phone}] 环境变量 SessionKey 已失效，转入后续降级")
            session_key = ""

        if not session_key:
            cached_sk = get_cached_session_key(phone)
            if cached_sk and is_session_key_alive(sess, phone, cached_sk):
                session_key = cached_sk
                ticket_source = "本地缓存"
                log(f"♻️ [{m_phone}] 命中本地 SessionKey 缓存且验活通过")

        if not session_key and CONFIG.get("ENABLE_AUTO_TICKET", True):
            exchanged = exchange_ticket_for_session_key(sess, phone, user.get('ticket', ''))
            if exchanged:
                session_key = exchanged
                ticket_source = "自动换票"

        # ---- 业务B：翼支付抽奖与权益 ----
        has_bestpay = CONFIG.get("ENABLE_LUCKY_DRAW", True) or CONFIG.get("ENABLE_AUTO_CLAIM", True) \
                      or (run_wed and CONFIG.get("ENABLE_WEDNESDAY", True))

        if not session_key:
            if has_bestpay:
                log(f"⚠️ [{m_phone}] 未能获取有效 SessionKey，翼支付业务已跳过")
                bullets.append("• 翼支付业务: 未获取到有效 SessionKey，已跳过")
        else:
            if ticket_source:
                bullets.append(f"• 凭证来源: {ticket_source}")

            # 周三专属抽奖（★ 非周三不执行、不展示）
            if run_wed and CONFIG.get("ENABLE_WEDNESDAY", True):
                try:
                    r1 = run_wednesday_lottery(sess, CONFIG.get("ACT_COIN", "hd76690472"),
                                               "周三会员抽权益币", session_key, phone)
                    bullets.append(f"• 周三会员抽权益币: {r1}")
                except Exception as e:
                    bullets.append(f"• 周三会员抽权益币: 执行异常 ({str(e)[:40]})")

                try:
                    r2 = run_wednesday_lottery(sess, CONFIG.get("ACT_THRICE", "hd92859166"),
                                               "周三会员抽三次", session_key, phone)
                    bullets.append(f"• 周三会员抽三次: {r2}")
                except Exception as e:
                    bullets.append(f"• 周三会员抽三次: 执行异常 ({str(e)[:40]})")

            # 权益商城幸运抽奖（每天执行）
            if CONFIG.get("ENABLE_LUCKY_DRAW", True):
                try:
                    r3 = run_lucky_lottery(sess, CONFIG.get("ACT_LUCKY", "A2025011413413484352835699495179"),
                                           "权益商城幸运抽奖", session_key, phone)
                    bullets.append(f"• 权益商城幸运抽奖: {r3}")
                except Exception as e:
                    bullets.append(f"• 权益商城幸运抽奖: 执行异常 ({str(e)[:40]})")

            # 权益包自动领取（每天执行）
            if CONFIG.get("ENABLE_AUTO_CLAIM", True):
                try:
                    r4 = run_auto_claim(sess, phone, session_key)
                    if r4:
                        bullets.append(f"• 权益包自动领取: {r4}")
                except Exception as e:
                    bullets.append(f"• 权益包自动领取: 执行异常 ({str(e)[:40]})")

            # 权益币余额回显（接口失效时返回 None，静默跳过，不输出无意义异常）
            try:
                coin_str = query_equity_coin_balance(sess, phone, session_key)
                if coin_str:
                    bullets.append(f"• 账户当前权益币: {coin_str}")
            except Exception as e:
                log(f"ℹ️ [{m_phone}] 权益币查询异常(已静默): {str(e)[:60]}")

            # 心跳保活（★ 非周三静默执行，不写入 bullets）
            if not is_wednesday and CONFIG.get("ENABLE_KEEP_ALIVE", True):
                try:
                    send_session_keep_alive(sess, phone, session_key)
                except Exception:
                    pass

        # ---- 业务C：AI奇遇赢Pad ----
        if CONFIG.get("ENABLE_AI_PAD", True):
            try:
                bullets.extend(run_ai_pad_tasks(sess, user))
            except Exception as e:
                log(f"⚠️ [{m_phone}] AI奇遇业务异常: {str(e)}")
                bullets.append(f"• AI奇遇赢Pad: 执行异常 ({str(e)[:40]})")

        summary_blocks.append(
            f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets) if len(accounts) > 1 else "\n".join(bullets))
        time.sleep(CONFIG.get("DELAY_SEC", 2))

    first_mask = mask(accounts[0][0]) if accounts else "主账号"
    do_notify(summary_blocks, len(accounts), first_mask)


if __name__ == '__main__':
    main()

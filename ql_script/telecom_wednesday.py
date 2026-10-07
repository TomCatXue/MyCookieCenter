#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v1.6.0 (2026-10-07 自动换票 / 权益包自动领取 / 抽奖自动领奖版)
中国电信 · 周三会员双抽奖与幸运抽奖聚合脚本
===================================================================
new Env('中国电信 · 周三会员抽奖');
cron: 0 9 * * 3
tag: 中国电信
# @tag 中国电信
===================================================================
功能说明：
  1. 任务一：周三会员抽权益币 (专属抽权益币) —— 山西甄选周三会员日 (hd76690472)
  2. 任务二：周三会员抽三次 (专属抽3次) —— 山西抽奖新-每周三次 (hd92859166)
  3. 任务三：权益商城幸运抽奖 (大转盘抽奖) —— 读取真实活动配置(抽奖活动号/任务清单) + 走可达抽奖引擎真实抽奖并回显奖品
     (A2025011413413484352835699495179，可用环境变量 TELECOM_WED_LUCKY_ACT 覆盖)
     ⚠️ 说明：权益商城抽奖接口 IRedBagLotteryService.* 仅在翼支付小程序 mgs 通道开放，
        H5 网关 mapi-h5 无此服务(API500002)，故任务三改走 H5 可达的活动配置 + op-lottery-system 抽奖引擎。
  4. 资产回显：自动查询并回显当前账户真实权益币余额

  ★ v1.6.0 新增三大能力（基于 2026-10-07 全链路抓包逆向验证）：
  5. 【自动换票】SessionKey 全自动获取与续期：
     - 未配置 SessionKey 时，自动走 电信登录 → Ticket → singleAuthorizedLogin 换取 SessionKey；
     - 换票接口 /gapi/quanyi/product/singleAuthorizedLogin 标注 authLogin:false，无需既有会话即可调用；
     - 换取成功后自动落盘持久化(telecom_wed_session.json)，下次运行直接复用，实现免人工抓包。
  6. 【权益包自动领取】基于 manualReceiveEquity (H5 C005 通道，isNeedEncrypt:false)：
     - 自动扫描 couponStatus == "unreceived" 的待领权益并逐张真实领取；
     - 通过 rebateDetailNo 二次轮询 receiveStatus 确认到账(INIT/PENDING→SUCCESS)；
     - 遇「库存不足/已领完/活动结束」立即停止，遇网络超时记为待确认，绝不盲目重试。
  7. 【抽奖自动领奖】抽奖后自动调用 receivePrize 完成领奖入账，无需再进小程序手动点领取。

环境变量配置：
  TELECOM_WED_AUTH : 专属环境变量 (支持简写 dx_wed)
                     格式为 '手机号#服务密码#AndroidID#SessionKey' 或 '手机号#服务密码#AndroidID'
                     多账号换行粘贴，彻底独立于 0716 脚本的 dxlin 与 0点权益的 dxqy
                     ★ 第四段 SessionKey 现在可省略：脚本会自动换取并落盘复用

依赖环境：
  pip install pycryptodome requests certifi urllib3
===================================================================
"""

import os
import sys
import re
import hashlib
import json
import time
import random
import string
import base64
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

# -------------------------- 青龙通知模块 --------------------------
try:
    from notify import send as ql_send
    HAS_NOTIFY = True
except ImportError:
    HAS_NOTIFY = False
    ql_send = None

# ==================== 🛠️ 脚本功能开关配置 ====================

SCRIPT_VERSION = "v1.6.0"

CONFIG = {
    "ENABLE_WED_COIN_DRAW": True,   # 任务 1: 周三会员抽权益币 (专场抽权益币, 默认 hd76690472)
    "ENABLE_WED_THRICE_DRAW": True, # 任务 2: 周三会员抽三次 (专属抽3次专场, 默认 hd92859166)
    "ENABLE_LUCKY_MALL_DRAW": True, # 任务 3: 权益商城幸运抽奖 (自动做任务+大转盘抽奖)
    "ENABLE_AUTO_TICKET": True,     # 任务 4: 自动换票 (电信登录→Ticket→SessionKey，无需人工抓包)
    "ENABLE_AUTO_CLAIM": True,      # 任务 5: 权益包自动领取 (manualReceiveEquity 真实领券入账)
    "ENABLE_AUTO_RECEIVE_PRIZE": True, # 任务 6: 抽奖后自动领奖 (receivePrize 自动入账)
    "FORCE_RUN": True,             # 调试模式: False=仅周三自动执行，True=非周三平时强制运行所有任务测试
    "DELAY_SEC": 2,                 # 各接口请求间隔(秒)，避免触发电信风控频控
    "ACT_COIN": "hd76690472",       # 周三抽权益币活动代号
    "ACT_THRICE": "hd92859166",     # 周三抽3次活动代号
    "ACT_LUCKY": "A2025011413413484352835699495179", # 权益商城大转盘活动ID (可用环境变量 TELECOM_WED_LUCKY_ACT 覆盖)
    "UA": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.38(0x1800262c) NetType/WIFI Language/zh_CN"
}

# ==================== 🌐 翼支付网关生产环境常量 ====================
# 2026-10-07 抓包逆向确认：生产环境 window.mapiUrl = https://mapi-h5.bestpay.com.cn
# （来源 bestpay-html5-3.0.js 的 env map："prod"===n → e.mapiUrl="https://mapi-h5.bestpay.com.cn"）
BESTPAY_H5_BASE = "https://mapi-h5.bestpay.com.cn"

# 权益商城(equity-goods-h5)生产 agreeId，来源 bundle 常量：
#   H={development:"20211210030100208705256496824388",pre:"...",prod:"20211223030100213484984697094168"}
EQUITY_MALL_AGREE_ID = "20211223030100213484984697094168"

# 电信会员专区(telecom-member-h5)生产 agreeId，实测抓包(idx 274/275 queryVoucherList/queryCouponList)所用值
TELECOM_MEMBER_AGREE_ID = "20200827030100038416476813657090"

# ==================== 💾 战果本地缓存管理 ====================
REWARDS_CACHE_FILE = Path(__file__).parent / 'telecom_rewards_cache.json'
SESSION_CACHE_FILE = Path(__file__).parent / 'telecom_wed_session.json'

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
    except Exception as e:
        log(f"⚠️ 保存战果缓存失败: {e}")

def get_today_reward(phone: str, task_name: str) -> Optional[str]:
    today = datetime.now().strftime('%Y-%m-%d')
    cache = load_rewards_cache()
    key = f"{phone}_{today}_{task_name}"
    return cache.get(key)

def set_today_reward(phone: str, task_name: str, result_text: str):
    today = datetime.now().strftime('%Y-%m-%d')
    cache = load_rewards_cache()
    key = f"{phone}_{today}_{task_name}"
    cache[key] = result_text
    save_rewards_cache(cache)

# ==================== 💾 SessionKey 本地持久化 (自动换票自愈闭环) ====================
def load_session_store() -> dict:
    """读取本地 SessionKey 落盘缓存，实现换票后免人工抓包的长期复用"""
    try:
        if SESSION_CACHE_FILE.exists():
            data = json.loads(SESSION_CACHE_FILE.read_text(encoding='utf-8'))
            return data if isinstance(data, dict) else {}
    except Exception:
        pass
    return {}

def save_session_store(phone: str, session_key: str, extra: Optional[dict] = None):
    """换票成功后落盘回写，使下一次定时调度运行无缝继承最新票据"""
    try:
        store = load_session_store()
        store[phone] = {
            'sessionKey': session_key,
            'updateTime': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            **(extra or {})
        }
        SESSION_CACHE_FILE.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding='utf-8')
        log(f"💾 [{mask(phone)}] SessionKey 已落盘持久化，下次运行自动复用")
    except Exception as e:
        log(f"⚠️ 保存 SessionKey 缓存失败: {e}")

def get_cached_session_key(phone: str) -> str:
    """从落盘缓存中取出该账号最新可用的 SessionKey"""
    rec = load_session_store().get(phone) or {}
    return str(rec.get('sessionKey') or '').strip()

# ==================== 🔐 电信官方登录加密常量 ====================
KEYS = {
    'login_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----""",
    'des3': b"1234567\x6090koiuyhgtfrdews"
}

# ==================== 🛠️ 辅助与脱敏工具 ====================
def log(msg: str):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}")

def mask(phone: str) -> str:
    if not phone or len(phone) < 7:
        return phone
    return f"{phone[:3]}****{phone[-4:]}"

def ts() -> str:
    return datetime.now().strftime('%Y%m%d%H%M%S')

def rd_str(length: int = 16) -> str:
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def safe_get(d: Any, *keys, default=None) -> Any:
    curr = d
    for k in keys:
        if not isinstance(curr, dict):
            return default
        curr = curr.get(k)
        if curr is None:
            return default
    return curr

def encode_phone(s: str) -> str:
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
    sess.verify = False
    sess.headers.update({
        'User-Agent': CONFIG["UA"],
        'Accept': 'application/json, text/plain, */*'
    })
    sess.mount('https://', CustomSSLAdapter())
    return sess

requests.packages.urllib3.disable_warnings()

# ==================== 🔑 电信官方网关加解密 ====================
def encrypt_des3(data: str, mode: str = 'enc') -> str:
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

def api_req(sess: requests.Session, url: str, method: str = 'POST', raw: bool = False, **kwargs) -> Union[Dict[str, Any], str]:
    try:
        r = sess.request(method, url, timeout=15, **kwargs)
        if raw:
            return r.text
        return r.json()
    except Exception as e:
        log(f"[网络请求异常] {url}: {str(e)}")
        return '' if raw else {}

# ==================== 🔐 翼支付 C005 混合加密套件 (100% 对齐 telecom_draw.js) ====================
def aes_128_cbc_encrypt(plaintext: str, key_str: str) -> str:
    key_bytes = key_str.encode('utf-8')
    iv_bytes = 16 * b'\0'
    cipher = AES.new(key_bytes, AES.MODE_CBC, iv_bytes)
    padded = pad(plaintext.encode('utf-8'), 16)
    return base64.b64encode(cipher.encrypt(padded)).decode('utf-8')

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
    res = api_req(sess, 'https://mapi-h5.bestpay.com.cn/gapi/mapi-gateway/applyLoginFactor', json=req_body, headers=headers)
    return safe_get(res, 'result', 'nonce')

def request_c005(sess: requests.Session, url: str, biz_params: dict, phone: str, session_key: str, channel_id: str = '5g_mini_program', payload_pno: str = "") -> dict:
    nonce_pno = payload_pno or phone or "80544"
    nonce = get_bestpay_nonce(sess, nonce_pno, channel_id)
    if not nonce:
        return {'success': False, 'errorMsg': '获取 C005 加密公钥失败'}

    biz_str = json.dumps(biz_params, separators=(',', ':'))
    aes_key = rd_str(16)

    enc_data = aes_128_cbc_encrypt(biz_str, aes_key)
    enc_key = encrypt_rsa(aes_key, f"-----BEGIN PUBLIC KEY-----\n{nonce}\n-----END PUBLIC KEY-----", 'b64')
    sign = hashlib.md5(biz_str.encode('utf-8')).hexdigest().upper()

    payload = {
        'data': enc_data,
        'key': enc_key,
        'sign': sign,
        'productNo': payload_pno or phone,
        'encyType': 'C005',
        'fromChannelId': channel_id,
        'fromchannelId': channel_id
    }

    # 关键核验：Cookie 里的 productNo 必须是真实的 11 位手机号，sessionKey 方可完成手机号鉴权绑定
    # 免登录换票场景(singleAuthorizedLogin)不携带 sessionKey，此时仅下发 productNo 避免空值污染
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

# ==================== 🚪 电信官方登录与 Ticket 换发 ====================
def login_telecom(sess: requests.Session, phone: str, password: str, android_id: str = "") -> Optional[Dict[str, Any]]:
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
                    "userLoginName": encode_phone(phone)
                },
                "content": {
                    "attach": "test",
                    "fieldData": {
                        "loginType": "4", "accountType": "",
                        "loginAuthCipherAsymmertric": login_cipher,
                        "deviceUid": "", "phoneNum": encode_phone(phone),
                        "isChinatelecom": "", "systemVersion": "8.0.0",
                        "androidId": encode_phone(aid), "loginAuthCipher": "",
                        "authentication": encode_phone(pwd_clean)
                    }
                }
            }
        else:
            device_hash = hashlib.md5(("iPhone14_" + phone).encode('utf-8')).hexdigest()
            uuid_parts = [device_hash[:8], device_hash[8:12], "4" + device_hash[13:16], device_hash[16:20], device_hash[20:32]]
            cipher_str = f"iPhone 14 15.4.{uuid_parts[0]}{uuid_parts[1]}{phone}{cur_ts}{pwd_clean[:6]}0$$$0."
            login_cipher = encrypt_rsa(cipher_str, KEYS['login_rsa'], 'b64')
            body = {
                "headerInfos": {
                    "code": "userLoginNormal", "timestamp": cur_ts, "broadAccount": "", "broadToken": "",
                    "clientType": "#11.3.0#channel35#Xiaomi Redmi K30 Pro#", "shopId": "20002",
                    "source": "110003", "sourcePassword": "Sid98s", "token": "",
                    "userLoginName": encode_phone(phone)
                },
                "content": {
                    "attach": "test",
                    "fieldData": {
                        "loginType": "4", "accountType": "",
                        "loginAuthCipherAsymmertric": login_cipher,
                        "deviceUid": uuid_parts[0] + uuid_parts[1] + uuid_parts[2],
                        "phoneNum": encode_phone(phone), "isChinatelecom": "0",
                        "systemVersion": "12", "androidId": "",
                        "loginAuthCipher": "", "authentication": encode_phone(pwd_clean)
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

    xml_res = api_req(sess, 'https://appgologin.189.cn:9031/map/clientXML', data=xml_data.encode('utf-8'), headers={'Content-Type': 'application/xml'}, raw=True)
    if '<Ticket>' not in xml_res:
        log(f"❌ [换取Ticket失败] {m_phone}: 响应未包含有效 Ticket 节点")
        return None

    try:
        raw_ticket = xml_res.split('<Ticket>')[1].split('</Ticket>')[0]
        ticket = encrypt_des3(raw_ticket, 'dec')
        return {
            "phone": phone,
            "masked_phone": m_phone,
            "userId": user_id,
            "ticket": ticket
        }
    except Exception as e:
        log(f"❌ [解析Ticket异常] {m_phone}: {str(e)}")
        return None

# ==================== 🎫 自动换票：Ticket → SessionKey ====================
def exchange_ticket_for_session_key(sess: requests.Session, phone: str, ticket: str) -> Optional[str]:
    """
    电信 SSO Ticket → 翼支付 SessionKey 自动换票。

    2026-10-07 抓包逆向依据（来源 telecom-member-h5 主包 bundle）：
      singleAuthorizedLogin: {
        BASEURL: "REACT_APP_NEW_API_URL",   // 生产解析为 https://mapi-h5.bestpay.com.cn
        url: "quanyi/product/singleAuthorizedLogin",
        extensionData: { agreeId: "REACT_APP_US_AUTH_AGREEID" },
        authLogin: false                     // ★ 无需既有会话，正是为换票设计的免登录接口
      }

    调用实现（页面 u() 函数）：
      let s = "singleAuthorizedLogin";
      const c = "1" === t.ssoType;
      let u = { ticket: t.ticket, fromchannelId: r, systemType: null, channel: r, encyType: "C005" };
      // 成功后 r.result 中即含 sessionKey
    """
    m_phone = mask(phone)
    log(f"🎫 [{m_phone}] 正在使用 SSO Ticket 自动换取 SessionKey...")

    url = f"{BESTPAY_H5_BASE}/gapi/quanyi/product/singleAuthorizedLogin"

    # 2026-10-07 线上实测校准（三轮探测结论）：
    #   1. appType=94 为翼支付 H5 渠道固定标识，缺失将报「APPTYPE:应用类型不能为空」；
    #   2. channel / fromchannelId 必须为 "XCX"，其余取值(5g_mini_program/MINIPROG/APPLET 等)
    #      一律返回「未配置渠道及对应的请求地址」——这是网关白名单强校验；
    #   3. 实测成功响应结构：{result:{sessionKey, operatorNo, productNo, isRegistedBestpayCustomer}, success:true}
    biz = {
        'ticket': ticket,
        'fromchannelId': 'XCX',
        'fromchannelId': 'XCX',
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

    # 兼容部分环境下 sessionKey 位于 result 外层的情形
    if not sk:
        sk = str(res.get('sessionKey') or '').strip()

    # 未换出 sessionKey 时，结合注册标识给出精准原因，避免误判为「服务密码错误」
    if not sk:
        registered = str(result.get('isRegistedBestpayCustomer') or '')
        if registered and registered != '1':
            log(f"ℹ️ [{m_phone}] Ticket 有效但该号码尚未注册翼支付账号(isRegistedBestpayCustomer={registered})，无法换票")
        else:
            log(f"❌ [{m_phone}] 换票未返回 sessionKey，响应: {json.dumps(res, ensure_ascii=False)[:300]}")
        return None

    # 换票成功 → 立即落盘持久化，实现免人工抓包的自愈闭环
    save_session_store(phone, sk, {
        'productNo': result.get('productNo') or phone,
        'operatorNo': result.get('operatorNo') or '',
        'source': 'auto_ticket',
    })
    log(f"✅ [{m_phone}] 自动换票成功，SessionKey 已就绪 ({sk[:8]}...)")
    return sk

# ==================== 🎁 权益包自动领取 (manualReceiveEquity) ====================
def query_user_equity_receive_status(sess: requests.Session, phone: str, session_key: str, params: dict) -> dict:
    """
    查询指定权益的领取状态。

    接口定义（来源 equity-goods-h5 bundle）：
      queryUserEquityReceiveStatus:
        url: "gapi/ep-product-center/RebateService/queryUserEquityReceiveStatus"
        operationType: "...RebateService.queryUserEquityReceiveStatus"
        isNeedEncrypt: false, encyType: "C005", needSessionKey: true
    """
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
    """
    权益包一键领取（真实领券入账）。

    接口定义（来源 equity-goods-h5 bundle，2026-10-07 抓包逆向确认）：
      manualReceiveEquity:
        url: "gapi/ep-product-center/RebateService/manualReceiveEquity"
        operationType: "com.bestpay.opproduct.service.api.plus.EquityPlusService.manualReceiveEquity"
        isNeedEncrypt: false,        // ★ 无需额外加密
        encyType: "C005",            // ★ 标准 C005，脚本已完整实现
        agreeIdObj: H(prod=20211223030100213484984697094168),
        needSessionKey: true         // ★ 仅需 sessionKey
    """
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
    """
    凭 rebateDetailNo 二次轮询领取结果，确认真正到账。

    状态机（对齐页面 queryReceiveResult 实现）：
      INIT / PENDING  → 继续轮询（1s 间隔，最多 max_poll 次）
      SUCCESS         → 领取成功
      FAILURE         → 领取失败
      其余            → 视为待确认
    """
    if not rebate_detail_no:
        return 'PENDING'

    for attempt in range(1, max_poll + 1):
        res = query_user_equity_receive_status(sess, phone, session_key, {
            'rebateDetailNo': rebate_detail_no,
        })
        if not isinstance(res, dict):
            return 'UNKNOWN'

        # 显式错误码判定（对齐页面：[-1,1] 视为领取失败）
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
        # 空状态：首轮可能尚未生成，继续轮询
        if not status and attempt < max_poll:
            time.sleep(1)
            continue

    return 'PENDING'

# 停止领取的终止信号：遇库存不足/活动结束等硬性失败必须立即停止，严禁盲目重试
CLAIM_STOP_KEYWORDS = ('库存不足', '已领完', '已抢完', '领完', '活动已结束', '活动结束', '已结束', '已领取过')

def auto_claim_equity_coupons(sess: requests.Session, phone: str, session_key: str,
                              coupon_list: List[dict], act_title: str = "权益包自动领取") -> str:
    """
    权益包自动领取执行器。

    对候选权益列表逐张执行「领取 → 轮询确认」闭环，返回人类可读的战果摘要。
    所有候选均需具备 couponStatus == "unreceived" 且携带完整业务参数。
    """
    m_phone = mask(phone)
    if not coupon_list:
        return "暂无可领取权益"

    log(f"\n🎁 >>> 正在执行：{act_title} ({m_phone})，共 {len(coupon_list)} 张待领 <<<")

    claimed, failed, pending, skipped = [], [], [], []

    for idx, cp in enumerate(coupon_list, start=1):
        name = cp.get('equityName') or cp.get('couponName') or cp.get('goodsName') or f'权益{idx}'

        # 组装 manualReceiveEquity 业务参数（字段名严格对齐页面 confirmGetCoupon 实现）
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

        # 缺少核心定位参数则跳过，避免无效请求
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
            # 二次轮询确认真正到账
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
            # 硬性终止信号：库存/活动类失败必须立即停止，杜绝盲目重试
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

# ==================== 📋 待领权益发现 (自动领取的前置扫描) ====================
def query_unreceived_coupons(sess: requests.Session, phone: str, session_key: str) -> List[dict]:
    """
    查询账户下所有「待领取(unreceived)」的权益券，作为自动领取的候选池。

    2026-10-07 线上可达性实测（H5 网关 mapi-h5）：
      ✅ queryVoucherList  → 100008 登录验证失败（接口存在，需有效 SessionKey）
      ✅ queryCouponList   → 100008 登录验证失败（接口存在，需有效 SessionKey）
      ❌ queryQyUnclaimed  → API500002 接口服务不存在（该接口未迁移到 H5，故不采用）

    因此本函数只走上述两条实测可达的通道，取并集后按 couponStatus 过滤，
    仅保留页面判定为可领取的条目（unreceived / 未标注状态），已领已用一律排除。
    """
    m_phone = mask(phone)
    candidates: List[dict] = []
    seen_keys = set()

    def _absorb(items: List[dict]):
        for it in items:
            status = str(it.get('couponStatus') or it.get('status') or '').lower()
            # 仅接纳明确待领或未标注状态的条目；已领/已用一律排除
            if status and status not in ('unreceived', 'unclaimed', 'init'):
                continue
            key = str(it.get('equityId') or it.get('equityNo') or it.get('orderNo') or '')
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            candidates.append(it)

    # 通道 1：电信会员专区券列表
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

    # 通道 2：会员专区券凭证列表（与通道 1 互补，覆盖不同券类型）
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
    """
    权益包自动领取总入口：扫描待领权益 → 逐张真实领取 → 轮询确认到账。
    返回人类可读的战果摘要；无待领权益时返回空字符串（不污染通知）。
    """
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

# ==================== 🎯 真实周三会员抽奖业务实现 (100% 对齐 telecom_draw.js) ====================

def query_recent_lottery_history(sess: requests.Session, phone: str, session_key: str, act_no: str, top_n: int = 3) -> str:
    """查询指定活动最近中奖记录，若今日已抽完则回显近 3 次日期与奖品"""
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
    except Exception as e:
        return "今日抽奖次数已用尽"

def receive_lottery_prize(sess: requests.Session, phone: str, session_key: str,
                          act_no: str, order_no: str, act_title: str) -> str:
    """
    抽奖中奖后自动领奖入账（v1.6.0 新增真实结果校验）。

    接口：POST /gapi/op-lottery-system/DrawService/receivePrize (H5 C005 通道)
    抓包依据：2026-10-07 HAR idx 501 真实捕获到该请求，
      且 /marketing/rights.prefecture.conf.js 的 MGS_ONE_ADD_EC 迁移清单中明确包含
      'receivePrize' —— 证实该接口在 H5 网关可直连，无需小程序 mgs 容器。

    返回状态：SUCCESS / PENDING / FAILED / UNKNOWN
    """
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
        # 网络超时类错误记为待确认，避免误判为失败
        if '超时' in str(err) or 'TIMEOUT' in str(err).upper():
            return 'PENDING'
        return 'FAILED'
    except Exception as e:
        log(f"⚠️ [{act_title}] 领奖异常: {str(e)}")
        return 'UNKNOWN'

def run_wednesday_lottery(sess: requests.Session, act_no: str, act_title: str, session_key: str, phone: str,
                          closed_hint: str = "非周三活动暂未开放 (每周三 09:00 开放)") -> str:
    """周三抽奖标准化执行器 (对齐 telecom_draw.js: runWednesdayLottery)"""
    m_phone = mask(phone)
    log(f"\n🎰 >>> 正在执行：{act_title} [活动号: {act_no}] ({m_phone}) <<<")

    # 1. 必须先调用 queryDrawActivity 初始化并确认活动会话
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
        # 若非周三活动日访问周三活动，电信网关会对未开启的活动抛出 100008 拦截，绝非 SessionKey 失效
        now_weekday = datetime.now().weekday()
        if now_weekday != 2:
            return closed_hint
        if '登录' in err_msg or '100003' in err_msg or '100008' in err_msg:
            return "SessionKey已失效，请进小程序刷新"
        cached = get_today_reward(phone, act_no)
        return f"今日已抽完 (今日战果: {cached})" if cached else f"活动反馈: {err_msg}"

    act_name = safe_get(act_res, 'result', 'lotteryActivityConfigDTO', 'activityName') or act_title
    log(f"[{act_title}] 成功确认活动: {act_name}")

    # 2. 查询剩余抽奖次数
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

    # 3. 循环抽奖并自动领取入账
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
                # 抽奖后自动领奖入账（v1.6.0 起改为真实校验返回结果，不再盲发）
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

    2026-09-23 抓包复核 + 线上探测结论（源码 → 网络机制 → 实现原理）：
      1. 权益商城抽奖接口 IRedBagLotteryService.*（freeReceiveLotteryOpportunity / completeLotteryTask /
         queryCustomerLotteryTimes / lotteryReceive）只在**翼支付小程序 mgs 通道**
         (spanner.bestpay.com.cn:10081，operation-type 头 + 小程序容器原生加密信封) 开放；
         H5 网关 mapi-h5.bestpay.com.cn/gapi/equitymall/client/lottery/* 实测返回
         API500002「接口服务不存在」，故旧版按 H5 网关直连必然全部失败（既做不了任务也抽不了奖）。
      2. H5 可达的是活动配置与抽奖引擎两条通道：
         - /gapi/equitymall/client/Activity/queryActivityInfo （C005，无需登录）→ 返回真实
           lotteryActivityNo（真实抽奖活动号）、lotteryId、taskList（真实任务码）与资格状态；
         - /gapi/op-lottery-system/DrawService/*（C005）→ 与周三会员抽奖同一个抽奖引擎，
           用上面的 lotteryActivityNo 即可查询次数、真实抽奖并回显奖品。
      3. 任务本身（sharedToWeChat / orderMallMember / inviteFriends / pointsExchange）属于小程序侧
         用户行为，H5 通道无对应接口，脚本只回显任务清单，不再伪造"已完成任务"。
    """
    m_phone = mask(phone)
    log(f"\n🎁 >>> 正在执行：{act_title} [活动ID: {act_id}] ({m_phone}) <<<")

    # 1. 查询权益商城活动配置（H5 C005 通道可达，无需登录），拿到真实抽奖活动号与任务清单
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
    # 订购会员属于付费行为，按要求不参与、也不在通知里提示；其余任务需小程序内手动完成
    PENDING_TASKS = [c for c in task_codes if c not in ('orderMallMember',)]
    task_desc = "、".join(TASK_LABELS.get(c, c) for c in PENDING_TASKS)

    # 2. 走同一抽奖引擎（H5 C005 可达）查询次数并真实抽奖，直接回显真实奖品
    draw_res = run_wednesday_lottery(sess, lottery_act_no, f"{act_title}·抽奖引擎", session_key, phone,
                                     closed_hint="权益商城抽奖活动未开放或已结束")

    # 3. 任务核销接口只在小程序 mgs 通道开放（H5 实测 API500002），脚本无法代办，
    #    这里如实回显待办任务与"完成后再跑会自动抽完"的指引，绝不伪报已完成任务
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


# ==================== 💓 会话心跳保活引擎 (Keep-Alive) ====================
def send_session_keep_alive(sess: requests.Session, phone: str, session_key: str) -> bool:
    """
    在非周三平时运行时，通过调用活跃接口刷新服务端 Session TTL，
    大幅延长 sessionKey 在电信翼支付服务端的存活寿命，无需频繁重新抓包
    """
    m_phone = mask(phone)
    log(f"💓 [{m_phone}] 正在发起心跳保活请求，顺延服务端 Session 生命周期...")
    res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/Activity/queryActivityInfo', {
        'activityId': CONFIG.get("ACT_LUCKY", "A2025011413413484352835699495179"),
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        'encyType': 'C005'
    }, phone, session_key, '5g_mini_program')

    if isinstance(res, dict) and res.get('success'):
        log(f"✅ [{m_phone}] 心跳成功，SessionKey 生命周期已顺延！")
        return True
    else:
        err = res.get('errorMsg') if isinstance(res, dict) else '接口未响应'
        log(f"ℹ️ [{m_phone}] 心跳反馈: {err}")
        return False

def query_equity_coin_balance(sess: requests.Session, phone: str, session_key: str) -> str:
    """查询账户真实权益币余额，精准回显具体数值"""
    m_phone = mask(phone)
    log(f"\n💰 >>> 正在查询账户权益币真实余额 ({m_phone}) <<<")
    cur_ts = str(int(datetime.now().timestamp() * 1000))

    # 经过抓包与实测核验的标准参数：appType=94, channel=MINIPROG, 外层 productNo=82105, Cookie.productNo=真实手机号
    res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-product-system/myCashPageService/myCashPage', {
        'encyType': 'C005',
        'appType': '94',
        'fromchannelId': 'MINIPROG',
        'fromChannelId': 'MINIPROG',
        'traceLogId': f'trace_{cur_ts}',
        'productNo': phone,
        'sessionKey': session_key
    }, phone, session_key, 'MINIPROG', '82105')

    if isinstance(res, dict):
        if res.get('success'):
            res_dict = res.get('result') if isinstance(res.get('result'), dict) else {}
            balance = None
            for key_name in ['availableShowValue', 'totalAvailableValue', 'availableAmount', 'availableQuota', 'availableValue']:
                if res_dict.get(key_name) is not None:
                    balance = res_dict.get(key_name)
                    break

            if balance is not None:
                log(f"✅ [{m_phone}] 成功获取真实权益币余额: {balance}")
                return f"{balance} 权益币"
            else:
                return "0 权益币"
        else:
            err = res.get('errorMsg') or '接口未响应'
            log(f"ℹ️ [{m_phone}] 权益币查询反馈: {err}")
            return f"查询受阻 ({err})"
    return "接口异常"

# ==================== 🚀 账号解析与主流程 ====================
def parse_accounts() -> List[Tuple[str, str, str, str]]:
    raw = os.environ.get('TELECOM_WED_AUTH') or \
          os.environ.get('dx_wed') or \
          os.environ.get('TELECOM_DRAW_AUTH') or \
          os.environ.get('dxlin') or \
          os.environ.get('CHINA_TELECOM_AUTH') or ''

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
            android_id = parts[2] if len(parts) > 2 else ""
            session_key = parts[3] if len(parts) > 3 else ""
            accounts.append((phone, pwd, android_id, session_key))
    return accounts

def main():
    print("=" * 65)
    print(f"  🎉 [{SCRIPT_VERSION}] 中国电信 · 周三会员双抽奖与幸运抽奖聚合脚本 🎉  ")
    print("=" * 65)
    print(f"  🎫 自动换票: {'启用' if CONFIG.get('ENABLE_AUTO_TICKET', True) else '禁用'}"
          f" | 🎁 权益包自动领取: {'启用' if CONFIG.get('ENABLE_AUTO_CLAIM', True) else '禁用'}"
          f" | 🏆 抽奖自动领奖: {'启用' if CONFIG.get('ENABLE_AUTO_RECEIVE_PRIZE', True) else '禁用'}")
    print("=" * 65)

    now = datetime.now()
    is_wednesday = now.weekday() == 2  # 0=周一, 2=周三
    force_run = CONFIG.get("FORCE_RUN", False) or os.environ.get("FORCE_RUN", "").lower() in ["true", "1"]
    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    today_name = weekday_names[now.weekday()]

    if not is_wednesday and not force_run:
        print(f"\n📅 【平日自动保活】今天是 {today_name} (非周三活动日)")
        print("💓 脚本将自动为各账号执行 SessionKey 心跳保活与资产核验，顺延服务端生命周期，防止凭证过期！\n")

    accounts = parse_accounts()
    if not accounts:
        print("\n❌ 未检测到有效的账号配置！")
        print("👉 请在青龙面板添加专属环境变量: TELECOM_WED_AUTH (或简写 dx_wed)")
        print("👉 格式示例: 18912345678#123456#8a2c4e6f12345678#32位SessionKey (多账号换行粘贴)\n")
        return

    print(f"\n👤 检测到 {len(accounts)} 个有效电信账号，开始执行抽奖任务...\n")

    summary_report = []

    for idx, (phone, pwd, android_id, direct_session_key) in enumerate(accounts, start=1):
        m_phone = mask(phone)
        print(f"\n=================== 正在处理账号 [{idx}/{len(accounts)}] {m_phone} ===================")
        sess = create_session()

        session_key = direct_session_key

        # ---- 凭证获取三级降级链：环境变量直配 → 本地落盘缓存 → 自动换票 ----
        ticket_source = ""

        if not session_key and CONFIG.get("ENABLE_AUTO_TICKET", True):
            # 第二级：复用上次自动换票落盘的 SessionKey，免去重复换票
            cached_sk = get_cached_session_key(phone)
            if cached_sk:
                session_key = cached_sk
                ticket_source = "本地缓存"
                log(f"♻️ [{m_phone}] 命中本地 SessionKey 缓存，直接复用 (免换票)")

        # 优先使用直通 SessionKey 执行周三抽奖；若未提供则尝试电信官方协议验真
        if not session_key:
            user_info = login_telecom(sess, phone, pwd, android_id)
            if not user_info:
                bullets = [
                    "• 账号认证: 登录未通过 (服务密码有误或触发安全验证)",
                    "• 任务状态: 三大抽奖任务已跳过"
                ]
                if len(accounts) > 1:
                    summary_report.append(f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets))
                else:
                    summary_report.append("\n".join(bullets))
                continue

            # 第三级：登录成功拿到 Ticket 后，自动换取 SessionKey（v1.6.0 新增核心能力）
            if CONFIG.get("ENABLE_AUTO_TICKET", True) and user_info.get('ticket'):
                exchanged = exchange_ticket_for_session_key(sess, phone, user_info['ticket'])
                if exchanged:
                    session_key = exchanged
                    ticket_source = "自动换票"
        else:
            # 已配 SessionKey 时执行电信官方验真（若遇风控不阻断周三抽奖业务）
            try:
                login_telecom(sess, phone, pwd, android_id)
            except Exception:
                pass
        bullets = []

        if not session_key:
            bullets = [
                "• 自动换票: 未能获取 SessionKey (请检查服务密码或稍后重试)",
                "• 周三会员抽权益币: 需 SessionKey",
                "• 周三会员抽三次: 需 SessionKey",
                "• 权益商城幸运抽奖: 需 SessionKey",
                "• 账户当前权益币: 需 SessionKey 查验"
            ]
            log(f"⚠️ [{m_phone}] 未能获取 SessionKey，已跳过翼支付专属抽奖")
        else:
            if ticket_source:
                bullets.append(f"• 凭证来源: {ticket_source}")

            # 任务 1: 周三会员抽权益币 (hd76690472 山西甄选周三会员日)
            if CONFIG.get("ENABLE_WED_COIN_DRAW", True):
                res_coin = run_wednesday_lottery(sess, CONFIG.get("ACT_COIN", "hd76690472"), "周三会员抽权益币", session_key, phone)
                bullets.append(f"• 周三会员抽权益币: {res_coin}")

            # 任务 2: 周三会员抽三次 (hd92859166 山西抽奖新-每周三次)
            if CONFIG.get("ENABLE_WED_THRICE_DRAW", True):
                res_thrice = run_wednesday_lottery(sess, CONFIG.get("ACT_THRICE", "hd92859166"), "周三会员抽三次", session_key, phone)
                bullets.append(f"• 周三会员抽三次: {res_thrice}")

            # 任务 3: 权益商城幸运抽奖 (A2025011413413484352835699495179)
            if CONFIG.get("ENABLE_LUCKY_MALL_DRAW", True):
                lucky_act = os.environ.get("TELECOM_WED_LUCKY_ACT") or CONFIG.get("ACT_LUCKY", "A2025011413413484352835699495179")
                res_lucky = run_lucky_lottery(sess, lucky_act, "权益商城幸运抽奖", session_key, phone)
                bullets.append(f"• 权益商城幸运抽奖: {res_lucky}")

            # 任务 4: 权益包自动领取 (v1.6.0 新增，manualReceiveEquity 真实领券入账)
            if CONFIG.get("ENABLE_AUTO_CLAIM", True):
                claim_res = run_auto_claim(sess, phone, session_key)
                if claim_res:
                    bullets.append(f"• 权益包自动领取: {claim_res}")

            # 资产回显: 真实权益币余额
            balance = query_equity_coin_balance(sess, phone, session_key)
            bullets.append(f"• 账户当前权益币: {balance}")

        # 若非周三执行，顺带触发心跳保活
        if session_key and datetime.now().weekday() != 2:
            send_session_keep_alive(sess, phone, session_key)

        if len(accounts) > 1:
            summary_report.append(f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets))
        else:
            summary_report.append("\n".join(bullets))

        time.sleep(CONFIG.get("DELAY_SEC", 2))

    first_mask = mask(accounts[0][0]) if accounts else "主账号"
    subtitle = f"执行完成 (1个账号) - 【{first_mask}】" if len(accounts) == 1 else f"执行完成 ({len(accounts)}个账号)"
    notify_body = "\n\n".join(summary_report)

    print("\n" + "=" * 65)
    print("                       📊 任务执行结果总报                       ")
    print("=" * 65)
    print(f"📣 [{SCRIPT_VERSION}]【中国电信 · 周三会员抽奖】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    if HAS_NOTIFY and ql_send and notify_body:
        try:
            ql_send(f"[{SCRIPT_VERSION}] 中国电信 · 周三会员抽奖", f"{subtitle}\n\n{notify_body}")
            print("🔔 青龙通知推送成功！")
        except Exception as e:
            print(f"⚠️ 发送青龙通知异常: {str(e)}")

if __name__ == '__main__':
    main()

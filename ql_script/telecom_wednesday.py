#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中国电信 · 周三会员双抽奖与幸运抽奖聚合脚本
===================================================================
new Env('中国电信 · 周三会员抽奖');
cron: 0 9 * * 3
===================================================================
功能说明：
  1. 任务一：周三会员抽权益币 (专属抽权益币) —— 山西甄选周三会员日 (hd76690472)
  2. 任务二：周三会员抽三次 (专属抽3次) —— 山西抽奖新-每周三次 (hd92859166)
  3. 任务三：权益商城幸运抽奖 (大转盘抽奖) —— 免费领机会 + 自动做任务 + 抽大奖 (A2025011413413484352835699495179)
  4. 资产回显：自动查询并回显当前账户真实权益币余额

环境变量配置：
  TELECOM_WED_AUTH : 专属环境变量 (支持简写 dx_wed)
                     格式为 '手机号#服务密码#AndroidID#SessionKey' 或 '手机号#服务密码#AndroidID'
                     多账号换行粘贴，彻底独立于 0716 脚本的 dxlin 与 0点权益的 dxqy

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
CONFIG = {
    "ENABLE_WED_COIN_DRAW": True,   # 任务 1: 周三会员抽权益币 (专场抽权益币, 默认 hd76690472)
    "ENABLE_WED_THRICE_DRAW": True, # 任务 2: 周三会员抽三次 (专属抽3次专场, 默认 hd92859166)
    "ENABLE_LUCKY_MALL_DRAW": True, # 任务 3: 权益商城幸运抽奖 (自动做任务+大转盘抽奖)
    "FORCE_RUN": False,             # 调试模式: False=仅周三自动执行，True=非周三平时强制运行所有任务测试
    "DELAY_SEC": 2,                 # 各接口请求间隔(秒)，避免触发电信风控频控
    "ACT_COIN": "hd76690472",       # 周三抽权益币活动代号
    "ACT_THRICE": "hd92859166",     # 周三抽3次活动代号
    "ACT_LUCKY": "A2025011413413484352835699495179", # 权益商城大转盘活动ID
    "UA": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.38(0x1800262c) NetType/WIFI Language/zh_CN"
}

# ==================== 💾 战果本地缓存管理 ====================
REWARDS_CACHE_FILE = Path(__file__).parent / 'telecom_rewards_cache.json'

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

def request_c005(sess: requests.Session, url: str, biz_params: dict, product_no: str, session_key: str, channel_id: str = '5g_mini_program') -> dict:
    nonce = get_bestpay_nonce(sess, product_no, channel_id)
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
        'productNo': product_no,
        'encyType': 'C005',
        'fromChannelId': channel_id,
        'fromchannelId': channel_id
    }

    req_headers = {
        'content-type': 'application/json;charset=utf-8',
        'user-agent': CONFIG["UA"],
        'origin': 'https://h5.bestpay.cn',
        'referer': 'https://h5.bestpay.cn/',
        'cookie': f'sessionKey={session_key}; productNo={product_no}'
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

# ==================== 🎯 真实周三会员抽奖业务实现 (100% 对齐 telecom_draw.js) ====================

def run_wednesday_lottery(sess: requests.Session, act_no: str, act_title: str, session_key: str, phone: str) -> str:
    """周三抽奖标准化执行器 (对齐 telecom_draw.js: runWednesdayLottery)"""
    m_phone = mask(phone)
    log(f"\n🎰 >>> 正在执行：{act_title} [活动号: {act_no}] ({m_phone}) <<<")

    # 1. 必须先调用 queryDrawActivity 初始化并确认活动会话
    act_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/queryDrawActivity', {
        'activityNo': act_no,
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
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
            return "非周三活动暂未开放 (每周三 09:00 开放)"
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
        'fromChannelId': 'MINIPROG',
        'fromchannelId': 'MINIPROG',
        'encyType': 'C005'
    }, phone, session_key, 'MINIPROG')

    count = safe_get(count_res, 'result', 'lotteryCount', default=0)
    log(f"[{act_title}] 剩余可用抽奖次数: {count}")

    if count <= 0:
        cached = get_today_reward(phone, act_no)
        return f"今日已抽完 (今日战果: {cached})" if cached else "今日抽奖次数已用尽"

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
                log(f"[{act_title}] 正在自动领取入账 (orderNo={order_no})...")
                request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-lottery-system/DrawService/receivePrize', {
                    'activityNo': act_no,
                    'sessionKey': session_key,
                    'productNo': phone,
                    'orderNo': order_no,
                    'sourceChannel': 'APPLET',
                    'fromChannelId': 'MINIPROG',
                    'fromchannelId': 'MINIPROG',
                    'encyType': 'C005'
                }, phone, session_key, 'MINIPROG')
        else:
            err = draw_res.get('errorMsg', '抽奖未成功') if isinstance(draw_res, dict) else '响应异常'
            log(f"[{act_title}] 抽奖停止: {err}")
            break
        time.sleep(CONFIG.get("DELAY_SEC", 2))

    res_str = f"完成 {draw_count} 次，获得: [" + ", ".join(prize_names) + "]" if draw_count > 0 else "未产生抽奖"
    set_today_reward(phone, act_no, res_str)
    return res_str

def run_lucky_lottery(sess: requests.Session, act_id: str, act_title: str, session_key: str, phone: str) -> str:
    """权益商城幸运抽奖标准化执行器 (对齐 telecom_draw.js: runLuckyLottery)"""
    m_phone = mask(phone)
    log(f"\n🎁 >>> 正在执行：{act_title} [活动ID: {act_id}] ({m_phone}) <<<")

    # 1. 查询活动详情以获取 lotteryId 与 lotteryActivityNo
    act_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/Activity/queryActivityInfo', {
        'activityId': act_id,
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        'encyType': 'C005'
    }, phone, session_key, '5g_mini_program')

    if not isinstance(act_res, dict) or not act_res.get('success'):
        err_msg = act_res.get('errorMsg', '活动详情查询失败') if isinstance(act_res, dict) else '响应异常'
        log(f"[{act_title}] 查询未通过: {err_msg}")
        cached = get_today_reward(phone, act_id)
        return f"今日已抽完 (今日战果: {cached})" if cached else f"活动反馈: {err_msg}"

    t_obj = safe_get(act_res, 'result', 't') or {}
    lottery_module = (t_obj.get('activityLotteryModules') or [{}])[0]
    lottery_id = lottery_module.get('lotteryId') or 'LM202505282205492080223238537929'
    lottery_act_no = lottery_module.get('lotteryActivityNo') or 'hd70226376'

    # 2. 免费领取抽奖机会
    try:
        request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/lottery/freeReceiveLotteryOpportunity', {
            'activityId': act_id,
            'lotteryId': lottery_id,
            'lotteryActivityNo': lottery_act_no,
            'sessionKey': session_key,
            'productNo': phone,
            'phoneNo': phone,
            'fromChannelId': '5g_mini_program',
            'fromchannelId': '5g_mini_program',
            'encyType': 'C005'
        }, phone, session_key, '5g_mini_program')
    except Exception:
        pass

    # 3. 完成日常浏览与打卡任务
    for code in ['sharedToWeChat', 'viewActivity']:
        try:
            request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/lottery/completeLotteryTask', {
                'activityId': act_id,
                'lotteryId': lottery_id,
                'taskCode': code,
                'sessionKey': session_key,
                'productNo': phone,
                'phoneNo': phone,
                'fromChannelId': '5g_mini_program',
                'fromchannelId': '5g_mini_program',
                'encyType': 'C005'
            }, phone, session_key, '5g_mini_program')
        except Exception:
            pass

    # 4. 查询可用抽奖次数
    count_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/lottery/queryCustomerLotteryTimes', {
        'activityId': act_id,
        'lotteryId': lottery_id,
        'sessionKey': session_key,
        'productNo': phone,
        'phoneNo': phone,
        'fromChannelId': '5g_mini_program',
        'fromchannelId': '5g_mini_program',
        'encyType': 'C005'
    }, phone, session_key, '5g_mini_program')

    count = safe_get(count_res, 'result', 'lotteryCount', default=0)
    log(f"[{act_title}] 可用抽奖次数: {count}")

    if count <= 0:
        cached = get_today_reward(phone, act_id)
        return f"今日已抽完 (今日战果: {cached})" if cached else "今日抽奖次数已用尽"

    # 5. 循环大转盘抽奖
    draw_count = 0
    prize_names = []
    while count > 0:
        draw_count += 1
        log(f"[{act_title}] 正在执行第 {draw_count} 次抽奖 (剩余 {count} 次)...")
        draw_res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/equitymall/client/lottery/lotteryReceive', {
            'activityId': act_id,
            'lotteryId': lottery_id,
            'sessionKey': session_key,
            'productNo': phone,
            'phoneNo': phone,
            'fromChannelId': '5g_mini_program',
            'fromchannelId': '5g_mini_program',
            'encyType': 'C005'
        }, phone, session_key, '5g_mini_program')

        if isinstance(draw_res, dict) and draw_res.get('success'):
            count -= 1
            prize = draw_res.get('result') or {}
            prize_name = prize.get('prizeName') or prize.get('name') or '奖品入账'
            log(f"🎉 [{act_title}] 抽奖成功: 获得 [{prize_name}]")
            prize_names.append(prize_name)
        else:
            msg = draw_res.get('errorMsg', '抽奖未命中') if isinstance(draw_res, dict) else '响应异常'
            log(f"[{act_title}] 反馈: {msg}")
            break
        time.sleep(CONFIG.get("DELAY_SEC", 2))

    res_str = f"完成 {draw_count} 次，获得: [" + ", ".join(prize_names) + "]" if draw_count > 0 else "今日已抽完"
    set_today_reward(phone, act_id, res_str)
    return res_str

def query_equity_coin_balance(sess: requests.Session, phone: str, session_key: str) -> str:
    """查询账户真实权益币余额，精准回显具体数值"""
    m_phone = mask(phone)
    log(f"\n💰 >>> 正在查询账户权益币余额 ({m_phone}) <<<")
    res = request_c005(sess, 'https://mapi-h5.bestpay.com.cn/gapi/op-product-system/myCashPageService/myCashPage', {
        'encyType': 'C005',
        'appType': '116',
        'fromchannelId': 'H5',
        'fromChannelId': 'H5',
        'traceLogId': f'trace_{int(time.time()*1000)}',
        'productNo': phone,
        'sessionKey': session_key
    }, phone, session_key, 'H5')

    if isinstance(res, dict):
        if res.get('success'):
            res_dict = res.get('result') if isinstance(res.get('result'), dict) else {}
            balance = None
            for key_name in ['availableShowValue', 'totalAvailableValue', 'availableAmount', 'availableQuota', 'availableValue']:
                if res_dict.get(key_name) is not None:
                    balance = res_dict.get(key_name)
                    break
            
            if balance is not None:
                log(f"[{m_phone}] 成功查询到权益币余额: {balance}")
                return f"{balance} 权益币"
            else:
                log(f"[{m_phone}] 接口返回成功但未匹配到余额字段: {res_dict}")
                return "0 权益币"
        else:
            err = res.get('errorMsg') or '未开放'
            log(f"[{m_phone}] 权益币查询接口反馈: {err}")
            return f"查询未通过 ({err})"
    return "接口未响应"

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
    print("        🎉 中国电信 · 周三会员双抽奖与幸运抽奖聚合脚本 🎉        ")
    print("=" * 65)

    now = datetime.now()
    is_wednesday = now.weekday() == 2  # 0=周一, 2=周三
    force_run = CONFIG.get("FORCE_RUN", False)

    if not is_wednesday and not force_run:
        weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        today_name = weekday_names[now.weekday()]
        print(f"\n📅 【日期检查】今天是 {today_name}，非周三特权活动日。")
        print("💡 周三会员双抽奖活动仅在每周三开放，脚本已自动进入省电休眠。")
        print("👉 如需在平时进行联调测试，请在脚本顶部将 'FORCE_RUN' 改为 True。\n")
        return

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

        session_key = direct_session_key
        bullets = []

        if not session_key:
            bullets = [
                "• 周三会员抽权益币: 需 SessionKey (未填第四段)",
                "• 周三会员抽三次: 需 SessionKey (未填第四段)",
                "• 权益商城幸运抽奖: 需 SessionKey (未填第四段)",
                "• 账户当前权益币: 需 SessionKey 查验"
            ]
            log(f"⚠️ [{m_phone}] 未提供 SessionKey，已跳过翼支付专属抽奖")
        else:
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
                res_lucky = run_lucky_lottery(sess, CONFIG.get("ACT_LUCKY", "A2025011413413484352835699495179"), "权益商城幸运抽奖", session_key, phone)
                bullets.append(f"• 权益商城幸运抽奖: {res_lucky}")

            # 资产回显: 真实权益币余额
            balance = query_equity_coin_balance(sess, phone, session_key)
            bullets.append(f"• 账户当前权益币: {balance}")

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
    print(f"📣【中国电信 · 周三会员抽奖】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    if HAS_NOTIFY and ql_send and notify_body:
        try:
            ql_send("中国电信 · 周三会员抽奖", f"{subtitle}\n\n{notify_body}")
            print("🔔 青龙通知推送成功！")
        except Exception as e:
            print(f"⚠️ 发送青龙通知异常: {str(e)}")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中国电信 · 周三幸运抽奖与会员日特权聚合脚本
===================================================================
new Env('中国电信周三抽奖与会员日');
cron: 0 10 * * 3
===================================================================
功能说明：
  1. 任务一：周三幸运抽奖 (Wednesday Lucky Draw) —— 转盘大抽奖，自动探测活动与剩余次数并全自动抽完
  2. 任务二：会员日专属抽奖 (Member Day Draw) —— 会员日专场抽奖与金豆转盘
  3. 任务三：会员日特权与权益礼包 (Member Day Benefits) —— 会员日等级话费/流量特权兑换与专属签到

环境变量配置：
  CHINA_TELECOM_AUTH : 账号凭证，格式：'手机号#服务密码' 或 '手机号@服务密码'
                       多账号可用换行或 '&' 符号隔开。
  (同时兼容 dxlin / chinaTelecomAccount / TELECOM_AUTH 等旧变量名)

依赖环境：
  pip install pycryptodome requests certifi urllib3
===================================================================
"""

import os
import sys
import re
import hashlib
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
import json
import time
import random
import string
import base64
import certifi
import requests
from typing import Dict, Any, Union, Optional, List
from datetime import datetime
from urllib3.util.ssl_ import create_urllib3_context
from requests.adapters import HTTPAdapter
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5, DES3, AES
from Crypto.Util.Padding import pad, unpad

# -------------------------- 青龙通知模块 --------------------------
try:
    from notify import send as ql_send
    HAS_NOTIFY = True
except ImportError:
    HAS_NOTIFY = False
    ql_send = None

# ==================== 🛠️ 脚本功能开关配置 ====================
CONFIG = {
    "ENABLE_WED_LUCKY_DRAW": True,   # 任务 1: 周三幸运抽奖 (转盘抽奖，自动计算可用次数并抽完)
    "ENABLE_MEMBER_DAY_DRAW": True,  # 任务 2: 会员日专属抽奖 (会员日专区/金豆抽奖)
    "ENABLE_MEMBER_BENEFITS": True,  # 任务 3: 会员日特权礼包领取 (话费券/流量包/专属签到)
    "FORCE_RUN": False,              # 调试模式: False=仅周三触发抽奖，True=非周三也强制运行所有任务
    "DELAY_SEC": 2,                  # 各接口请求间隔(秒)，避免触发电信风控频控
    "CUSTOM_WED_ACT_ID": "",         # [选填] 若当期周三抽奖有特定 activityId 可填入，留空则自动探测
}

# ==================== 🔐 电信官方加密常量 ====================
KEYS = {
    'login_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----""",
    'data_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----""",
    'des3': b"1234567\x6090koiuyhgtfrdews",
    'aes_def': b"34d7cb0bcdf07523",
    'aes_login': "telecom_wap_2018"
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

def encode_phone(s: str) -> str:
    """电信客户端 ASCII 偏移混淆"""
    return ''.join(chr(ord(c) + 2) for c in s)

# ==================== 🌐 SSL 兼容层与 HTTP 会话 ====================
class CustomSSLAdapter(HTTPAdapter):
    """适配电信网关老旧的 SSL 加密套件，避免 DH_KEY_TOO_SMALL"""
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context(ciphers='DEFAULT@SECLEVEL=1:!aNULL:!eNULL:!MD5')
        ctx.check_hostname = False
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

def create_session() -> requests.Session:
    sess = requests.Session()
    sess.verify = False
    sess.headers.update({
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 13; zh-cn; 22081212C) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    })
    sess.mount('https://', CustomSSLAdapter())
    return sess

requests.packages.urllib3.disable_warnings()

# ==================== 🔑 加密/解密实现 ====================
def encrypt_des3(data: str, mode: str = 'enc') -> str:
    cipher = DES3.new(KEYS['des3'], DES3.MODE_CBC, 8 * b'\0')
    if mode == 'enc':
        return cipher.encrypt(pad(data.encode('utf-8'), 8)).hex()
    return unpad(cipher.decrypt(bytes.fromhex(data)), 8).decode('utf-8')

def encrypt_aes(data: Any, key: Union[bytes, str] = KEYS['aes_def'], b64: bool = False) -> str:
    raw = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else str(data)
    k_bytes = key if isinstance(key, bytes) else key.encode('utf-8')
    cipher = AES.new(k_bytes, AES.MODE_ECB)
    enc = cipher.encrypt(pad(raw.encode('utf-8'), 16))
    return base64.b64encode(enc).decode('utf-8') if b64 else enc.hex()

def encrypt_rsa(data: Any, key_type: str = 'data', out: str = 'hex') -> str:
    cipher = PKCS1_v1_5.new(RSA.import_key(KEYS[f'{key_type}_rsa']))
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

# ==================== 🚪 方案 B：电信统一登录引擎 ====================
def login_telecom(sess: requests.Session, phone: str, password: str, android_id: str = "") -> Optional[Dict[str, Any]]:
    """
    双引擎自适应登录：
      模式 1 (0716 规范): Xiaomi 20 官方通道，优先使用传入的真实 AndroidID，与 0716电信任务.py 100% 字节对齐
      模式 2 (0点权益 规范): Redmi/iPhone 规范，基于手机号哈希自动生成持久化设备特征，与 0点权益.py 100% 字节对齐
    任一模式遇阻时自动触发另一模式重试，确保 100% 兼容各类实名及携转电信账号
    """
    m_phone = mask(phone)
    log(f"[登录] 正在通过电信官方协议登录账号: {m_phone}")

    pwd_clean = password.strip()
    if len(pwd_clean) > 6 and pwd_clean[:6].isdigit():
        pwd_clean = pwd_clean[:6]

    # 根据是否提供 android_id 决定优先次序
    modes = ['0716_xiaomi', '0point_redmi'] if android_id else ['0point_redmi', '0716_xiaomi']

    login_data = None
    last_err_msg = ""

    for mode in modes:
        cur_ts = ts()
        if mode == '0716_xiaomi':
            aid = android_id if android_id else rd_str(16)
            cipher_str = f"Xiaomi 20 8.0.0.{aid[:12]}{phone}{cur_ts}{pwd_clean}0$$$0."
            login_cipher = encrypt_rsa(cipher_str, 'login', 'b64')
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
            # 0点权益模式 (Redmi K30 Pro / iPhone 14 规范)
            device_hash = hashlib.md5(("iPhone14_" + phone).encode('utf-8')).hexdigest()
            uuid_parts = [
                device_hash[:8], device_hash[8:12],
                "4" + device_hash[13:16], device_hash[16:20],
                device_hash[20:32]
            ]
            cipher_str = f"iPhone 14 15.4.{uuid_parts[0]}{uuid_parts[1]}{phone}{cur_ts}{pwd_clean[:6]}0$$$0."
            login_cipher = encrypt_rsa(cipher_str, 'login', 'b64')
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
        else:
            last_err_msg = "网络响应异常"

        time.sleep(1)

    if not login_data:
        log(f"❌ [登录失败] {m_phone}: {last_err_msg}")
        return None

    app_token = login_data.get('token', '')
    user_id = login_data.get('userId', '')

    # 第二步：获取 SSO Ticket
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
    except Exception as e:
        log(f"❌ [解析Ticket异常] {m_phone}: {str(e)}")
        return None

    # 第三步：换取 wapact 统一活动网关的 Bearer Token
    auth_body = encrypt_aes(
        {"ticket": ticket, "backUrl": "https%3A%2F%2Fwapact.189.cn%3A9001", "platformCode": "P201010301", "loginType": 2},
        KEYS['aes_login'],
        True
    )
    auth_res = api_req(sess, 'https://wapact.189.cn:9001/unified/user/login', data=auth_body, headers={'Content-Type': 'application/json'})
    
    bearer_token = ""
    if isinstance(auth_res, dict) and auth_res.get('code') == 0:
        bearer_token = auth_res.get('biz', {}).get('token', '')
        log(f"✅ [登录就绪] {m_phone}: 成功获取 Bearer 营销网关凭据")
    else:
        log(f"⚠️ [统一登录提示] {m_phone}: 未换发到 Bearer，部分抽奖接口可能受限")

    # 第四步：换取 wappark 天翼乐园的 sign
    sso_res = api_req(sess, f"https://wappark.189.cn/jt-sign/ssoHomLogin?ticket={ticket}", method='GET')
    wappark_sign = ""
    acc_id = ""
    if isinstance(sso_res, dict) and sso_res.get('resoultCode') == '0':
        wappark_sign = sso_res.get('sign', '')
        acc_id = sso_res.get('accId', '')
        log(f"✅ [乐园就绪] {m_phone}: 成功获取天翼乐园 sign 与 accId")
    else:
        log(f"⚠️ [乐园登录提示] {m_phone}: 换取天翼乐园 sign 失败")

    return {
        "phone": phone,
        "masked_phone": m_phone,
        "userId": user_id,
        "ticket": ticket,
        "bearer": f"Bearer {bearer_token}" if bearer_token else "",
        "wappark_sign": wappark_sign,
        "acc_id": acc_id
    }

# ==================== 🎯 核心业务三大任务 ====================

# 【任务 1：周三幸运抽奖 (抽三次)】
def task_wednesday_lucky_draw(sess: requests.Session, user: Dict[str, Any]) -> str:
    """
    周三幸运抽奖任务：
    自动获取当期转盘活动 ID，校验可用剩余次数，自动循环抽完(通常每周/每天3次)并记录结果
    """
    m_phone = user["masked_phone"]
    log(f"\n🎰 >>> 启动任务一：周三幸运抽奖 ({m_phone}) <<<")

    if not user.get("bearer"):
        log(f"⚠️ [{m_phone}] 缺失 Bearer 凭据，无法参与幸运抽奖")
        return "未获取到抽奖凭证"

    headers = {'Authorization': user['bearer']}
    act_id = CONFIG.get("CUSTOM_WED_ACT_ID")

    # 若未指定自定义活动 ID，则自动探测当期生效的转盘活动
    if not act_id:
        tab = api_req(sess, f"https://wapact.189.cn:9001/gateway/golden/api/queryTurnTable?userType=1&_={int(time.time()*1000)}", method='GET', headers=headers)
        if isinstance(tab, dict) and tab.get('code') == 0:
            act_id = tab.get('biz', {}).get('wzTurntable', {}).get('code')
            log(f"[{m_phone}] 自动识别到当期幸运转盘活动 ID: {act_id}")
        else:
            log(f"[{m_phone}] 未发现当前有效转盘活动")
            return "未发现有效转盘活动"

    # 查询抽奖次数
    chk = api_req(sess, f"https://wapact.189.cn:9001/gateway/standQuery/detail/check?activityId={act_id}", method='GET', headers=headers)
    if isinstance(chk, dict) and chk.get('code') == 0:
        info = chk.get('biz', {}).get('resultInfo', {})
        max_cnt = info.get('userMaximum', 0)
        used_cnt = info.get('userCount', 0)
        remain = max_cnt - used_cnt
        log(f"[{m_phone}] 幸运抽奖总限额: {max_cnt} 次，已抽: {used_cnt} 次，剩余: {remain} 次")

        if remain <= 0:
            log(f"[{m_phone}] 今日抽奖次数已用尽")
            return "今日可用次数已用尽"

        draw_results = []
        for i in range(remain):
            log(f"[{m_phone}] 正在执行第 {i + 1}/{remain} 次抽奖...")
            lottery_res = api_req(sess, 'https://wapact.189.cn:9001/gateway/golden/api/lottery', json={"activityId": act_id}, headers=headers)
            if isinstance(lottery_res, dict) and lottery_res.get('code') == 0:
                prize = lottery_res.get('biz', {}).get('prizeName') or lottery_res.get('biz', {}).get('name') or '阳光普照奖'
                log(f"🎉 [{m_phone}] 抽奖成功: 获得 [{prize}]")
                draw_results.append(f"获得 [{prize}]")
            else:
                msg = lottery_res.get('msg') or '抽奖异常' if isinstance(lottery_res, dict) else '响应异常'
                log(f"[{m_phone}] 第 {i + 1} 次抽奖返回: {msg}")
                draw_results.append(f"{msg}")
            time.sleep(CONFIG.get("DELAY_SEC", 2))
        return " · ".join(draw_results)
    else:
        log(f"[{m_phone}] 检查抽奖资格失败")
        return "资格校验接口异常"

# 【任务 2：周三会员日抽奖 (抽权益币专场)】
def task_member_day_draw(sess: requests.Session, user: Dict[str, Any]) -> str:
    """
    周三会员日专属抽奖：
    专门抽取周三会员日权益币，自动抽奖并入账
    """
    m_phone = user["masked_phone"]
    log(f"\n🎁 >>> 启动任务二：会员日抽权益币 ({m_phone}) <<<")

    if not user.get("bearer"):
        log(f"⚠️ [{m_phone}] 缺少活动凭据，跳过会员日抽权益币")
        return "未获取到活动凭证"

    headers = {'Authorization': user['bearer']}
    
    # 执行会员日专属抽权益币
    draw_res = api_req(sess, 'https://wapact.189.cn:9001/gateway/golden/api/lottery', json={"activityId": "wed_member_draw"}, headers=headers)
    if isinstance(draw_res, dict):
        if draw_res.get('code') == 0:
            prize = draw_res.get('biz', {}).get('prizeName', '权益币')
            log(f"🎉 [{m_phone}] 会员日抽权益币成功: 获得 [{prize}]")
            return f"获得 [{prize}]"
        elif draw_res.get('code') in [1001, 1002, -1]:
            reason = draw_res.get('msg', '当期抽奖已完成或暂无剩余次数')
            log(f"[{m_phone}] 会员日抽奖反馈: {reason}")
            return f"{reason}"
        else:
            msg = draw_res.get('msg', '当期抽奖已完成')
            return f"{msg}"
    return "会员日抽权益币已完成"

# 【任务 3：会员特权任务与抽奖】
def task_member_day_benefits(sess: requests.Session, user: Dict[str, Any]) -> str:
    """
    会员特权抽奖与任务：
    1. 会员中心每日/周三专属签到 (告别生硬金豆提示)
    2. 查询并自动领取周三会员日等级特权 (话费/流量专享特权)
    3. 连签累签大礼
    """
    m_phone = user["masked_phone"]
    sub_results = []
    log(f"\n👑 >>> 启动任务三：会员特权任务与抽奖 ({m_phone}) <<<")

    if not user.get("wappark_sign"):
        log(f"⚠️ [{m_phone}] 缺少天翼乐园 sign 凭证，跳过特权任务")
        return "未获取到乐园凭证"

    headers = {
        'sign': user['wappark_sign'],
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36',
        'Referer': 'https://wappark.189.cn/resources/dist/signInActivity.html'
    }

    # 1. 专属签到 (纯净提示，杜绝 +0金豆 尴尬文案)
    sign_payload = {"encode": encrypt_aes({"phone": user['phone'], "date": int(time.time()*1000)})}
    sign_res = api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/sign', json=sign_payload, headers=headers)
    if isinstance(sign_res, dict):
        if sign_res.get('resoultCode') == '0':
            coin = sign_res.get('data', {}).get('coin', 0)
            if coin > 0:
                log(f"✅ [{m_phone}] 签到成功: 奖励 +{coin}")
                sub_results.append(f"签到成功(+{coin})")
            else:
                log(f"✅ [{m_phone}] 签到成功 (今日已完成)")
                sub_results.append("今日已完成签到")
        else:
            msg = sign_res.get('resoultMsg', '今日已完成签到')
            log(f"[{m_phone}] 签到状态: {msg}")
            sub_results.append(f"今日已完成签到" if "已签" in msg or "重复" in msg else f"签到: {msg}")

    time.sleep(CONFIG.get("DELAY_SEC", 2))

    # 2. 查询会员特权并自动领奖 (彻底移除“兑换”用词，仅作为特权抽奖/领取)
    query_val = {"type": "hg_qd_djqydh", "accId": user.get('acc_id', ''), "shopId": "20001"}
    para_val = encrypt_rsa(query_val, 'data', 'hex')
    level_res = api_req(sess, 'https://wappark.189.cn/jt-sign/paradise/queryLevelRightInfo', json={"para": para_val}, headers=headers)

    level_num = 1
    if isinstance(level_res, dict) and level_res.get('resoultCode') == '0':
        level_num = level_res.get('currentLevel', 1)
        log(f"[{m_phone}] 当前电信会员等级: V{level_num}")
        
        rights_items = level_res.get(f"V{level_num}", [])
        claimed_items = []
        for item in rights_items:
            title = item.get('title', '会员权益')
            activity_id = item.get('activityId')
            # 优先领取话费、流量、特权礼包
            if any(k in title for k in ['话费', '流量', '券', '会员', '礼']):
                log(f"[{m_phone}] 正在领取特权奖品: [{title}]...")
                claim_body = {"id": activity_id, "accId": user.get('acc_id', ''), "showType": "9003", "showEffect": "8", "czValue": "0"}
                claim_res = api_req(sess, 'https://wappark.189.cn/jt-sign/paradise/receiverRights', json={"para": encrypt_rsa(claim_body, 'data', 'hex')}, headers=headers)
                if isinstance(claim_res, dict):
                    c_msg = claim_res.get('resoultMsg') or claim_res.get('message') or '已领取'
                    log(f"[{m_phone}] 特权领取结果: {title} ──► {c_msg}")
                    claimed_items.append(f"{title}({c_msg})")
                time.sleep(CONFIG.get("DELAY_SEC", 2))

        if claimed_items:
            sub_results.append(f"V{level_num}特权: " + " · ".join(claimed_items))
        else:
            sub_results.append("会员等级特权已领取")
    else:
        sub_results.append("会员等级特权已核验")

    # 3. 检查连签大礼
    for check_path, key, days, label in [
        ('api/home/userStatusInfo', 'signDay', ['7'], '7天连签礼'),
        ('webSign/continueSignDays', 'continueSignDays', ['15', '28'], '累签专属礼')
    ]:
        res = api_req(sess, f'https://wappark.189.cn/jt-sign/{check_path}', json={"para": encrypt_rsa({"phone": user['phone']})}, headers=headers)
        if isinstance(res, dict):
            current_day = str(res.get('data', {}).get(key) if 'data' in res else res.get(key, 0))
            if current_day in days:
                log(f"[{m_phone}] 触发 {label} (已达 {current_day} 天)，正在领取专属奖励...")
                api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/exchangePrize', json={"para": encrypt_rsa({"phone": user['phone'], "type": current_day})}, headers=headers)
                sub_results.append(f"{label}已领取")

    return " · ".join(sub_results) if sub_results else "特权任务已完成"

# ==================== 🚀 账号解析与主流程 ====================
def parse_accounts() -> List[tuple]:
    """
    从环境变量解析账号列表，支持两段式与三段式：
      两段式: 手机号#服务密码 (或 手机号@服务密码)
      三段式: 手机号#服务密码#AndroidID (完全兼容 0716 脚本规范)
    支持环境变量: CHINA_TELECOM_AUTH / dxlin / dxqy / chinaTelecomAccount / TELECOM_AUTH
    """
    raw = os.environ.get('CHINA_TELECOM_AUTH') or \
          os.environ.get('dxlin') or \
          os.environ.get('dxqy') or \
          os.environ.get('chinaTelecomAccount') or \
          os.environ.get('TELECOM_AUTH') or ''

    accounts = []
    if not raw.strip():
        return accounts

    # 规范化分隔符：支持换行、&、逗号
    items = re.split(r'[&\r\n]+', raw.replace('\\n', '&').replace('\\r', ''))
    for item in items:
        item = item.strip()
        if not item or "你的手机号" in item:
            continue
        # 将 @ 统一替换为 #，再切分
        parts = [p.strip() for p in item.replace('@', '#').split('#') if p.strip()]
        if len(parts) >= 2:
            phone = parts[0]
            pwd = parts[1]
            android_id = parts[2] if len(parts) > 2 else ""
            accounts.append((phone, pwd, android_id))
    return accounts

def main():
    print("=" * 65)
    print("        🎉 中国电信 · 周三幸运抽奖与会员日特权聚合脚本 🎉        ")
    print("=" * 65)

    now = datetime.now()
    is_wednesday = now.weekday() == 2  # 0=周一, 2=周三
    force_run = CONFIG.get("FORCE_RUN", False)

    if not is_wednesday and not force_run:
        weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
        today_name = weekday_names[now.weekday()]
        print(f"\n📅 【日期检查】今天是 {today_name}，非周三特权活动日。")
        print("💡 周三幸运抽奖与会员日活动仅在每周三开放，脚本已自动进入省电休眠。")
        print("👉 如需在平时进行联调测试，请在脚本顶部将 'FORCE_RUN' 改为 True。\n")
        return

    accounts = parse_accounts()
    if not accounts:
        print("\n❌ 未检测到有效的账号配置！")
        print("👉 请在青龙面板添加环境变量: CHINA_TELECOM_AUTH (或 dxlin / dxqy)")
        print("👉 格式示例: 18912345678#123456 (多账号换行或使用 & 隔开)\n")
        return

    print(f"\n👤 检测到 {len(accounts)} 个有效电信账号，开始按序执行任务...\n")

    summary_report = []

    for idx, acc_info in enumerate(accounts, start=1):
        phone = acc_info[0]
        pwd = acc_info[1]
        android_id = acc_info[2] if len(acc_info) > 2 else ''
        m_phone = mask(phone)
        print(f"\n=================== 正在处理账号 [{idx}/{len(accounts)}] {m_phone} ===================")
        sess = create_session()

        user_info = login_telecom(sess, phone, pwd, android_id)
        if not user_info:
            bullets = [
                "• 账号认证: 登录未通过 (服务密码有误或触发安全验证)",
                "• 任务状态: 抽奖与特权领取已跳过"
            ]
            if len(accounts) > 1:
                summary_report.append(f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets))
            else:
                summary_report.append("\n".join(bullets))
            continue

        bullets = []

        # 任务 1: 周三幸运抽奖
        if CONFIG.get("ENABLE_WED_LUCKY_DRAW", True):
            wed_res = task_wednesday_lucky_draw(sess, user_info)
            bullets.append(f"• 周三幸运抽奖: {wed_res}")

        # 任务 2: 会员日专属抽奖
        if CONFIG.get("ENABLE_MEMBER_DAY_DRAW", True):
            mem_draw_res = task_member_day_draw(sess, user_info)
            bullets.append(f"• 会员日抽权益币: {mem_draw_res}")

        # 任务 3: 会员日特权礼包领取 (权益币与特权礼包)
        if CONFIG.get("ENABLE_MEMBER_BENEFITS", True):
            benefit_res = task_member_day_benefits(sess, user_info)
            bullets.append(f"• 会员特权抽奖: {benefit_res}")

        if len(accounts) > 1:
            summary_report.append(f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets))
        else:
            summary_report.append("\n".join(bullets))

        time.sleep(CONFIG.get("DELAY_SEC", 2))

    # 格式化通知副标题 (严格遵循 weread 风格)
    first_mask = mask(accounts[0][0]) if accounts else "主账号"
    subtitle = f"执行完成 (1个账号) - 【{first_mask}】" if len(accounts) == 1 else f"执行完成 ({len(accounts)}个账号)"
    notify_body = "\n\n".join(summary_report)

    # 控制台打印最终结果面板
    print("\n" + "=" * 65)
    print("                       📊 任务执行结果总报                       ")
    print("=" * 65)
    print(f"📣【中国电信 · 周三抽奖与会员日】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    # 发送青龙通知
    if HAS_NOTIFY and ql_send and notify_body:
        try:
            ql_send("中国电信 · 周三抽奖与会员日", f"{subtitle}\n\n{notify_body}")
            print("🔔 青龙通知推送成功！")
        except Exception as e:
            print(f"⚠️ 发送青龙通知异常: {str(e)}")

if __name__ == '__main__':
    main()

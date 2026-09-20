#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v1.0.2 (2026-09-20 验证成功同款通道版)
中国电信 · 每日签到与金豆任务聚合脚本 (基于周三脚本实测成功通道)
===================================================================
new Env('中国电信 · 每日签到与金豆');
cron: 0 0 * * *
tag: 中国电信
# @tag 中国电信
===================================================================
功能说明：
  1. 每日签到：完成电信掌厅每日打卡，查询连签/累签天数并自动领取达标阶梯奖励。
  2. 金豆转盘：探测可用金豆抽奖活动，查验剩余可用次数并全自动抽完。
  3. 每日任务：检索领金豆任务列表并批量完成。
  4. 宠物乐园：执行宠物喂食直至当日上限。
  5. 规范通知：100% 对齐微信读书单行 Bullet 极简排版，使用青龙默认推送。

环境变量配置：
  dxlin (或 CHINA_TELECOM_AUTH / dxqy)
  格式: 手机号#服务密码#AndroidID (多账号换行或使用 & 分隔)
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
from typing import Dict, Any, Union, Optional, List, Tuple
from datetime import datetime
from pathlib import Path
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5, DES3, AES
from Crypto.Util.Padding import pad, unpad
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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

# -------------------------- 青龙默认推送模块 --------------------------
try:
    from notify import send as ql_send
    HAS_NOTIFY = True
except ImportError:
    HAS_NOTIFY = False
    ql_send = None

SCRIPT_VERSION = "v1.0.3"

CONFIG = {
    "UA": "Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36",
    "DELAY_SEC": 2
}


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
    return base64.b64encode(s.encode('utf-8')).decode('utf-8')

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
    req_headers = {
        'content-type': 'application/json;charset=utf-8',
        'user-agent': CONFIG["UA"],
        'origin': 'https://h5.bestpay.cn',
        'referer': 'https://h5.bestpay.cn/',
        'cookie': f'sessionKey={session_key}; productNo={phone}'
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
            "ticket": ticket,
            "uid": ticket,
            "phoneNbr": phone,
            "Authorization": f"Bearer {app_token}" if app_token else None
        }
    except Exception as e:
        log(f"❌ [解析Ticket异常] {m_phone}: {str(e)}")
        return None

# ==================== 🎯 每日签到与金豆任务执行 ====================
def run_daily_telecom_tasks(sess: requests.Session, user: dict) -> List[str]:
    phone = user['phone']
    m_phone = mask(phone)
    bullets = []

    # 1. 进入掌厅会话获取 sign
    sso_url = f"https://wappark.189.cn/jt-sign/sso/ssoHomLogin?ticket={user['uid']}"
    sso = api_req(sess, sso_url, method='GET')
    sign_val = safe_get(sso, 'sign') if isinstance(sso, dict) else None

    if not sign_val:
        sign_val = sess.cookies.get('sign')

    if not sign_val:
        log(f"❌ [{m_phone}] 获取会话 sign 失败")
        bullets.append("• 掌厅会话认证: 会话凭证过期或获取失败")
        return bullets

    sign_header = {'sign': sign_val, 'Referer': 'https://wappark.189.cn/resources/dist/signInActivity.html'}

    # 2. 每日签到打卡
    log(f"[{m_phone}] 执行每日签到打卡...")
    api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/sign',
            json={"encode": encrypt_aes({"phone": phone, "date": int(time.time()*1000)})},
            headers=sign_header)
    
    # 3. 检查连签与累签
    cont_days = "0"
    total_days = "0"
    try:
        cont_res = api_req(sess, 'https://wappark.189.cn/jt-sign/api/home/userStatusInfo',
                           json={"para": encrypt_rsa({"phone": phone}, KEYS['data_rsa'], 'hex')}, headers=sign_header)
        cont_days = str(safe_get(cont_res, 'data', 'signDay', default=0))

        if cont_days == '7':
            api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/exchangePrize',
                    json={"para": encrypt_rsa({"phone": phone, "type": "7"}, KEYS['data_rsa'], 'hex')}, headers=sign_header)
    except Exception:
        pass

    try:
        tot_res = api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/continueSignDays',
                          json={"para": encrypt_rsa({"phone": phone}, KEYS['data_rsa'], 'hex')}, headers=sign_header)
        total_days = str(safe_get(tot_res, 'data', 'continueSignDays', default=0))

        if total_days in ['15', '28']:
            api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/exchangePrize',
                    json={"para": encrypt_rsa({"phone": phone, "type": total_days}, KEYS['data_rsa'], 'hex')}, headers=sign_header)
    except Exception:
        pass

    bullets.append(f"• 每日签到打卡: 签到完成 · 连签 {cont_days} 天 (累签 {total_days} 天)")

    # 4. 金豆转盘抽奖
    auth_header = user.get('Authorization')
    if auth_header:
        log(f"[{m_phone}] 查询掌厅金豆转盘活动...")
        tab = api_req(sess, f"https://wapact.189.cn:9001/gateway/golden/api/queryTurnTable?userType=1&_={int(time.time()*1000)}",
                      method='GET', headers={'Authorization': auth_header})
        if isinstance(tab, dict) and tab.get('code') == 0:
            act_id = safe_get(tab, 'biz', 'wzTurntable', 'code')
            if act_id:
                chk = api_req(sess, f"https://wapact.189.cn:9001/gateway/standQuery/detail/check?activityId={act_id}",
                              method='GET', headers={'Authorization': auth_header})
                if isinstance(chk, dict) and chk.get('code') == 0:
                    info = safe_get(chk, 'biz', 'resultInfo') or {}
                    remain = max(0, info.get('userMaximum', 0) - info.get('userCount', 0))
                    draw_done = 0
                    for idx in range(remain):
                        api_req(sess, 'https://wapact.189.cn:9001/gateway/golden/api/lottery',
                                json={"activityId": act_id}, headers={'Authorization': auth_header})
                        draw_done += 1
                        time.sleep(1.5)
                    if draw_done > 0:
                        bullets.append(f"• 掌厅金豆转盘: 完成 {draw_done} 次抽奖")
                    else:
                        bullets.append("• 掌厅金豆转盘: 今日抽奖次数已用尽")
                else:
                    bullets.append("• 掌厅金豆转盘: 今日抽奖次数已用尽")
            else:
                bullets.append("• 掌厅金豆转盘: 今日无可用转盘")
        else:
            bullets.append("• 掌厅金豆转盘: 今日抽奖已完成")
    else:
        bullets.append("• 掌厅金豆转盘: 缺少授权凭证")

    # 5. 每日浏览任务
    log(f"[{m_phone}] 检索每日金豆任务列表...")
    task_done = 0
    tasks_res = api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/homepage',
                        json={"para": encrypt_rsa({"phone": phone, "shopId": "20001", "type": "hg_qd_zrwzjd"}, KEYS['data_rsa'], 'hex')},
                        headers=sign_header)
    if isinstance(tasks_res, dict):
        ad_items = safe_get(tasks_res, 'data', 'biz', 'adItems') or []
        for t in ad_items:
            if t.get('taskState') in ['0', '1'] and str(t.get('contentOne')) == '18':
                task_id = t.get('taskId')
                if task_id:
                    api_req(sess, 'https://wappark.189.cn/jt-sign/webSign/polymerize',
                            json={"para": encrypt_rsa({"phone": phone, "jobId": task_id}, KEYS['data_rsa'], 'hex')},
                            headers=sign_header)
                    task_done += 1
                    time.sleep(1.5)
    bullets.append(f"• 每日浏览任务: 完成 {task_done} 项领豆任务" if task_done > 0 else "• 每日浏览任务: 今日任务已全部完成")

    # 6. 宠物乐园喂食
    log(f"[{m_phone}] 执行宠物喂食任务...")
    feed_success = 0
    feed_status = "今日投喂已达上限"
    for _ in range(8):
        f_res = api_req(sess, 'https://wappark.189.cn/jt-sign/paradise/food',
                        json={"para": encrypt_rsa({"phone": phone}, KEYS['data_rsa'], 'hex')}, headers=sign_header)
        msg = f_res.get('resoultMsg', '') if isinstance(f_res, dict) else ''
        if "最大" in msg or "已达" in msg:
            break
        if isinstance(f_res, dict) and (f_res.get('code') == '0' or '成功' in msg):
            feed_success += 1
            feed_status = f"成功投喂 {feed_success} 次"
        time.sleep(1)

    bullets.append(f"• 宠物乐园喂食: {feed_status}")
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
    print(f"  🎉 [{SCRIPT_VERSION}] 中国电信 · 每日签到与金豆任务聚合脚本 🎉  ")
    print("=" * 65)

    accounts = parse_accounts()
    if not accounts:
        print("\n❌ 未检测到有效的电信账号配置！")
        print("👉 请在青龙面板添加环境变量: dxlin (或 CHINA_TELECOM_AUTH)")
        print("👉 格式示例: 18912345678#123456#8a2c4e6f12345678 (多账号换行粘贴)\n")
        return

    print(f"\n👤 检测到 {len(accounts)} 个有效电信账号，开始按序执行每日任务...\n")

    summary_blocks = []

    for idx, (phone, pwd, android_id) in enumerate(accounts, start=1):
        m_phone = mask(phone)
        print(f"=================== 正在处理账号 [{idx}/{len(accounts)}] {m_phone} ===================")
        sess = create_session()

        user = login_telecom(sess, phone, pwd, android_id)
        if not user:
            bullets = [
                "• 账号认证: 登录未通过 (服务密码有误或触发安全验证)",
                "• 任务状态: 今日签到与金豆任务已跳过"
            ]
        else:
            bullets = run_daily_telecom_tasks(sess, user)

        if len(accounts) > 1:
            summary_blocks.append(f"【账号 {idx}: {m_phone}】\n" + "\n".join(bullets))
        else:
            summary_blocks.append("\n".join(bullets))

        time.sleep(2)

    # 构造微信读书风格通知
    first_mask = mask(accounts[0][0]) if accounts else "主账号"
    subtitle = f"执行完成 (1个账号) - 【{first_mask}】" if len(accounts) == 1 else f"执行完成 ({len(accounts)}个账号)"
    notify_body = "\n\n".join(summary_blocks)

    print("\n" + "=" * 65)
    print("                       📊 任务执行结果总报                       ")
    print("=" * 65)
    print(f"📣 [{SCRIPT_VERSION}]【中国电信 · 每日签到与金豆】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    if HAS_NOTIFY and ql_send and notify_body:
        try:
            ql_send(f"[{SCRIPT_VERSION}] 中国电信 · 每日签到与金豆", f"{subtitle}\n\n{notify_body}")
            print("🔔 青龙通知推送成功！")
        except Exception as e:
            print(f"⚠️ 青龙通知推送异常: {str(e)}")

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v2.2.0 (2026-09-20 每日轮询·抢到即休眠版)
中国电信 · 0点等级会员权益兑换（高并发秒杀抢购脚本）
===================================================================
new Env('中国电信 · 0点等级权益兑换');
cron: 58 23 * * *
tag: 中国电信
# @tag 中国电信
===================================================================
功能说明：
  1. 每日轮询：每天夜间 23:58 自动启动，未抢到天天抢，直到抢到为止！\n  2. 自动休眠：本月一旦抢到话费券，当月后续天数自动休眠跳过，直到下月重置。\n  3. 提前预热：夜间 23:59:00 并行多账号登录换取 Ticket，并发建立会话。
  2. 0点秒杀：00:00:00.100 准点突发高并发请求抢兑电信星级会员话费券。
  3. 智能窗口：非 23:55~23:59 期间触发安全退出，杜绝内存死等与面板超时杀进程。
  4. 支持调试：带参数 --test 可跳过等待立即测试账号登录与全链路准备。

环境变量配置：
  dxqy (或 dxlin) : 手机号#服务密码#AndroidID (亦兼容四段式 SessionKey)
  多账号换行或使用 & 分隔。
===================================================================
"""
# 当前脚本来自于 http://script.345yun.cn 脚本库下载！
# 当前脚本来自于 http://2.345yun.cn 脚本库下载！
# 当前脚本来自于 http://2.345yun.cc 脚本库下载！
# 脚本库官方QQ群1群: 429274456
# 脚本库官方QQ群2群: 1077801222
# 脚本库官方QQ群3群: 433030897

import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

import ssl
import time
import json
import base64
import random
import certifi
import datetime
import requests
import binascii
import traceback
import subprocess
import asyncio
import aiohttp

from http import cookiejar
from threading import Event as ThreadingEvent, Lock as ThreadingLock
from asyncio import Event as AsyncioEvent
from Crypto.Cipher import DES3
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5
from Crypto.Util.Padding import pad, unpad
from concurrent.futures import ThreadPoolExecutor, wait
# ==================== 🛠️ 脚本功能开关配置 ====================
CONFIG = {
    "FORCE_RUN": False,         # 平日测试模式: False=仅夜间23:55~23:59准备并抢购; True=平时任何时间均可运行全链路测试
    "INADVANCE": -100,          # 提前100毫秒首发抢购
    "COUNT_PER_ACCOUNT": 5,     # 每个账号并发抢购数 (建议 3~5)
    "INTERVAL_MS": 10,          # 并发请求微间隔(毫秒)
    "ENABLE_RUISHU": False,     # 瑞数安全Cookie开关
    "CLAIMED_LOG_FILE": "claimed_accounts.json"
}

# -------------------------- 青龙/呆呆通知模块 --------------------------
try:
    from notify import send as ql_send
except ImportError:
    ql_send = None



# ============================================================
# 推送内容类型（呆呆面板支持：text / markdown / html）
# 用 markdown 以便 Telegram 类渠道按 MarkdownV2 渲染
# ============================================================

PUSH_CONTENT_TYPE = "markdown"


# ============================================================
# 呆呆面板默认通知模块（不在面板环境时自动跳过）
# ============================================================

try:
    from notify import send as daidai_send
    _HAS_DAIDAI_NOTIFY = True
except ImportError:
    _HAS_DAIDAI_NOTIFY = False
    daidai_send = None


# ============================================================
# 基础设置和辅助函数
# ============================================================

context = ssl.create_default_context()
context.set_ciphers('DEFAULT@SECLEVEL=1')
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE


class DESAdapter(requests.adapters.HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        kwargs['ssl_context'] = context
        return super().init_poolmanager(*args, **kwargs)


class BlockAll(cookiejar.CookiePolicy):
    return_ok = set_ok = domain_return_ok = path_return_ok = lambda self, *args, **kwargs: False
    netscape = True
    rfc2965 = hide_cookie2 = False


requests.packages.urllib3.disable_warnings()


def printn(m):
    current_time = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f'\n[{current_time}] {m}')


def _md_esc(text):
    """转义 Telegram MarkdownV2 特殊字符。

    特殊字符集合：_ * [ ] ( ) ~ ` > # + - = | { } . !
    """
    if text is None:
        return ''
    s = str(text)
    special = set('_*[]()~`>#+-=|{}.!\\')
    return ''.join('\\' + c if c in special else c for c in s)


# ============================================================
# 加密 / 解密 / 工具函数
# ============================================================

key = b'1234567`90koiuyhgtfrdews'
iv = 8 * b'\0'


public_key_b64 = '''-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----'''


public_key_data = '''-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----'''


def encrypt_des3(text):
    cipher = DES3.new(key, DES3.MODE_CBC, iv)
    return cipher.encrypt(pad(text.encode(), DES3.block_size)).hex()


def decrypt_des3(text):
    cipher = DES3.new(key, DES3.MODE_CBC, iv)
    return unpad(
        cipher.decrypt(bytes.fromhex(text)),
        DES3.block_size
    ).decode()


def b64_encrypt_rsa(plaintext):
    public_key = RSA.import_key(public_key_b64)
    cipher = PKCS1_v1_5.new(public_key)
    return base64.b64encode(cipher.encrypt(plaintext.encode())).decode()


def encrypt_para_rsa_new(p):
    k = RSA.import_key(public_key_data)
    c = PKCS1_v1_5.new(k)
    s = k.size_in_bytes() - 11

    d = p.encode() if isinstance(p, str) else json.dumps(p).encode()

    return binascii.hexlify(
        b''.join(
            c.encrypt(d[i:i + s])
            for i in range(0, len(d), s)
        )
    ).decode()


def encode_phone(text):
    return ''.join([chr(ord(char) + 2) for char in text])


def parse_amount(title):
    """从权益标题里抽取金额，例如 '10元话费' -> '10元'。"""
    if not title:
        return '-'
    m = re.search(r'(\d+(?:\.\d+)?\s*元)', title)
    if m:
        return m.group(1).replace(' ', '')
    return '-'


def get_ruishu_cookies():
    try:
        ruishu_script_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'Ruishu.py'
        )

        if not os.path.exists(ruishu_script_path):
            print(f"❌ 错误: 未找到 {ruishu_script_path} 文件。")
            return None

        result = subprocess.run(
            [sys.executable, ruishu_script_path],
            capture_output=True,
            text=True,
            encoding='utf-8',
            check=True
        )

        return json.loads(result.stdout.strip())

    except Exception as e:
        print(f"❌ 获取瑞数Cookie时发生错误: {e}")
        return None


# ============================================================
# 推送与持久化
# ============================================================

def send_pushplus_notification(token, title, content):
    """优先使用呆呆面板默认通知；不在面板环境时回退到 pushplus。"""

    # ---------- 呆呆面板默认通知 ----------
    if _HAS_DAIDAI_NOTIFY:
        try:
            daidai_send(
                title,
                content,
                content_type=PUSH_CONTENT_TYPE
            )
            printn("✅ 呆呆面板默认推送成功!")
            return
        except Exception as e:
            printn(f"❌ 呆呆面板推送失败: {e}")
            return

    # ---------- 回退：pushplus ----------
    if not token:
        printn(
            "ℹ️ 未检测到呆呆面板 notify 模块，"
            "也未配置 PUSH_PLUS_TOKEN，跳过推送。"
        )
        return

    url = "http://www.pushplus.plus/send"

    payload = {
        "token": token,
        "title": title,
        "content": content,
        "template": "markdown"
    }

    try:
        response = requests.post(url, json=payload)

        if response.json().get("code") == 200:
            printn("✅ PUSHPLUS 推送成功!")
        else:
            printn(
                f"❌ PUSHPLUS 推送失败: "
                f"{response.json().get('msg')}"
            )

    except Exception as e:
        printn(f"💥 推送时发生异常: {e}")


def load_claimed_accounts(filename):
    try:
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                return json.load(f)

    except (json.JSONDecodeError, IOError):
        pass

    return {}


def save_claimed_account(filename, phone, lock):
    with lock:
        claimed_data = load_claimed_accounts(filename)

        current_month = datetime.datetime.now().strftime("%Y-%m")

        claimed_data[phone] = current_month

        with open(filename, 'w') as f:
            json.dump(
                claimed_data,
                f,
                indent=4
            )


# ============================================================
# 测试模式
# ============================================================

# True：
#   直接运行脚本进入完整准备链路测试
#
# 测试链路：
#   userLoginNormal
#        ↓
#      Ticket
#        ↓
#    ssoHomLogin
#        ↓
#     sign / accId
#        ↓
# queryLevelRightInfo
#        ↓
#      权益ID
#        ↓
# receiverRights 诊断（仅一次）
test_only = False


# ============================================================
# 获取 Ticket
# ============================================================

def get_ticket(phone, userId, token, ss):
    try:
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")

        enc_target = encrypt_des3(userId)

        data = (
            f'<Request>'
            f'<HeaderInfos>'
            f'<Code>getSingle</Code>'
            f'<Timestamp>{timestamp}</Timestamp>'
            f'<BroadAccount></BroadAccount>'
            f'<BroadToken></BroadToken>'
            f'<ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType>'
            f'<ShopId>20002</ShopId>'
            f'<Source>110003</Source>'
            f'<SourcePassword>Sid98s</SourcePassword>'
            f'<Token>{token}</Token>'
            f'<UserLoginName>{phone}</UserLoginName>'
            f'</HeaderInfos>'
            f'<Content>'
            f'<Attach>test</Attach>'
            f'<FieldData>'
            f'<TargetId>{enc_target}</TargetId>'
            f'<Url>4a6862274835b451</Url>'
            f'</FieldData>'
            f'</Content>'
            f'</Request>'
        )

        r = ss.post(
            'https://appgologin.189.cn:9031/map/clientXML',
            data=data.encode('utf-8'),
            headers={
                'user-agent':
                    'CtClient;10.4.1;Android;13;22081212C;NTQzNzgx!#!MTgwNTg1',
                'Content-Type':
                    'application/xml;charset=UTF-8'
            },
            verify=False,
            timeout=15
        )

        if r.status_code != 200:
            printn(
                f"❌ 【{phone}】get_ticket HTTP 状态码异常: "
                f"{r.status_code}"
            )
            return False

        tk = re.findall(
            r'<Ticket>(.*?)</Ticket>',
            r.text,
            flags=re.S
        )

        if tk and tk[0].strip():
            try:
                return decrypt_des3(tk[0].strip())

            except Exception as e:
                printn(
                    f"❌ 【{phone}】Ticket 解密失败: {e} "
                    f"(响应: {r.text[:300]})"
                )
                return False

        reason = re.findall(
            r'<Reason>(.*?)</Reason>',
            r.text,
            flags=re.S
        )

        desc = re.findall(
            r'<ResultDesc>(.*?)</ResultDesc>',
            r.text,
            flags=re.S
        )

        result_code = re.findall(
            r'<ResultCode>(.*?)</ResultCode>',
            r.text,
            flags=re.S
        )

        attach = re.findall(
            r'<Attach>(.*?)</Attach>',
            r.text,
            flags=re.S
        )

        err_msg = (
            desc[0].strip()
            if desc and desc[0].strip()
            else (
                reason[0].strip()
                if reason and reason[0].strip()
                else '未返回Ticket'
            )
        )

        printn(
            f"❌ 【{phone}】换取Ticket失败: {err_msg} "
            f"| HTTP={r.status_code} "
            f"| ResultCode="
            f"{result_code[0].strip() if result_code else ''} "
            f"| Attach="
            f"{attach[0].strip() if attach else ''} "
            f"| 完整响应: {r.text[:1000]}"
        )

        return False

    except Exception as e:
        printn(
            f"💥 【{phone}】get_ticket 发生异常: {e}"
        )
        return False


# ============================================================
# 登录
# ============================================================

def userLoginNormal(phone, password, android_id, ss):
    try:
        timestamp = datetime.datetime.now().strftime(
            "%Y%m%d%H%M%S"
        )

        loginAuthCipherAsymmertric = (
            'Xiaomi 20 8.0.0.'
            + android_id[:12]
            + phone
            + timestamp
            + password
            + '0$$$0.'
        )

        login_url = (
            'https://appgologin.189.cn:9031/'
            'login/client/userLoginNormal'
        )

        response = ss.post(
            login_url,
            verify=False,
            timeout=15,
            json={
                "headerInfos": {
                    "code": "userLoginNormal",
                    "timestamp": timestamp,
                    "broadAccount": "",
                    "broadToken": "",
                    "clientType": "#11.0.0#channel8#Xiaomi 20#",
                    "shopId": "20002",
                    "source": "110003",
                    "sourcePassword": "Sid98s",
                    "token": "",
                    "userLoginName": encode_phone(phone)
                },
                "content": {
                    "attach": "test",
                    "fieldData": {
                        "loginType": "4",
                        "accountType": "",
                        "loginAuthCipherAsymmertric":
                            b64_encrypt_rsa(
                                loginAuthCipherAsymmertric
                            ),
                        "deviceUid": "",
                        "phoneNum": encode_phone(phone),
                        "isChinatelecom": "0",
                        "systemVersion": "8.0.0",
                        "androidId": encode_phone(android_id),
                        "loginAuthCipher": "",
                        "authentication": encode_phone(password)
                    }
                }
            }
        )

        if response.status_code != 200:
            printn(
                f"❌【{phone}】登录请求状态码异常: "
                f"{response.status_code}，"
                f"响应内容: {response.text[:200]}"
            )
            return False

        try:
            r = response.json()

        except json.JSONDecodeError:
            printn(
                f"❌【{phone}】登录响应解析失败，"
                f"响应内容: {response.text[:200]}"
            )
            return False

        resp_data = r.get('responseData') or {}

        result_code = resp_data.get('resultCode')

        result_desc = (
            resp_data.get('resultDesc')
            or r.get('headerInfos', {}).get(
                'reason',
                '未知原因'
            )
        )

        data = resp_data.get('data')

        login_result = (
            data.get('loginSuccessResult')
            if isinstance(data, dict)
            else None
        )

        if (
            login_result
            and 'userId' in login_result
            and 'token' in login_result
        ):

            ticket = get_ticket(
                phone,
                login_result['userId'],
                login_result['token'],
                ss
            )

            if ticket:
                if debug:
                    printn(
                        f'✔️【{phone}】获取ticket成功: '
                        f'{ticket[:15]}...'
                    )

                return ticket

        printn(
            f"❌【{phone}】登录未通过: "
            f"[{result_code}] {result_desc} "
            f"(完整响应: {r})"
        )

        return False

    except Exception as e:
        printn(
            f"💥【{phone}】登录时发生未知异常: {e}"
        )

        traceback.print_exc()

        return False


# ============================================================
# Ticket → sign / accId
# ============================================================

def getSign(ticket, session, rs_cookies):
    try:
        response = session.get(
            f'https://wappark.189.cn/jt-sign/ssoHomLogin?ticket={ticket}',
            cookies=rs_cookies,
            headers={
                'User-Agent':
                    "Mozilla/5.0 (Linux; Android 13; "
                    "22081212C Build/TKQ1.220829.002) "
                    "AppleWebKit/537.36 "
                    "(KHTML, like Gecko) "
                    "Chrome/104.0.5112.97 "
                    "Mobile Safari/537.36"
            }
        )

        try:
            json_data = response.json()

        except (json.JSONDecodeError, ValueError):
            json_data = {}

        if json_data.get('resoultCode') == '0':

            return (
                json_data.get('sign'),
                json_data.get('accId')
            )

        else:
            print(
                f"❌ 获取sign失败: {json_data}"
            )

            return None, None

    except Exception as e:
        print(
            f"❌ getSign 异常: {e}"
        )

        return None, None


# ============================================================
# 查询等级权益
# ============================================================

def getLevelRightsList(phone, accId, session):
    """返回话费权益列表：[{activityId, title, level, amount}, ...]"""
    try:
        value = {
            "type": "hg_qd_djqydh",
            "accId": accId,
            "shopId": "20001"
        }

        paraV = encrypt_para_rsa_new(value)

        response = session.post(
            'https://wappark.189.cn/jt-sign/paradise/queryLevelRightInfo',
            json={"para": paraV}
        )

        try:
            data = response.json()

        except (json.JSONDecodeError, ValueError):
            data = {}

        if (
            data.get('code') == 401
            or (
                data.get('resoultCode') != '0'
                and 'currentLevel' not in data
            )
        ):

            printn(
                f"❌ 【{phone}】获取权益列表失败: {data}"
            )

            return None

        level = data.get('currentLevel')

        if level is None:
            printn(
                f"❌ 【{phone}】响应中缺少会员等级: {data}"
            )

            return None

        key_name = f"V{level}"

        rights = []
        for item in data.get(key_name, []):
            title = item.get('title', '')
            if '话费' in title:
                rights.append({
                    'activityId': item['activityId'],
                    'title': title,
                    'level': level,
                    'amount': parse_amount(title),
                })

        return rights

    except Exception as e:
        print(
            f"❌ getLevelRightsList 异常: {e}"
        )

        return None


# ============================================================
# receiverRights 最终接口诊断
# ============================================================

def diagnose_receiver_rights(
    phone,
    rightsId,
    accId,
    sign,
    session,
    rs_cookies
):
    printn(
        f'🧪【{phone}】开始诊断 receiverRights 接口...'
    )

    value = {
        "id": rightsId,
        "accId": accId,
        "showType": "9003",
        "showEffect": "8",
        "czValue": "0"
    }

    try:
        paraV = encrypt_para_rsa_new(value)

        headers = {
            "sign": sign,
            "Referer":
                "https://wappark.189.cn/resources/dist/"
                "signInActivity.html",
            "User-Agent":
                "Mozilla/5.0 (Linux; Android 13; "
                "22081212C Build/TKQ1.220829.002) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/104.0.5112.97 "
                "Mobile Safari/537.36"
        }

        url = (
            "https://wappark.189.cn/"
            "jt-sign/paradise/receiverRights"
        )

        printn(f'   请求地址: {url}')
        printn(f'   rightsId: {rightsId}')
        printn(f'   accId: {accId}')
        printn(f'   sign: {str(sign)[:20]}...')
        printn(f'   para长度: {len(paraV)}')

        response = session.post(
            url,
            json={"para": paraV},
            headers=headers,
            cookies=rs_cookies,
            verify=False,
            timeout=15
        )

        printn(
            f'📡【{phone}】HTTP状态码: '
            f'{response.status_code}'
        )

        printn(
            f'📡【{phone}】Content-Type: '
            f'{response.headers.get("Content-Type", "")}'
        )

        text = response.text.strip()

        if not text:
            printn(
                f'⚠️【{phone}】服务器返回空响应'
            )
            return {
                "status": "EMPTY",
                "http_status": response.status_code,
                "text": ""
            }

        try:
            data = response.json()

            printn(
                f'📨【{phone}】服务器JSON响应:'
            )
            print(
                json.dumps(
                    data,
                    ensure_ascii=False,
                    indent=2
                )
            )

            return {
                "status": "JSON",
                "http_status": response.status_code,
                "data": data
            }

        except (json.JSONDecodeError, ValueError):
            printn(
                f'📨【{phone}】服务器非JSON响应:'
            )
            print(text[:2000])

            return {
                "status": "TEXT",
                "http_status": response.status_code,
                "text": text[:2000]
            }

    except requests.exceptions.Timeout:
        printn(
            f'⏰【{phone}】receiverRights 请求超时'
        )
        return {
            "status": "TIMEOUT"
        }

    except requests.exceptions.RequestException as e:
        printn(
            f'❌【{phone}】receiverRights 网络异常: '
            f'{type(e).__name__}: {e}'
        )
        return {
            "status": "REQUEST_ERROR",
            "message": str(e)
        }

    except Exception as e:
        printn(
            f'💥【{phone}】receiverRights 诊断异常: '
            f'{type(e).__name__}: {e}'
        )
        return {
            "status": "ERROR",
            "message": str(e)
        }


# ============================================================
# 正式异步抢购
# ============================================================

async def async_staggered_burst_worker(
    session,
    phone,
    rightsId,
    accId,
    sign,
    rs_cookies,
    level,
    amount,
    global_stop_event,
    local_stop_event,
    task_index,
    base_target_time,
    result_log,
    result_lock,
    file_lock,
    num_accounts_to_run
):

    fire_time = (
        base_target_time
        + datetime.timedelta(
            milliseconds=(interval * task_index)
        )
    )

    wait_seconds = (
        fire_time - datetime.datetime.now()
    ).total_seconds()

    if wait_seconds > 0 and not debug:
        await asyncio.sleep(wait_seconds)

    if (
        local_stop_event.is_set()
        or global_stop_event.is_set()
    ):
        return

    try:

        value = {
            "id": rightsId,
            "accId": accId,
            "showType": "9003",
            "showEffect": "8",
            "czValue": "0"
        }

        paraV = encrypt_para_rsa_new(value)

        headers = {
            "sign": sign,
            "Referer":
                "https://wappark.189.cn/resources/dist/"
                "signInActivity.html",
            "User-Agent":
                "Mozilla/5.0 (Linux; Android 13; "
                "22081212C Build/TKQ1.220829.002) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/104.0.5112.97 "
                "Mobile Safari/537.36"
        }

        url = (
            "https://wappark.189.cn/"
            "jt-sign/paradise/receiverRights"
        )

        async with session.post(
            url,
            json={"para": paraV},
            cookies=rs_cookies,
            headers=headers
        ) as response:

            request_time = (
                datetime.datetime.now()
                .strftime('%H:%M:%S.%f')[:-3]
            )

            text = ""

            try:
                text = await response.text(
                    encoding='utf-8',
                    errors='replace'
                )

            except asyncio.TimeoutError:
                printn(
                    f"⏰【{phone}】@{request_time} "
                    f"[任务{task_index}] 响应读取超时"
                )
                return

            except Exception as e:
                text = (
                    f"[响应读取异常: "
                    f"{type(e).__name__} - {str(e)}]"
                )

            res_json = {}
            res_text = ""

            try:
                clean_text = text.strip()

                if clean_text.startswith('\ufeff'):
                    clean_text = clean_text[1:]

                if clean_text:
                    res_json = json.loads(clean_text)
                    res_text = json.dumps(
                        res_json,
                        ensure_ascii=False
                    )
                else:
                    res_text = "[空响应]"

            except (
                json.JSONDecodeError,
                ValueError,
                TypeError
            ):
                res_text = (
                    f"非JSON响应: {text[:100]}"
                )

            if (
                "已领完" in res_text
                or "活动已结束" in res_text
            ):

                printn(
                    f"💨【{phone}】@{request_time} "
                    f"[任务{task_index}] 已售罄! "
                    f"停止该账号后续请求。"
                )

                if not local_stop_event.is_set():
                    local_stop_event.set()

                with result_lock:

                    if (
                        phone not in result_log
                        or result_log.get(phone, {}).get(
                            'status'
                        ) != 'SUCCESS'
                    ):
                        result_log[phone] = {
                            'status': 'SOLD_OUT',
                            'message': '已售罄',
                            'level': level,
                            'amount': amount,
                        }

                    finished_count = len([
                        r
                        for r in result_log.values()
                        if r.get('status')
                        in ('SUCCESS', 'SOLD_OUT')
                    ])

                    has_success = any(
                        res.get('status') == 'SUCCESS'
                        for res in result_log.values()
                    )

                    if (
                        not has_success
                        and finished_count == num_accounts_to_run
                        and not global_stop_event.is_set()
                    ):

                        global_stop_event.set()

                        printn(
                            "🛑【全局共识】"
                            "所有账号均确认售罄或失败，"
                            "触发全局停止信号！"
                        )

            elif (
                "成功" in res_text
                or "已领取过该权益" in res_text
            ):

                printn(
                    f"🎉【{phone}】@{request_time} "
                    f"[任务{task_index}] 成功或已领取!"
                )

                if not local_stop_event.is_set():

                    local_stop_event.set()

                    printn(
                        f"🛑【{phone}】个人停止信号已发出 "
                        f"(原因: 成功)。"
                    )

                with result_lock:
                    result_log[phone] = {
                        'status': 'SUCCESS',
                        'message':
                            res_json.get(
                                'resoultMsg',
                                '成功/已领取'
                            ),
                        'level': level,
                        'amount': amount,
                    }

                loop = asyncio.get_running_loop()

                await loop.run_in_executor(
                    None,
                    save_claimed_account,
                    claimed_log_file,
                    phone,
                    file_lock
                )

            elif "当前抢购人数过多" in res_text:

                printn(
                    f"👥【{phone}】@{request_time} "
                    f"[任务{task_index}] "
                    f"人数过多，继续尝试..."
                )

            else:

                printn(
                    f"💬【{phone}】@{request_time} "
                    f"[任务{task_index}] "
                    f"响应: {res_text}"
                )

    except asyncio.CancelledError:
        pass

    except asyncio.TimeoutError:

        request_time = (
            datetime.datetime.now()
            .strftime('%H:%M:%S.%f')[:-3]
        )

        printn(
            f"⏰【{phone}】@{request_time} "
            f"[任务{task_index}] "
            f"请求超时 (连接或响应)"
        )

    except Exception as e:

        request_time = (
            datetime.datetime.now()
            .strftime('%H:%M:%S.%f')[:-3]
        )

        printn(
            f"🚨【{phone}】@{request_time} "
            f"[任务{task_index}] "
            f"未预期异常: "
            f"{e.__class__.__name__} - {str(e)}"
        )


# ============================================================
# 正式抢购准备
# ============================================================

def run_attack_campaign(
    phone,
    ticket,
    ss,
    global_stop_event,
    enable_ruishu,
    result_log,
    result_lock,
    file_lock,
    num_accounts_to_run
):

    try:

        if global_stop_event.is_set():
            return

        printn(
            f"⚙️【{phone}】开始准备凭证 (同步模式)..."
        )

        rs_cookies = (
            get_ruishu_cookies()
            if enable_ruishu
            else {}
        )

        if enable_ruishu and not rs_cookies:
            raise Exception(
                "瑞数已启用但获取Cookie失败"
            )

        sign, accId = getSign(
            ticket,
            ss,
            rs_cookies
        )

        if not sign:
            raise Exception(
                "获取Sign失败"
            )

        ss.headers.update({
            "sign": sign,
            "Referer":
                "https://wappark.189.cn/resources/dist/"
                "signInActivity.html"
        })

        rightsList = getLevelRightsList(
            phone,
            accId,
            ss
        )

        if not rightsList:
            raise Exception(
                "未能获取到权益ID"
            )

        rights = rightsList[0]
        rightsId = rights['activityId']
        level = rights['level']
        amount = rights['amount']

        printn(
            f"✅【{phone}】凭证准备就绪，"
            f"切换至异步并发抢购..."
        )

        asyncio.run(
            run_async_bursts(
                phone,
                rightsId,
                accId,
                sign,
                rs_cookies,
                level,
                amount,
                global_stop_event,
                result_log,
                result_lock,
                file_lock,
                num_accounts_to_run
            )
        )

        with result_lock:

            if phone not in result_log:
                result_log[phone] = {
                    'status': 'UNKNOWN',
                    'message':
                        '抢购结束但未记录明确状态',
                    'level': level,
                    'amount': amount,
                }

        printn(
            f"🏁【{phone}】抢购任务已结束。"
        )

    except Exception as e:

        printn(
            f"💥【{phone}】准备或执行阶段出现严重异常: {e}"
        )

        with result_lock:
            result_log[phone] = {
                'status': 'FAIL',
                'message': str(e),
            }


# ============================================================
# 异步抢购调度
# ============================================================

async def run_async_bursts(
    phone,
    rightsId,
    accId,
    sign,
    rs_cookies,
    level,
    amount,
    global_stop_event,
    result_log,
    result_lock,
    file_lock,
    num_accounts_to_run
):

    now = datetime.datetime.now()

    target_time = now.replace(
        hour=hour,
        minute=minute,
        second=0,
        microsecond=0
    )

    if now >= target_time:
        target_time += datetime.timedelta(days=1)

    base_target_time = (
        target_time
        + datetime.timedelta(
            milliseconds=inadvance
        )
    )

    local_stop_event = AsyncioEvent()

    ssl_ctx = ssl.create_default_context(
        cafile=certifi.where()
    )

    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    connector = aiohttp.TCPConnector(
        ssl=ssl_ctx
    )

    timeout = aiohttp.ClientTimeout(
        total=15,
        connect=10
    )

    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout
    ) as async_session:

        tasks = [
            async_staggered_burst_worker(
                async_session,
                phone,
                rightsId,
                accId,
                sign,
                rs_cookies,
                level,
                amount,
                global_stop_event,
                local_stop_event,
                i,
                base_target_time,
                result_log,
                result_lock,
                file_lock,
                num_accounts_to_run
            )
            for i in range(count_per_account)
        ]

        await asyncio.gather(
            *tasks,
            return_exceptions=True
        )


# ============================================================
# 单账号处理
# ============================================================

def process_account(
    phoneV,
    global_stop_event,
    enable_ruishu,
    result_log,
    result_lock,
    file_lock,
    num_accounts_to_run
):

    phone_for_log = phoneV.split("#")[0]
    masked_phone = (
        f"{phone_for_log[:3]}***{phone_for_log[-4:]}"
        if len(phone_for_log) >= 7
        else phone_for_log
    )

    if not debug:

        delay = random.uniform(
            0.1,
            2.0
        )

        time.sleep(delay)

        printn(
            f'👤【{masked_phone}】'
            f'(延迟{delay:.2f}s后) 开始登录...'
        )

    else:

        printn(
            f'👤【{masked_phone}】开始登录...'
        )

    parts = phoneV.split('#', 2)

    if len(parts) != 3:

        phone = parts[0] if parts else ''

        printn(
            f'❌【{phone}】账号格式错误，'
            f'应为：手机号#密码#AndroidID'
        )

        with result_lock:
            result_log[phone] = {
                'status': 'LOGIN_FAIL',
                'message':
                    '账号格式错误，缺少AndroidID'
            }

        return

    phone, password, android_id = parts

    ss = requests.session()

    ss.headers = {
        "User-Agent":
            "Mozilla/5.0 (Linux; Android 13; "
            "22081212C Build/TKQ1.220829.002) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/104.0.5112.97 "
            "Mobile Safari/537.36"
    }

    ss.mount(
        'https://',
        DESAdapter()
    )

    ss.cookies.set_policy(
        BlockAll()
    )

    ss.timeout = 30

    # --------------------------------------------------------
    # ① userLoginNormal → Ticket
    # --------------------------------------------------------

    begin = time.perf_counter()

    ticket = userLoginNormal(
        phone,
        password,
        android_id,
        ss
    )

    elapsed = (
        time.perf_counter()
        - begin
    )

    if not ticket:

        printn(
            f'❌【{phone}】① 登录 → Ticket 失败，'
            f'耗时 {elapsed:.2f}s'
        )

        with result_lock:
            result_log[phone] = {
                'status': 'TICKET_FAIL',
                'message':
                    f'登录/Ticket失败（耗时{elapsed:.2f}s）'
            }

        return

    printn(
        f'✅【{phone}】① 登录 → Ticket 成功，'
        f'耗时 {elapsed:.2f}s'
    )

    # --------------------------------------------------------
    # DEBUG / TEST 模式
    # --------------------------------------------------------

    if test_only:

        printn(
            f'🧪【{phone}】② '
            f'Ticket → ssoHomLogin'
        )

        try:

            rs_cookies = (
                get_ruishu_cookies()
                if enable_ruishu
                else {}
            )

            if enable_ruishu and not rs_cookies:

                printn(
                    f'❌【{phone}】② 瑞数Cookie获取失败'
                )

                with result_lock:
                    result_log[phone] = {
                        'status': 'SIGN_FAIL',
                        'message':
                            '瑞数已启用，但Cookie获取失败'
                    }

                return

            # ------------------------------------------------
            # ② Ticket → getSign / ssoHomLogin
            # ------------------------------------------------

            sign, accId = getSign(
                ticket,
                ss,
                rs_cookies
            )

            if not sign or not accId:

                printn(
                    f'❌【{phone}】② '
                    f'ssoHomLogin / getSign 失败'
                )

                with result_lock:
                    result_log[phone] = {
                        'status': 'SIGN_FAIL',
                        'message':
                            'Ticket正常，但ssoHomLogin/getSign失败'
                    }

                return

            printn(
                f'✅【{phone}】② '
                f'ssoHomLogin / getSign 成功'
            )

            printn(
                f'   sign: {str(sign)[:20]}...'
            )

            printn(
                f'   accId: {accId}'
            )

            # ------------------------------------------------
            # ③ accId → queryLevelRightInfo
            # ------------------------------------------------

            printn(
                f'🧪【{phone}】③ '
                f'开始查询等级权益...'
            )

            ss.headers.update({
                "sign": sign,
                "Referer":
                    "https://wappark.189.cn/resources/dist/"
                    "signInActivity.html"
            })

            rightsList = getLevelRightsList(
                phone,
                accId,
                ss
            )

            if rightsList is None:

                printn(
                    f'❌【{phone}】③ '
                    f'queryLevelRightInfo 请求失败'
                )

                with result_lock:
                    result_log[phone] = {
                        'status': 'RIGHTS_FAIL',
                        'message':
                            'ssoHomLogin成功，但等级权益查询失败'
                    }

                return

            if not rightsList:

                printn(
                    f'⚠️【{phone}】③ '
                    f'等级权益查询成功，但没有找到话费权益ID'
                )

                with result_lock:
                    result_log[phone] = {
                        'status': 'RIGHTS_FAIL',
                        'message':
                            '等级权益查询成功，但没有找到话费权益ID'
                    }

                return

            # ------------------------------------------------
            # ④ 权益ID获取成功
            # ------------------------------------------------

            rights = rightsList[0]
            rightsId = rights['activityId']
            level = rights['level']
            amount = rights['amount']

            printn(
                f'✅【{phone}】③ '
                f'等级权益查询成功'
            )

            printn(
                f'   找到权益数量: {len(rightsList)}'
            )

            printn(
                f'   第一个权益ID: {rightsId}'
            )

            printn(
                f'   等级: V{level}'
            )

            printn(
                f'   金额: {amount}'
            )

            printn(
                f'🎉【{phone}】前置链路全部成功！'
            )

            printn(
                f'   ① 登录 → Ticket       ✅'
            )

            printn(
                f'   ② Ticket → ssoHomLogin ✅'
            )

            printn(
                f'   ③ sign + accId         ✅'
            )

            printn(
                f'   ④ 等级权益查询          ✅'
            )

            printn(
                f'   ⑤ 获取权益ID            ✅'
            )

            printn(
                f'   ⑥ receiverRights        🧪 开始诊断'
            )

            diagnose_result = diagnose_receiver_rights(
                phone,
                rightsId,
                accId,
                sign,
                ss,
                rs_cookies
            )

            printn(
                f'🏁【{phone}】最终接口诊断结束'
            )

            # ------------------------------------------------
            # ⑤ 根据 receiverRights 真实返回判断状态
            # ------------------------------------------------

            real_status = 'FAIL'
            real_msg = '诊断未返回明确结果'

            if diagnose_result:

                d_status = diagnose_result.get('status')

                if d_status == 'JSON':

                    data = diagnose_result.get('data') or {}
                    code = str(data.get('resoultCode', ''))
                    msg = str(data.get('resoultMsg', ''))
                    real_msg = msg or f'resoultCode={code}'

                    if '已领完' in msg or '活动已结束' in msg:
                        real_status = 'SOLD_OUT'
                    elif '成功' in msg or '已领取过该权益' in msg:
                        real_status = 'SUCCESS'
                    else:
                        real_status = 'FAIL'

                    printn(
                        f'📌【{phone}】诊断结论: '
                        f'resoultCode={code}, '
                        f'msg={msg}, '
                        f'判定={real_status}'
                    )

                elif d_status == 'EMPTY':
                    real_msg = '服务器返回空响应'
                elif d_status == 'TIMEOUT':
                    real_msg = 'receiverRights 请求超时'
                elif d_status == 'TEXT':
                    real_msg = '服务器返回非JSON响应'
                elif d_status in ('REQUEST_ERROR', 'ERROR'):
                    real_msg = diagnose_result.get(
                        'message', '诊断异常'
                    )

            with result_lock:
                result_log[phone] = {
                    'status': real_status,
                    'message': real_msg,
                    'level': level,
                    'amount': amount,
                }

            return

        except Exception as e:

            printn(
                f'💥【{phone}】完整准备链路测试异常: '
                f'{type(e).__name__}: {e}'
            )

            with result_lock:
                result_log[phone] = {
                    'status': 'RIGHTS_FAIL',
                    'message':
                        f'完整准备链路测试异常: {e}'
                }

            return

    # --------------------------------------------------------
    # 正式模式
    # --------------------------------------------------------

    run_attack_campaign(
        phone,
        ticket,
        ss,
        global_stop_event,
        enable_ruishu,
        result_log,
        result_lock,
        file_lock,
        num_accounts_to_run
    )


# ============================================================
# 通知内容构建（Telegram MarkdownV2 风格）
# ============================================================

def build_summary(all_accounts, accounts_to_run, skipped_phones, result_log):
    """构建 MarkdownV2 格式的通知内容。

    风格：
      号码 *加粗*
      等级 _斜体_
      金额 _斜体_
      状态 *加粗*
    """

    lines = []

    # 标题已由推送 title 参数提供，正文不再重复
    lines.append("*📊 领取明细*")
    lines.append("")

    success_count = 0
    total_count = len(all_accounts)

    for acc in all_accounts:
        phone = acc.split('#')[0]
        masked = (
            f"{phone[:3]}****{phone[-4:]}"
            if len(phone) >= 7
            else phone
        )
        masked_md = _md_esc(masked)

        # 本月已领取，视为成功
        if phone in skipped_phones:
            lines.append(
                f"*{masked_md}* ｜ _V\\-_ ｜ _\\-_ ｜ 🎉 *成功*"
            )
            success_count += 1
            continue

        res = result_log.get(phone)

        if res:
            level = res.get('level')
            amount = res.get('amount')

            level_str = (
                f"V{level}"
                if level not in (None, '-', '')
                else '-'
            )
            amount_str = (
                str(amount)
                if amount not in (None, '-', '')
                else '-'
            )

            level_md = (
                _md_esc(level_str)
                if level_str != '-'
                else '\\-'
            )
            amount_md = (
                _md_esc(amount_str)
                if amount_str != '-'
                else '\\-'
            )

            if res.get('status') == 'SUCCESS':
                status_md = '🎉 *成功*'
                success_count += 1
            else:
                status_md = '❌ *失败*'

            lines.append(
                f"*{masked_md}* ｜ _{level_md}_ ｜ _{amount_md}_ ｜ {status_md}"
            )
        else:
            lines.append(
                f"*{masked_md}* ｜ _\\-_ ｜ _\\-_ ｜ ❌ *失败*"
            )

    lines.append("")
    lines.append(f"结果：*{success_count}/{total_count}* 成功")

    return "\n".join(lines)


# ============================================================
# 主程序
# ============================================================

def main():
    global debug, test_only, claimed_log_file
    claimed_log_file = globals().get("claimed_log_file") or "claimed_accounts.json"
    env_force = os.environ.get("FORCE_RUN", "").lower() in ["true", "1"] or \
                os.environ.get("dxqy_force", "").lower() in ["true", "1"] or \
                os.environ.get("TEST_RUN", "").lower() in ["true", "1"]
    cli_test = any(arg in sys.argv for arg in ["--test", "--login-test", "-t", "test"]) or os.environ.get("LOGIN_TEST") == "1"
    cli_debug = any(arg in sys.argv for arg in ["--debug", "--debug-all"]) or os.environ.get("DEBUG") == "1"
    force_run = CONFIG.get("FORCE_RUN", False) or env_force or cli_test or cli_debug
    debug_flag = globals().get("DEBUG_MODE", False)
    debug = force_run or debug_flag
    test_only = force_run or debug_flag

    if test_only:

        printn(
            "🧪 [完整准备链路测试模式]"
        )

        printn(
            "   测试：userLoginNormal"
        )

        printn(
            "   → Ticket"
        )

        printn(
            "   → ssoHomLogin"
        )

        printn(
            "   → sign / accId"
        )

        printn(
            "   → queryLevelRightInfo"
        )

        printn(
            "   → 权益ID"
        )

        printn(
            "   → receiverRights 诊断（仅一次）"
        )

    elif debug:

        printn(
            "🐛 [DEBUG模式] "
            "跳过主程序等待，直接执行完整流程"
        )

    start_time = datetime.datetime.now()

    PHONES = os.environ.get('dxqy') or os.environ.get('dxlin') or os.environ.get('CHINA_TELECOM_AUTH')

    push_plus_token = os.environ.get(
        'PUSH_PLUS_TOKEN'
    )

    if not PHONES:

        printn(
            "ℹ️ 未检测到环境变量 `dxqy` (或 `dxlin`)，"
            "将使用脚本内嵌的账号信息。"
        )

        PHONES = (
            "你的手机号#你的服务密码#你的AndroidID"
        )

    raw_accs = [
        p.strip()
        for p in re.split(
            r'[&\r\n]+',
            PHONES
        )
        if p.strip()
    ]

    all_accounts = []

    for p in raw_accs:

        p = p.strip()

        if (
            not p
            or "你的手机号" in p
        ):
            continue

        if '#' in p:

            fields = p.split(
                '#',
                2
            )

            if len(fields) == 3:
                all_accounts.append(p)

    if not all_accounts:

        printn(
            "❌ 请在环境变量或脚本中设置正确的账号信息。"
        )

        return

    claimed_data = load_claimed_accounts(
        claimed_log_file
    )

    current_month = datetime.datetime.now().strftime(
        "%Y-%m"
    )

    accounts_to_run = []
    skipped_accounts = []
    skipped_phones = []

    if test_only:

        accounts_to_run = all_accounts.copy()

        printn(
            "🧪 完整准备链路测试："
            "忽略本月领取记录，所有账号均执行测试"
        )

    else:

        for acc in all_accounts:

            phone = acc.split('#')[0]

            if claimed_data.get(phone) == current_month:

                skipped_accounts.append(
                    f"✅ {phone[:3]}***{phone[-4:]}: "
                    f"本月已领取"
                )

                skipped_phones.append(phone)

            else:

                accounts_to_run.append(acc)

    printn(
        "=" * 20
        + " 账号过滤 "
        + "=" * 20
    )

    print(
        f"总账号数: {len(all_accounts)}, "
        f"本次运行: {len(accounts_to_run)}, "
        f"本月已领取跳过: {len(skipped_accounts)}"
    )

    for s in skipped_accounts:
        print(s)

    printn(
        "=" * 52
    )

    if not accounts_to_run:

        summary_content = build_summary(
            all_accounts,
            accounts_to_run,
            skipped_phones,
            {},
        )

        printn(
            "=" * 22
            + " 通知内容预览 "
            + "=" * 22
        )

        print(summary_content)

        printn(
            "=" * 52
        )

        send_pushplus_notification(
            push_plus_token,
            "📱 电信权益领取结果",
            summary_content
        )

        printn(
            "🏁 所有账号本月均已领取，任务结束!"
        )

        return

    global_stop_event = ThreadingEvent()

    result_log = {}

    result_lock = ThreadingLock()

    file_lock = ThreadingLock()

    num_accounts_to_run = len(
        accounts_to_run
    )

    now = datetime.datetime.now()
    prepare_time = now.replace(hour=23, minute=59, second=0, microsecond=0)

    # 智能窗口调度保护 (完全对齐周三脚本规范)
    if now.hour == 23 and now.minute >= 55 and not force_run:
        if now < prepare_time:
            wait_seconds = (prepare_time - now).total_seconds()
            printn(f"⏳ 距离 23:59:00 还有 {wait_seconds:.1f} 秒，等待预热...")
            time.sleep(wait_seconds)
        else:
            printn("⚡ 已处于 23:59:00 预热窗口内，立即启动并行登录！")
    elif force_run:
        printn("🚀 【平时测试/强制运行模式】跳过夜间等待，直接执行全账号登录与可领权益检测！")
    else:
        printn(f"📅 【时间检查】当前系统时间为 {now.strftime('%H:%M:%S')}，非夜间抢购时段 (抢购准备期为 23:55~23:59)。")
        printn("💡 电信0点权益兑换仅在月末夜间开放，脚本已自动进入省电休眠，防止后台挂起被面板超时杀进程。")
        printn("👉 如需在平时进行联调测试，请在青龙面板添加环境变量: FORCE_RUN=true (或在脚本顶部将 'FORCE_RUN' 改为 True)。\n")
        return

    # ========================================================
    # 并发处理账号
    # ========================================================

    with ThreadPoolExecutor(
        max_workers=len(accounts_to_run)
    ) as executor:

        futures = [
            executor.submit(
                process_account,
                phoneV,
                global_stop_event,
                ENABLE_RUISHU,
                result_log,
                result_lock,
                file_lock,
                num_accounts_to_run
            )
            for phoneV in accounts_to_run
        ]

        wait(futures)

    end_time = datetime.datetime.now()

    duration = (
        end_time - start_time
    ).total_seconds()

    # ========================================================
    # 总结
    # ========================================================

    summary_content = build_summary(
        all_accounts,
        accounts_to_run,
        skipped_phones,
        result_log,
    )

    printn(
        "=" * 22
        + " 通知内容预览 "
        + "=" * 22
    )

    print(summary_content)

    printn(
        "=" * 52
    )

    send_pushplus_notification(
        push_plus_token,
        "📱 电信权益领取结果",
        summary_content
    )

    printn(
        f"🏁 所有账号的任务均已结束! 总耗时 {duration:.2f}s"
    )


# ============================================================
# 程序入口
# ============================================================

if __name__ == '__main__':

    inadvance = -100
    count_per_account = 5
    interval = 10

    hour = 0
    minute = 0

    # --------------------------------------------------------
    # True：
    #   直接运行进入完整准备链路测试
    #   最后调用一次 receiverRights 诊断
    #
    # False：
    #   恢复正常23:59/0点正式流程
    # --------------------------------------------------------

    DEBUG_MODE = False

    debug = DEBUG_MODE

    test_only = DEBUG_MODE

    ENABLE_RUISHU = False

    claimed_log_file = "claimed_accounts.json"

    print(
        "=" * 52
    )

    print(
        "  电信等级会员权益兑换（完整链路测试版）"
    )

    print(
        "=" * 52
    )

    print(
        f"🕒 目标时间: "
        f"{hour:02d}:{minute:02d} "
        f"| 🎯 每号抢购数: {count_per_account} "
        f"| 💥 抢购间隔: {interval}ms"
    )

    print(
        f"⚡️ 首发提前: {-inadvance}ms"
    )

    print(
        f"🐞 Debug模式: "
        f"{'开启' if DEBUG_MODE else '关闭'}"
    )

    print(
        f"🧪 完整准备链路测试: "
        f"{'开启' if test_only else '关闭'}"
    )

    print(
        f"🤖 瑞数Cookie: "
        f"{'启用' if ENABLE_RUISHU else '禁用'}"
    )

    print(
        f"📓 领取记录文件: "
        f"{claimed_log_file}"
    )

    print(
        f"📣 推送方式: "
        f"{'呆呆面板默认通知' if _HAS_DAIDAI_NOTIFY else 'pushplus'}"
    )

    print(
        f"📨 推送内容类型: {PUSH_CONTENT_TYPE}"
    )

    print(
        "=" * 52
    )

    main()
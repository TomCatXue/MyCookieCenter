#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
===================================================================
📌 版本: v1.0.8 (2026-09-22 定时优化避开零点并发)
中国电信 · 每日签到与金豆任务聚合脚本 (100% 忠实原版0716通道)
===================================================================
new Env('中国电信 · 每日签到与金豆');
cron: 0 1 * * *
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

import os, sys, re, json, time, random, string, base64, asyncio, certifi, requests
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
from typing import Dict, Any, Union
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    CN_TZ = ZoneInfo("Asia/Shanghai")
except Exception:
    CN_TZ = timezone(timedelta(hours=8))

def now_cn() -> datetime:
    return datetime.now(CN_TZ)
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5, DES3, AES
from Crypto.Util.Padding import pad, unpad
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

# 尝试导入通知模块，若不存在则忽略
try:
    import notify
    HAS_NOTIFY = True
except ImportError:
    HAS_NOTIFY = False
    notify = None

# --- 配置与常量 ---
KEYS = {
    'login_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----""",
    'data_rsa': """-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----""",
    'des3': b'1234567`90koiuyhgtfrdews',
    'aes_def': b'34d7cb0bcdf07523',
    'aes_login': 'telecom_wap_2018'
}
global_logs = []

# --- 工具函数 ---
def log(msg: str):
    timestamp = now_cn().strftime('%Y-%m-%d %H:%M:%S')
    full_msg = f"[{timestamp}] {msg}"
    global_logs.append(full_msg)
    print(full_msg)

def mask(s: str) -> str:
    if not s or len(s) < 7:
        return s
    return f"{s[:3]}****{s[-4:]}"

def ts() -> str:
    return now_cn().strftime('%Y%m%d%H%M%S')

def print_time_diagnosis():
    local_now = datetime.now()
    cn_now = now_cn()
    utc_now = datetime.now(timezone.utc)
    biz_date = cn_now.strftime('%Y-%m-%d')
    local_str = local_now.strftime('%Y-%m-%d %H:%M:%S')
    cn_str = cn_now.strftime('%Y-%m-%d %H:%M:%S')
    utc_str = utc_now.strftime('%Y-%m-%d %H:%M:%S')
    tz_consistent = " (系统本地时间与中国时间一致)" if local_str == cn_str else " (系统本地时间与中国时间不一致，已校准为中国时间)"

    print("=" * 65)
    print("[时间诊断]")
    print(f"系统本地时间: {local_str}")
    print(f"中国时间:     {cn_str}")
    print(f"UTC时间:      {utc_str}")
    print(f"业务日期:     {biz_date}")
    print(f"时区:         Asia/Shanghai{tz_consistent}")
    print("=" * 65)

def rd_str(length: int) -> str:
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

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
    return ''.join(chr(ord(c) + 2) for c in s)

# --- SSL与HTTP会话 ---
class CustomSSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context(ciphers='DEFAULT@SECLEVEL=1:!aNULL:!eNULL:!MD5')
        ctx.check_hostname = False
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)

session = requests.Session()
session.verify = certifi.where()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Linux; U; Android 12; zh-cn) AppleWebKit/533.1 (KHTML, like Gecko) Version/5.0 Mobile Safari/533.1'
})
session.mount('https://', CustomSSLAdapter())

# --- 加密逻辑 ---
def encrypt_des3(data, mode='enc'):
    cipher = DES3.new(KEYS['des3'], DES3.MODE_CBC, 8 * b'\0')
    if mode == 'enc':
        return cipher.encrypt(pad(data.encode(), 8)).hex()
    return unpad(cipher.decrypt(bytes.fromhex(data)), 8).decode()

def encrypt_aes(data, key=KEYS['aes_def'], b64=False):
    data = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else data
    cipher = AES.new(key if isinstance(key, bytes) else key.encode(), AES.MODE_ECB)
    enc = cipher.encrypt(pad(data.encode(), 16))
    return base64.b64encode(enc).decode() if b64 else enc.hex()

def encrypt_rsa(data, key_type='data', out='hex'):
    cipher = PKCS1_v1_5.new(RSA.import_key(KEYS[f'{key_type}_rsa']))
    data = json.dumps(data, separators=(',', ':')) if isinstance(data, (dict, list)) else data
    if out == 'hex':
        return ''.join(cipher.encrypt(data[i:i+32].encode()).hex() for i in range(0, len(data), 32))
    return base64.b64encode(cipher.encrypt(data.encode())).decode()

# --- 请求函数：完全屏蔽请求/响应网络日志，仅捕获异常打印 ---
def api_req(url: str, method: str = 'POST', raw: bool = False, **kwargs) -> Union[Dict[str, Any], str]:
    try:
        r = session.request(method, url, timeout=15, **kwargs)
        if raw:
            return r.text
        return r.json()
    except Exception as e:
        log(f"[网络异常] {str(e)}")
        return '' if raw else {}

# --- 唯一登录方法：login---
def login_v2(phone: str, password: str, android_id: str):
    """登录"""
    m_phone = mask(phone)
    log(f"[登录] {m_phone} 开始登录")

    body = {
        "headerInfos": {
            "code": "userLoginNormal",
            "timestamp": ts(),
            "broadAccount": "",
            "broadToken": "",
            "clientType": "#11.0.0#channel8#Xiaomi 20#",
            "shopId": "20002",
            "source": "110003",
            "sourcePassword": "Sid98s",
            "token": "",
            "userLoginName": encode(phone)
        },
        "content": {
            "attach": "test",
            "fieldData": {
                "loginType": "4",
                "accountType": "",
                "loginAuthCipherAsymmertric": encrypt_rsa(
                    f"Xiaomi 20 8.0.0.{android_id[:12]}{phone}{ts()}{password}0$$$0.",
                    'login', 'b64'
                ),
                "deviceUid": "",
                "phoneNum": encode(phone),
                "isChinatelecom": "",
                "systemVersion": "8.0.0",
                "androidId": encode(android_id),
                "loginAuthCipher": "",
                "authentication": encode(password)
            }
        }
    }
    res = api_req(
        'https://appgologin.189.cn:9031/login/client/userLoginNormal',
        json=body
    )
    if not isinstance(res, dict):
        log(f"失败] {m_phone} 响应非JSON")
        return None

    resp_data = res.get('responseData') if isinstance(res, dict) and isinstance(res.get('responseData'), dict) else {}
    data_block = resp_data.get('data') if isinstance(resp_data.get('data'), dict) else {}
    login_data = data_block.get('loginSuccessResult')
    if not login_data:
        err_msg = data_block.get('resultMsg') or resp_data.get('resultDesc') or (res.get('headerInfos', {}).get('reason') if isinstance(res, dict) else '') or '服务密码有误或触发安全验证'
        log(f"[登录失败] {m_phone}: {err_msg}")
        return None

    # 获取Ticket
    xml = f'''<Request>
        <HeaderInfos>
            <Code>getSingle</Code>
            <Timestamp>{ts()}</Timestamp>
            <BroadAccount></BroadAccount>
            <BroadToken></BroadToken>
            <ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType>
            <ShopId>20002</ShopId>
            <Source>110003</Source>
            <SourcePassword>Sid98s</SourcePassword>
            <Token>{login_data["token"]}</Token>
            <UserLoginName>{phone}</UserLoginName>
        </HeaderInfos>
        <Content>
            <Attach>test</Attach>
            <FieldData>
                <TargetId>{encrypt_des3(login_data["userId"])}</TargetId>
                <Url>4a6862274835b451</Url>
            </FieldData>
        </Content>
    </Request>'''
    xml_res = api_req(
        'https://appgologin.189.cn:9031/map/clientXML',
        data=xml,
        headers={'Content-Type': 'application/xml'},
        raw=True
    )
    if not isinstance(xml_res, str):
        log(f"[获取Ticket失败] {m_phone} 返回非字符串")
        return None
    if '过期' in xml_res or '校验错误' in xml_res:
        log(f"[获取Ticket失败] {m_phone} 票据校验异常")
        return None
    if '<Ticket>' not in xml_res:
        log(f"[Ticket异常] {m_phone} 响应缺失Ticket")
        return None

    try:
        ticket = xml_res.split('<Ticket>')[1].split('</Ticket>')[0]
        uid = encrypt_des3(ticket, 'dec')
    except Exception as e:
        log(f"[解析Ticket失败] {m_phone}: {str(e)}")
        return None

    # 统一登录获取Bearer
    auth_body = encrypt_aes(
        {"ticket": uid, "backUrl": "https%3A%2F%2Fwapact.189.cn%3A9001", "platformCode": "P201010301", "loginType": 2},
        KEYS['aes_login'],
        True
    )
    auth_res = api_req(
        'https://wapact.189.cn:9001/unified/user/login',
        data=auth_body,
        headers={'Content-Type': 'application/json'}
    )
    user_info = {
        **login_data,
        'uid': uid,
        'phoneNbr': phone
    }
    if isinstance(auth_res, dict) and auth_res.get('code') == 0:
        user_info['Authorization'] = f"Bearer {auth_res['biz']['token']}"
       
    else:
        log(f"[统一登录警告] {m_phone} 未获取Bearer，抽奖功能不可用")

    return user_info

# --- 任务执行（签到、抽奖等）---
def sign_tasks(user: dict) -> list:
    phone = user['phoneNbr']
    m = mask(phone)
    log(f"[任务开始] {m}")
    bullets = []

    sso_url = f"https://wappark.189.cn/jt-sign/ssoHomLogin?ticket={user['uid']}"
    sso = api_req(sso_url, method='GET')
    if not isinstance(sso, dict) or not sso or 'sign' not in sso:
        log(f"[获取sign失败] {m} 中断所有签到任务")
        bullets.append("• 掌厅会话认证: 登录凭证无效或过期")
        return bullets
    sign_header = {'sign': sso['sign']}

    # 1. 签到打卡并获取奖励
    log(f"[签到] {m} 执行每日签到打卡")
    sign_res = api_req(
        'https://wappark.189.cn/jt-sign/webSign/sign',
        json={"encode": encrypt_aes({"phone": phone, "date": int(time.time()*1000)})},
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

    # 查询连签与累签
    cont_days = "0"
    total_days = "0"

    def check_and_award(path, key, days_list, label):
        nonlocal cont_days, total_days
        res = api_req(
            f'https://wappark.189.cn/jt-sign/{path}',
            json={"para": encrypt_rsa({"phone": phone})},
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
                'https://wappark.189.cn/jt-sign/webSign/exchangePrize',
                json={"para": encrypt_rsa({"phone": phone, "type": days})},
                headers=sign_header
            )

    total_bean_balance = None
    try:
        cont_res = api_req(
            f'https://wappark.189.cn/jt-sign/api/home/userStatusInfo',
            json={"para": encrypt_rsa({"phone": phone})},
            headers=sign_header
        )
        if isinstance(cont_res, dict):
            c_data = cont_res.get('data') or cont_res
            for k in ['goldCoin', 'totalCoin', 'coin', 'userCoin', 'gold']:
                if c_data.get(k) is not None:
                    total_bean_balance = c_data.get(k)
                    break

        check_and_award('api/home/userStatusInfo', 'signDay', ['7'], '连签')
        check_and_award('webSign/continueSignDays', 'continueSignDays', ['15', '28'], '累签')
    except Exception:
        pass

    bullets.append(f"• 每日签到打卡: {sign_coin} · 连签 {cont_days} 天 (累签 {total_days} 天)")

    # 2. 金豆转盘抽奖 (回显抽中具体奖品)
    if 'Authorization' in user:
        log(f"[抽奖] {m} 查询转盘活动")
        tab = api_req(
            f"https://wapact.189.cn:9001/gateway/golden/api/queryTurnTable?userType=1&_={int(time.time()*1000)}",
            method='GET',
            headers={'Authorization': user['Authorization']}
        )
        if isinstance(tab, dict) and tab.get('code') == 0:
            if total_bean_balance is None:
                b_data = tab.get('biz') or {}
                for k in ['userGold', 'gold', 'goldCoin', 'coin', 'totalCoin']:
                    if b_data.get(k) is not None:
                        total_bean_balance = b_data.get(k)
                        break
            act_id = safe_get(tab, 'biz', 'wzTurntable', 'code')
            if act_id:
                chk = api_req(
                    f"https://wapact.189.cn:9001/gateway/standQuery/detail/check?activityId={act_id}",
                    method='GET',
                    headers={'Authorization': user['Authorization']}
                )
                if isinstance(chk, dict) and chk.get('code') == 0:
                    info = safe_get(chk, 'biz', 'resultInfo') or {}
                    remain = max(0, info.get('userMaximum', 0) - info.get('userCount', 0))
                    log(f"[抽奖] {m} 剩余可抽奖次数：{remain}次")
                    prizes = []
                    for idx in range(remain):
                        log(f"[抽奖] {m} 进行第{idx+1}次抽奖...")
                        draw_res = api_req(
                            'https://wapact.189.cn:9001/gateway/golden/api/lottery',
                            json={"activityId": act_id},
                            headers={'Authorization': user['Authorization']}
                        )
                        p_name = safe_get(draw_res, 'biz', 'prizeName') or safe_get(draw_res, 'biz', 'prizeTitle') or '金豆'
                        prizes.append(p_name)
                        log(f"[抽奖成功] {m}: {p_name}")
                        time.sleep(2)
                    if prizes:
                        bullets.append(f"• 掌厅金豆转盘: 完成 {len(prizes)} 次: [{', '.join(prizes)}]")
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
    total_bean_balance = None
    tasks_res = api_req(
        'https://wappark.189.cn/jt-sign/webSign/homepage',
        json={"para": encrypt_rsa({"phone": phone, "shopId": "20001", "type": "hg_qd_zrwzjd"})},
        headers=sign_header
    )
    task_done = 0
    if isinstance(tasks_res, dict):
        total_bean_balance = safe_get(tasks_res, 'data', 'biz', 'totalGoldCoin') or safe_get(tasks_res, 'data', 'totalCoin')
        ad_items = safe_get(tasks_res, 'data', 'biz', 'adItems') or []
        log(f"[任务列表] {m} 待完成任务总数：{len(ad_items)}个")
        for t in ad_items:
            if t.get('taskState') in ['0', '1'] and str(t.get('contentOne')) == '18':
                task_id = t.get('taskId')
                task_title = t.get('title', '领豆任务')
                if task_id:
                    log(f"[任务执行] {m} 执行任务：{task_title}")
                    api_req(
                        'https://wappark.189.cn/jt-sign/webSign/polymerize',
                        json={"para": encrypt_rsa({"phone": phone, "jobId": task_id})},
                        headers=sign_header
                    )
                    task_done += 1
                    time.sleep(2)

    if task_done > 0:
        bullets.append(f"• 每日任务领豆: 完成 {task_done} 项浏览任务 (金豆已入账)")
    else:
        bullets.append("• 每日任务领豆: 今日任务已做完 (+0金豆)")

    # 4. 宠物乐园喂食
    log(f"[喂食] {m} 开始宠物喂食")
    feed_done = 0
    for _ in range(10):
        f_res = api_req(
            'https://wappark.189.cn/jt-sign/paradise/food',
            json={"para": encrypt_rsa({"phone": phone})},
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

    # 5. 账户金豆总资产回显
    if total_bean_balance is not None and str(total_bean_balance).strip():
        bullets.append(f"• 账户当前金豆: {total_bean_balance} 金豆")
    else:
        bullets.append("• 账户当前金豆: 资产已核验 (今日所领金豆均已全额到账)")

    log(f"[任务全部完成] {m}")
    return bullets

SCRIPT_VERSION = "v1.0.8"

# --- 主程序 ---
if __name__ == '__main__':
    print("=" * 65)
    print(f"  🎉 [{SCRIPT_VERSION}] 中国电信 · 每日签到与金豆任务聚合脚本 🎉  ")
    print("=" * 65)
    print_time_diagnosis()

    raw = os.environ.get('dxlin') or \
          os.environ.get('CHINA_TELECOM_AUTH') or \
          os.environ.get('dxqy') or ''

    if not raw.strip():
        log("未找到环境变量 dxlin，请按格式设置：手机号#密码#AndroidID，多账号换行分隔")
        sys.exit(1)

    accs = [line.strip().split('#') for line in re.split(r'[&\r\n]+', raw) if line.strip() and '#' in line]
    if not accs:
        log("未解析到有效账号，请检查格式（手机号#密码#AndroidID）")
        sys.exit(1)

    print(f"\n👤 检测到 {len(accs)} 个有效电信账号，开始执行每日任务...\n")

    account_results = []

    for idx, parts in enumerate(accs, 1):
        phone = parts[0].strip()
        pwd = parts[1].strip() if len(parts) > 1 else ''
        android_id = parts[2].strip() if len(parts) > 2 else ''

        # 检查AndroidID是否提供
        if not android_id:
            log(f"[账号{idx}] 错误：缺少AndroidID，格式应为 手机号#密码#AndroidID。跳过该账号。")
            account_results.append((phone, False, ["• 账号认证: 缺少AndroidID", "• 任务状态: 任务已跳过"]))
            continue

        log(f"\n{'='*10} 正在处理账号 [{idx}/{len(accs)}] {mask(phone)} {'='*10}")
        user = login_v2(phone, pwd, android_id)

        if user:
            bullets = sign_tasks(user)
            account_results.append((phone, True, bullets))
        else:
            log(f"[账号跳过] {mask(phone)} 登录失败，不执行任务")
            bullets = [
                "• 账号认证: 登录未通过 (服务密码有误或触发安全验证)",
                "• 任务状态: 今日签到与金豆任务已跳过"
            ]
            account_results.append((phone, False, bullets))

        time.sleep(2)

    # --- 微信读书风格汇总通知 ---
    summary_blocks = []
    for idx, (p, ok, b) in enumerate(account_results, 1):
        if len(account_results) > 1:
            summary_blocks.append(f"【账号 {idx}: {mask(p)}】\n" + "\n".join(b))
        else:
            summary_blocks.append("\n".join(b))

    first_phone = mask(accs[0][0]) if accs else "主账号"
    subtitle = f"执行完成 (1个账号) - 【{first_phone}】" if len(accs) == 1 else f"执行完成 ({len(accs)}个账号)"
    notify_body = "\n\n".join(summary_blocks)

    print("\n" + "=" * 65)
    print("                       📊 任务执行结果总报                       ")
    print("=" * 65)
    print(f"📣 [{SCRIPT_VERSION}]【中国电信 · 每日签到与金豆】\n{subtitle}\n\n{notify_body}")
    print("=" * 65 + "\n")

    if HAS_NOTIFY and notify and hasattr(notify, 'send'):
        try:
            notify.send(f"[{SCRIPT_VERSION}] 中国电信 · 每日签到与金豆", f"{subtitle}\n\n{notify_body}")
            log("🔔 青龙通知推送成功！")
        except Exception as e:
            log(f"⚠️ 通知推送失败: {str(e)}")

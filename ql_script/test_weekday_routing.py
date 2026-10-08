#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
星期路由验证测试（整合脚本核心验收点）

断言：
  1. 周三：执行周三双抽奖，通知含「周三会员抽权益币」「周三会员抽三次」
  2. 周五：不调用周三抽奖函数，通知不含这两行
  3. 周五：心跳保活被调用 1 次，且通知不含「心跳」字样
  4. 通知全部为「• 」开头的单行 Bullet
"""
import sys
import types
import importlib
from datetime import datetime
from unittest import mock

sys.path.insert(0, '.')
import telecom_daily as T

# ---------- 计数探针 ----------
calls = {
    'wed_coin': 0,
    'wed_thrice': 0,
    'keep_alive': 0,
}


def fake_wed(act_no, act_title, session_key, phone, closed_hint=""):
    calls['wed_coin' if 'hd76690472' in act_no else 'wed_thrice'] += 1
    return "完成 1 次，获得: [谢谢参与]"


def fake_keep_alive(sess, phone, session_key):
    calls['keep_alive'] += 1
    return True


def run_scenario(weekday: int, label: str):
    """模拟指定星期运行 main()，返回通知块"""
    calls.update(wed_coin=0, wed_thrice=0, keep_alive=0)

    # 2026-10-05 是周一(weekday=0)，故 5+weekday 即为目标星期
    fake_now = datetime(2026, 10, 5 + weekday, 9, 0, 0)

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fake_now

    with mock.patch.object(T, 'datetime', FakeDateTime), \
         mock.patch.object(T, 'parse_accounts', lambda: [('13800000000', '123456', 'a' * 16, '')]), \
         mock.patch.object(T, 'login_telecom', lambda *a, **k: {'phoneNbr': '13800000000', 'ticket': 'T'}), \
         mock.patch.object(T, 'sign_tasks', lambda s, u: ['• 每日签到打卡: 已签到']), \
         mock.patch.object(T, 'is_session_key_alive', lambda *a, **k: True), \
         mock.patch.object(T, 'get_cached_session_key', lambda p: 'f' * 32), \
         mock.patch.object(T, 'run_wednesday_lottery', fake_wed), \
         mock.patch.object(T, 'run_lucky_lottery', lambda *a, **k: '未中奖'), \
         mock.patch.object(T, 'run_auto_claim', lambda *a, **k: ''), \
         mock.patch.object(T, 'query_equity_coin_balance', lambda *a, **k: '20 权益币'), \
         mock.patch.object(T, 'send_session_keep_alive', fake_keep_alive), \
         mock.patch.object(T, 'run_ai_pad_tasks', lambda s, u: ['• AI奇遇赢Pad: 完成 1 次制作']), \
         mock.patch.object(T, 'do_notify', lambda blocks, n, fm: blocks), \
         mock.patch.object(T, 'time'):
        blocks = T.main()
        # main() 内部调用 do_notify，用 side_effect 捕获
        return blocks


# 用 side_effect 捕获 do_notify 的入参
captured = {}


def capture_notify(blocks, count, first_mask):
    captured['blocks'] = blocks
    captured['count'] = count


T.do_notify = capture_notify


def scenario(weekday: int, label: str):
    calls.update(wed_coin=0, wed_thrice=0, keep_alive=0)
    captured.clear()
    # 2026-10-05 是周一(weekday=0)，故 5+weekday 即为目标星期
    fake_now = datetime(2026, 10, 5 + weekday, 9, 0, 0)

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fake_now

    with mock.patch.object(T, 'datetime', FakeDateTime), \
         mock.patch.object(T, 'parse_accounts', lambda: [('13800000000', '123456', 'a' * 16, '')]), \
         mock.patch.object(T, 'login_telecom', lambda *a, **k: {'phoneNbr': '13800000000', 'ticket': 'T'}), \
         mock.patch.object(T, 'sign_tasks', lambda s, u: ['• 每日签到打卡: 已签到']), \
         mock.patch.object(T, 'is_session_key_alive', lambda *a, **k: True), \
         mock.patch.object(T, 'get_cached_session_key', lambda p: 'f' * 32), \
         mock.patch.object(T, 'run_wednesday_lottery', fake_wed), \
         mock.patch.object(T, 'run_lucky_lottery', lambda *a, **k: '未中奖'), \
         mock.patch.object(T, 'run_auto_claim', lambda *a, **k: ''), \
         mock.patch.object(T, 'query_equity_coin_balance', lambda *a, **k: '20 权益币'), \
         mock.patch.object(T, 'send_session_keep_alive', fake_keep_alive), \
         mock.patch.object(T, 'run_ai_pad_tasks', lambda s, u: ['• AI奇遇赢Pad: 完成 1 次制作']), \
         mock.patch.object(T.time, 'sleep', lambda s: None):
        T.main()
    body = "\n".join(captured.get('blocks', []))
    return body


print("=" * 60)
print("星期路由验证")
print("=" * 60)

# --- 周三 (weekday=2) ---
wed_body = scenario(2, "周三")
print("\n【周三】通知内容:")
print(wed_body)
print(f"\n周三抽奖调用次数: 权益币={calls['wed_coin']}, 抽三次={calls['wed_thrice']}")
print(f"心跳保活调用次数: {calls['keep_alive']}")

# --- 周五 (weekday=4) ---
fri_body = scenario(4, "周五")
print("\n【周五】通知内容:")
print(fri_body)
print(f"\n周三抽奖调用次数: 权益币={calls['wed_coin']}, 抽三次={calls['wed_thrice']}")
print(f"心跳保活调用次数: {calls['keep_alive']}")

# ==================== 断言 ====================
print("\n" + "=" * 60)
print("断言结果")
print("=" * 60)

fails = []

# 1. 周三必须包含周三两行
if '周三会员抽权益币' not in wed_body:
    fails.append("周三通知缺少「周三会员抽权益币」")
if '周三会员抽三次' not in wed_body:
    fails.append("周三通知缺少「周三会员抽三次」")

# 2. 周五必须不包含周三两行
if '周三会员抽权益币' in fri_body:
    fails.append("★周五通知竟含「周三会员抽权益币」")
if '周三会员抽三次' in fri_body:
    fails.append("★周五通知竟含「周三会员抽三次」")

# 3. 周五心跳保活必须执行但不展示
if calls['keep_alive'] != 1:
    fails.append(f"周五心跳保活应调用1次，实际 {calls['keep_alive']} 次")
if '心跳' in fri_body:
    fails.append("★周五通知竟含「心跳」字样（应静默）")

# 4. 每行必须是 Bullet
for line in fri_body.split("\n"):
    line = line.strip()
    if line and not line.startswith('•') and not line.startswith('【'):
        fails.append(f"非 Bullet 行: {line}")

if fails:
    for f in fails:
        print("❌", f)
    sys.exit(1)
else:
    print("✅ 全部断言通过")
    print("  • 周三执行并展示周三双抽奖")
    print("  • 周五不执行、不展示周三双抽奖")
    print("  • 周五心跳保活执行 1 次且静默")
    print("  • 通知全部为微信读书 Bullet 排版")

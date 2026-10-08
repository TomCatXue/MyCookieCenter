#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""模拟通知输出验证：确认新格式符合要求（不触网，全部 mock）"""
import os, sys, importlib.util
from datetime import datetime
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("telecom_daily", os.path.join(ROOT, "ql_script", "telecom_daily.py"))
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)

captured = {}
T.do_notify = lambda blocks, n, fm: captured.update(blocks=blocks)

# 构造：转盘抽 2 次（1中1未中）+ 浏览任务到账 50 豆 + 余额 1280
def fake_sign(sess, user):
    return [
        "• 每日签到打卡: 今日已签 · 连签 7 天 (累签 8 天)",
        "• 掌厅金豆转盘: 抽 2 次 (累计 10 金豆) — 第1次: 10金豆 (+10 金豆)；第2次: 谢谢参与 (未中奖)",
        "• 每日任务领豆: 完成 1 项浏览任务 (+50 豆)",
        "• 宠物乐园喂食: 今日投喂已达上限",
        "• 账户当前金豆: 1,280 颗 (今日共领取 60 颗)",
    ]

class FakeDT(datetime):
    @classmethod
    def now(cls, tz=None):
        return datetime(2026, 10, 8, 9, 0, 0)   # 周四

with mock.patch.object(T, 'datetime', FakeDT), \
     mock.patch.object(T, 'parse_accounts', lambda: [('13800000000', '123456', 'a'*16, '')]), \
     mock.patch.object(T, 'login_telecom', lambda *a, **k: {'phoneNbr': '13800000000', 'ticket': 'T'}), \
     mock.patch.object(T, 'sign_tasks', fake_sign), \
     mock.patch.object(T, 'is_session_key_alive', lambda *a, **k: True), \
     mock.patch.object(T, 'get_cached_session_key', lambda p: 'f'*32), \
     mock.patch.object(T, 'run_lucky_lottery', lambda *a, **k: '未中奖'), \
     mock.patch.object(T, 'run_auto_claim', lambda *a, **k: ''), \
     mock.patch.object(T, 'query_equity_coin_balance', lambda *a, **k: None), \
     mock.patch.object(T, 'send_session_keep_alive', lambda *a, **k: True), \
     mock.patch.object(T, 'run_ai_pad_tasks', lambda s, u: ['• AI奇遇赢Pad: 暂无可用制作券 (当前点数 0)']), \
     mock.patch.object(T.time, 'sleep', lambda s: None):
    T.main()

body = "\n".join(captured.get('blocks', []))
print("=" * 60)
print("模拟通知输出（权益币接口失效场景）")
print("=" * 60)
print(body)
print("=" * 60)

fails = []
if '账户当前权益币' in body:
    fails.append("权益币接口失效时不应出现该行")
if '查询异常' in body:
    fails.append("不应出现「查询异常」字样")
if '资产已核验' in body:
    fails.append("不应再出现「资产已核验」占位文案")
if '今日共领取 60 颗' not in body:
    fails.append("缺少今日累计豆数")
if '第1次' not in body or '第2次' not in body:
    fails.append("缺少逐次抽奖明细")

if fails:
    print("❌")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("✅ 通知格式符合要求")

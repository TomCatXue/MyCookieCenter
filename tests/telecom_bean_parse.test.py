#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
金豆/奖品解析器验证测试

覆盖 _parse_draw_prize 与 _extract_bean_balance 的多字段兼容性。
"""
import os
import sys
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_PATH = os.path.join(ROOT, "ql_script", "telecom_daily.py")
spec = importlib.util.spec_from_file_location("telecom_daily", SRC_PATH)
T = importlib.util.module_from_spec(spec)
spec.loader.exec_module(T)

fails = []


def check(label, got, want):
    ok = got == want
    if not ok:
        fails.append(f"{label}: got={got!r} want={want!r}")
    print(f"  {'✅' if ok else '❌'} {label}: {got!r}")


print("=" * 60)
print("_parse_draw_prize 抽奖奖品解析")
print("=" * 60)

# 1. 中奖带金豆数（prizeName + beanNum）
check("中奖+豆数",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '10金豆', 'beanNum': 10}})['label'],
      '10金豆 (+10 金豆)')

# 2. 仅金豆数无名称
check("仅豆数",
      T._parse_draw_prize({'code': 0, 'biz': {'beanNum': 50}})['label'],
      '50 金豆')

# 3. 谢谢参与（未中奖）
check("谢谢参与",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '谢谢参与'}})['label'],
      '谢谢参与 (未中奖)')

# 4. 未中奖关键词
check("未中奖",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '很遗憾，未中奖'}})['label'],
      '很遗憾，未中奖 (未中奖)')

# 5. 实物奖品名（无豆数）
check("实物奖品",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '美团88元神券券包'}})['label'],
      '美团88元神券券包')

# 6. giftTitle 别名
check("giftTitle 别名",
      T._parse_draw_prize({'code': 0, 'biz': {'giftTitle': '5元话费', 'goldCoin': 0}})['label'],
      '5元话费')

# 7. 空响应
check("空响应",
      T._parse_draw_prize({'code': 0, 'biz': {}})['label'],
      '未中奖')

# 8. 非 dict
check("非dict",
      T._parse_draw_prize(None)['label'],
      '响应异常')

# 9. 豆数提取
check("豆数提取",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': 'x', 'beanNum': 30}})['bean'],
      30)

# 10. 从奖品名解析豆数（实测真实数据：「金豆商城50金豆」）
check("奖品名含豆数",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '金豆商城50金豆'}})['bean'],
      50)
check("奖品名含豆数-文案",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '金豆商城50金豆'}})['label'],
      '金豆商城50金豆 (+50 金豆)')
check("奖品名含豆-简写",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '100豆'}})['bean'],
      100)
check("无豆数不误判",
      T._parse_draw_prize({'code': 0, 'biz': {'prizeName': '美团88元神券券包'}})['bean'],
      0)

print()
print("=" * 60)
print("_extract_bean_balance 金豆余额多路提取")
print("=" * 60)

check("data.biz.goldCoin", T._extract_bean_balance({'data': {'biz': {'goldCoin': 1280}}}), 1280)
check("data.totalCoin", T._extract_bean_balance({'data': {'totalCoin': 999}}), 999)
check("biz.userGold", T._extract_bean_balance({'biz': {'userGold': 555}}), 555)
check("顶层 goldCoin", T._extract_bean_balance({'goldCoin': 77}), 77)
check("data.biz.totalGoldCoin", T._extract_bean_balance({'data': {'biz': {'totalGoldCoin': 2048}}}), 2048)
check("嵌套兜底", T._extract_bean_balance({'data': {'other': {'beanNum': 42}}}), 42)
check("无字段返回None", T._extract_bean_balance({'data': {'foo': 'bar'}}), None)
check("字符串数字", T._extract_bean_balance({'data': {'biz': {'goldCoin': '320'}}}), 320)

print()
print("=" * 60)
if fails:
    print(f"❌ {len(fails)} 项失败:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
else:
    print("✅ 全部通过")

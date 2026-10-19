#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
私有信息检查：确保仓库被跟踪的文件里不出现真实手机号。

约定：示例手机号统一写成 138****0000 这种「前3 + **** + 后4」的形式，
完整 11 位数字、或中间用其他字符掩盖但能拼回完整号码的写法都视为真实号码。

用法：
    python scripts/tools/check_private_data.py
退出码 0 = 通过，1 = 发现疑似真实手机号。
"""

import re
import subprocess
import sys

TEXT_SUFFIXES = (
    ".md", ".js", ".py", ".json", ".plugin", ".txt",
    ".yml", ".yaml", ".j2", ".html", ".css",
)

# 1[3-9] + 9 位，中间允许不超过 4 个非数字字符（如 138-1234-5678、138 1234 5678）
PHONE = re.compile(r"(?<!\d)1[3-9]\d(?:[^0-9\r\n]{0,4}\d{4}){2}(?!\d)")
# 允许的示例写法：前 3 位 + 恰好 4 个星号 + 后 4 位
SAMPLE = re.compile(r"^1[3-9]\d\*{4}\d{4}$")


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files", "-z"], capture_output=True, check=True
    ).stdout
    return [f for f in out.decode("utf-8").split("\0") if f]


def main():
    problems = []

    for path in tracked_files():
        if not path.lower().endswith(TEXT_SUFFIXES):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except (OSError, UnicodeDecodeError):
            continue

        for match in PHONE.finditer(text):
            value = match.group(0)
            if SAMPLE.match(value):
                continue
            line = text.count("\n", 0, match.start()) + 1
            masked = value[:3] + "****" + value[-4:]
            problems.append((path, line, masked))

    for path, line, masked in problems:
        print(f"{path}:{line}: 疑似真实手机号 {masked}")

    if problems:
        print(f"\n发现 {len(problems)} 处，请改为 138****0000 这种示例形式。")
        return 1

    print("PRIVATE_DATA_OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微信读书 WeRead iOS IPA / Mach-O 防更新弹窗硬核修补工具
=====================================================
原理说明：
  1. 通过逆向 WeRead Mach-O 二进制证实：
     - [WRUpgradeStore actionUpgrading] 负责弹出版更弹窗 (强更/建议更/可选更)；
     - [WRUpgradeStore queryNewVersion] 负责请求 https://itunes.apple.com/lookup 嗅探新版本并设置红点；
  2. 本脚本将上述两个方法的入口第一条指令直接硬编码替换为 ARM64 RET 指令 (0xd65f03c0)；
  3. 同步将 Info.plist 的 CFBundleShortVersionString 改写为 99.9.9；
  4. 达成脱机安装后 100% 永久免疫任何版本更新弹窗、公告与红点，无需代理。
"""

import os
import sys
import zipfile
import plistlib
import struct

ARM64_RET = b"\xc0\x03\x5f\xd6"  # little-endian for 0xd65f03c0 (RET)

def find_method_offset(content, target_sel_name):
    # 解析 Mach-O 相对方法列表定位方法的准确文件偏移
    def vm2file(addr):
        addr = addr & 0x1ffffffff
        if 0x100000000 <= addr < 0x1033e4000: return addr - 0x100000000
        if 0x1033e4000 <= addr < 0x103668000: return addr - 0x1033e4000 + 0x33e4000
        if 0x103668000 <= addr < 0x1042f0000: return addr - 0x103668000 + 0x3668000
        return None

    def read_str(foff):
        if foff is None or foff < 0 or foff >= len(content): return ""
        end = content.find(b"\x00", foff)
        return content[foff:end].decode("utf-8", errors="ignore") if end != -1 else ""

    def resolve_sel_name(name_vm):
        n_foff = vm2file(name_vm)
        if not n_foff: return ""
        if 0x1038d9160 <= (name_vm & 0x1ffffffff) <= 0x10395a170:
            ptr = struct.unpack("<Q", content[n_foff:n_foff+8])[0] & 0x1ffffffff
            return read_str(vm2file(ptr))
        return read_str(n_foff)

    clslist_off = 0x361fc78
    clslist_size = 0x362ae78 - 0x361fc78
    num_classes = clslist_size // 8

    for i in range(num_classes):
        cls_ptr = struct.unpack("<Q", content[clslist_off + i*8 : clslist_off + (i+1)*8])[0]
        cls_foff = vm2file(cls_ptr)
        if not cls_foff: continue
        words = struct.unpack("<5Q", content[cls_foff:cls_foff+40])
        ro_ptr = words[4] & 0x1ffffffff
        ro_foff = vm2file(ro_ptr)
        if not ro_foff: continue
        name_ptr = struct.unpack("<Q", content[ro_foff+24:ro_foff+32])[0] & 0x1ffffffff
        cls_name = read_str(vm2file(name_ptr))
        if cls_name == "WRUpgradeStore":
            baseMethodList = struct.unpack("<Q", content[ro_foff+32:ro_foff+40])[0] & 0x1ffffffff
            if not baseMethodList: continue
            mlist_foff = vm2file(baseMethodList)
            if not mlist_foff: continue
            entsize_flags, count = struct.unpack("<II", content[mlist_foff:mlist_foff+8])
            entsize = entsize_flags & 0xffff
            is_relative = bool(entsize_flags & 0x80000000)
            for j in range(count):
                entry_off = mlist_foff + 8 + j * entsize
                if is_relative:
                    name_offset, types_offset, imp_offset = struct.unpack("<iii", content[entry_off:entry_off+12])
                    imp_vm = (baseMethodList + 8 + j * entsize + 8) + imp_offset
                    name = resolve_sel_name((baseMethodList + 8 + j * entsize) + name_offset)
                else:
                    name_ptr, types_ptr, imp_ptr = struct.unpack("<QQQ", content[entry_off:entry_off+24])
                    imp_vm = imp_ptr
                    name = read_str(vm2file(name_ptr))
                if name == target_sel_name:
                    return vm2file(imp_vm)
    return None

def patch_weread_ipa(input_ipa, output_ipa):
    print(f"[*] 正在读取源 IPA: {input_ipa}")
    if not os.path.exists(input_ipa):
        print(f"[!] 错误: 输入文件不存在: {input_ipa}")
        return False

    with zipfile.ZipFile(input_ipa, "r") as zin:
        binary_entry = None
        plist_entry = None
        for name in zin.namelist():
            if name.endswith(".app/WeRead") and not name.startswith("__MACOSX"):
                binary_entry = name
            elif name.endswith(".app/Info.plist") and not name.startswith("__MACOSX"):
                plist_entry = name

        if not binary_entry or not plist_entry:
            print("[!] 错误: 未能在 IPA 中定位到 WeRead 二进制或 Info.plist")
            return False

        print(f"[*] 找到主程序二进制: {binary_entry}")
        raw_binary = bytearray(zin.read(binary_entry))
        raw_plist = zin.read(plist_entry)

    # 1. 查找并补丁 actionUpgrading
    off_action = find_method_offset(raw_binary, "actionUpgrading")
    if off_action is None:
        off_action = 0xa9c4dc  # 10.2.0 已验证硬编码偏移
        print(f"[*] 使用预置偏移定位 actionUpgrading: {hex(off_action)}")
    else:
        print(f"[+] 动态解析定位 actionUpgrading 成功: {hex(off_action)}")

    # 2. 查找并补丁 queryNewVersion
    off_query = find_method_offset(raw_binary, "queryNewVersion")
    if off_query is None:
        off_query = 0xa9cf88  # 10.2.0 已验证硬编码偏移
        print(f"[*] 使用预置偏移定位 queryNewVersion: {hex(off_query)}")
    else:
        print(f"[+] 动态解析定位 queryNewVersion 成功: {hex(off_query)}")

    print(f"[*] 修补前 actionUpgrading: {raw_binary[off_action:off_action+4].hex()}")
    print(f"[*] 修补前 queryNewVersion: {raw_binary[off_query:off_query+4].hex()}")

    raw_binary[off_action:off_action+4] = ARM64_RET
    raw_binary[off_query:off_query+4] = ARM64_RET

    print(f"[+] 修补后 actionUpgrading: {raw_binary[off_action:off_action+4].hex()} (ARM64 RET)")
    print(f"[+] 修补后 queryNewVersion: {raw_binary[off_query:off_query+4].hex()} (ARM64 RET)")

    # 3. 修补 Info.plist
    pl = plistlib.loads(raw_plist)
    old_version = pl.get("CFBundleShortVersionString", "")
    pl["CFBundleShortVersionString"] = "99.9.9"
    new_plist = plistlib.dumps(pl)
    print(f"[+] Info.plist 版本号从 {old_version} 伪装为 99.9.9")

    # 4. 重打包输出
    print(f"[*] 正在重打包至: {output_ipa}")
    with zipfile.ZipFile(input_ipa, "r") as zin:
        with zipfile.ZipFile(output_ipa, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == binary_entry:
                    zout.writestr(item, bytes(raw_binary))
                elif item.filename == plist_entry:
                    zout.writestr(item, new_plist)
                else:
                    zout.writestr(item, zin.read(item.filename))

    print(f"[+] 成功生成防弹窗纯净版 IPA: {output_ipa} (大小: {os.path.getsize(output_ipa)} 字节)")
    return True

if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "D:/G_Downloads/com.tencent.weread_10.2.0_und3fined.ipa"
    dst = sys.argv[2] if len(sys.argv) > 2 else "D:/G_Downloads/com.tencent.weread_10.2.0_no_update.ipa"
    patch_weread_ipa(src, dst)

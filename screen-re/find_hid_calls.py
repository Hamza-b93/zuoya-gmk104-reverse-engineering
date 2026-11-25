#!/usr/bin/env python3
import sys, struct
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

path = sys.argv[1]
pe = pefile.PE(path)
base = pe.OPTIONAL_HEADER.ImageBase
print(f"ImageBase 0x{base:x}, 32-bit={pe.FILE_HEADER.Machine==0x14c}")

# Map imported funcs of interest -> IAT slot VA
want = {b"HidD_SetOutputReport", b"HidD_SetFeature", b"WriteFile", b"HidD_GetFeature",
        b"DeviceIoControl"}
iat = {}
for entry in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in entry.imports:
        if imp.name and imp.name in want:
            iat[imp.name.decode()] = imp.address  # VA of the IAT slot
for k, v in iat.items():
    print(f"  IAT {k}: slot VA 0x{v:x}")

# Find the .text section bytes and its VA
text = None
for s in pe.sections:
    if s.Name.rstrip(b'\x00') == b'.text':
        text = s
textva = base + text.VirtualAddress
data = text.get_data()
print(f".text VA 0x{textva:x} size {len(data)}")

# Search for call dword ptr [slotVA]  == FF 15 <slotVA LE>
md = Cs(CS_ARCH_X86, CS_MODE_32)
callsites = {}
for name, slot in iat.items():
    pat = b"\xff\x15" + struct.pack("<I", slot)
    off = 0
    sites = []
    while True:
        i = data.find(pat, off)
        if i < 0: break
        sites.append(textva + i)
        off = i + 1
    callsites[name] = sites
    print(f"  call [{name}] : {len(sites)} site(s)")

# Disassemble a window before/after each HidD_SetOutputReport call
target = callsites.get("HidD_SetOutputReport") or callsites.get("WriteFile") or []
for addr in target[:6]:
    start = addr - 0x60
    off = start - textva
    if off < 0: off = 0; start = textva
    print(f"\n===== context around call @ 0x{addr:x} =====")
    for ins in md.disasm(data[off: off + 0x80], start):
        mark = "  <== CALL" if ins.address == addr else ""
        print(f"  {ins.address:08x}: {ins.mnemonic:7} {ins.op_str}{mark}")

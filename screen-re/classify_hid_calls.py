#!/usr/bin/env python3
import sys, struct
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

pe = pefile.PE(sys.argv[1]); base = pe.OPTIONAL_HEADER.ImageBase
want = {b"HidD_SetOutputReport", b"HidD_SetFeature", b"WriteFile"}
iat = {}
for e in pe.DIRECTORY_ENTRY_IMPORT:
    for imp in e.imports:
        if imp.name in want: iat[imp.name.decode()] = imp.address
text = next(s for s in pe.sections if s.Name.rstrip(b'\0')==b'.text')
textva = base + text.VirtualAddress; data = text.get_data()
md = Cs(CS_ARCH_X86, CS_MODE_32)

def sites_for(slot):
    pat=b"\xff\x15"+struct.pack("<I",slot); off=0; r=[]
    while True:
        i=data.find(pat,off)
        if i<0: break
        r.append(textva+i); off=i+1
    return r

for name, slot in iat.items():
    for addr in sites_for(slot):
        # disassemble 0x50 before the call; collect push immediates (args)
        start=addr-0x50; o=start-textva
        if o<0: continue
        ins=list(md.disasm(data[o:o+0x55], start))
        pushes=[x for x in ins if x.mnemonic=='push']
        imm_pushes=[x.op_str for x in pushes[-3:]]  # last 3 pushes before call ~ the 3 args
        # look for a loop (jmp backward / cmp+jl) in the window => bulk copy
        loop = any(x.mnemonic in ('loop',) or (x.mnemonic=='rep movsb') for x in ins)
        rep  = any('movs' in x.mnemonic for x in ins)
        print(f"{name:20} @ {addr:08x}  args(last3 push)={imm_pushes}  loop={loop} movs={rep}")

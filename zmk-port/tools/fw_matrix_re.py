#!/usr/bin/env python3
import sys, struct
from capstone import Cs, CS_ARCH_RISCV, CS_MODE_RISCV32, CS_MODE_RISCVC

fw = open(sys.argv[1], 'rb').read()
BASE = 0x20000000
md = Cs(CS_ARCH_RISCV, CS_MODE_RISCV32 | CS_MODE_RISCVC)
md.skipdata = True
insns = list(md.disasm(fw, BASE))

# For each PD(0x318)/PE(0x320) input read, collect the bit index from the next few
# instructions: either an Andes custom extract (opcode byte 0x5b -> bit=(word>>20)&0xF)
# or an andi/c.andi with a power-of-two immediate.
def pow2_bit(v):
    return v.bit_length()-1 if v and (v & (v-1))==0 else None

rows = {'PD':set(), 'PE':set()}
addrs = {'PD':{}, 'PE':{}}
for i, ins in enumerate(insns):
    if ins.mnemonic in ('lb','lbu') and '(' in ins.op_str:
        tail = ins.op_str.split(',')[-1].strip()
        try:
            imm = int(tail.split('(')[0] or '0', 0)
        except Exception:
            continue
        port = {0x318:'PD', 0x320:'PE'}.get(imm)
        if not port:
            continue
        # scan next 5 insns for a bit index
        for j in range(i+1, min(i+6, len(insns))):
            nj = insns[j]
            if nj.mnemonic == '.byte':
                # reassemble 4 bytes at this address from fw
                off = nj.address - BASE
                if off+4 <= len(fw):
                    word = struct.unpack_from('<I', fw, off)[0]
                    if (word & 0x7f) == 0x5b:  # Andes custom-2
                        bit = (word >> 20) & 0xF
                        if bit <= 7:
                            rows[port].add(bit); addrs[port].setdefault(bit, ins.address); break
            elif nj.mnemonic in ('andi','c.andi'):
                try:
                    imm2 = int(nj.op_str.split(',')[-1].strip(), 0)
                except Exception:
                    imm2 = None
                b = pow2_bit(imm2) if imm2 is not None else None
                if b is not None and b <= 7:
                    rows[port].add(b); addrs[port].setdefault(b, ins.address); break

print("=== Matrix ROW pins proven in firmware (port.bit : first ref) ===")
platform = {('PE',0):'row0',('PD',2):'row1',('PD',3):'row2',('PD',4):'row3',
            ('PD',5):'row4',('PD',6):'row5',('PE',3):'row6?',('PD',7):'row7?'}
for port in ('PE','PD'):
    for b in sorted(rows[port]):
        tag = platform.get((port,b), '')
        print(f"  {port}{b}   (0x{addrs[port][b]:08x})   {tag}")
print("\nPD bits scanned:", sorted(rows['PD']))
print("PE bits scanned:", sorted(rows['PE']))

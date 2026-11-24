#!/usr/bin/env python3
"""Dump .NET managed-resource region (CLI header Resources dir) to a file."""
import struct, sys
def u16(b,o): return struct.unpack_from('<H',b,o)[0]
def u32(b,o): return struct.unpack_from('<I',b,o)[0]
def rva_to_off(secs,rva):
    for va,vs,raw,rs in secs:
        if va<=rva<va+max(vs,rs): return raw+(rva-va)
    return None
path=sys.argv[1]; out=sys.argv[2]
d=open(path,'rb').read()
pe=u32(d,0x3C); coff=pe+4; nsec=u16(d,coff+2); opt=coff+20
magic=u16(d,opt); ddoff=opt+(96 if magic==0x10b else 112)
com_rva=u32(d,ddoff+14*8); sec_off=opt+u16(d,coff+16)
secs=[]
for i in range(nsec):
    s=sec_off+i*40
    secs.append((u32(d,s+12),u32(d,s+8),u32(d,s+20),u32(d,s+16)))
com=rva_to_off(secs,com_rva)
res_rva=u32(d,com+24); res_size=u32(d,com+28)
print(f"Resources RVA=0x{res_rva:x} size={res_size}")
if res_rva==0:
    print("no managed resources"); sys.exit(0)
res_off=rva_to_off(secs,res_rva)
blob=d[res_off:res_off+res_size]
open(out,'wb').write(blob)
print(f"wrote {len(blob)} bytes -> {out}")
# the region is a sequence of: u32 length + data (each manifest resource)
p=0; n=0
while p+4<=len(blob):
    ln=u32(blob,p); p+=4
    if ln<0 or p+ln>len(blob): break
    sub=blob[p:p+ln]
    open(f"{out}.sub{n}.bin","wb").write(sub)
    print(f"  sub{n}: {ln} bytes (first4={sub[:4].hex()})")
    p+=ln; n+=1

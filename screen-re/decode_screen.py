import sys
lines=[l.split('\t') for l in open(sys.argv[1]) if '\t' in l]
pkts=[bytes.fromhex(l[1].strip()) for l in lines if len(l)>1 and l[1].strip()]
print(f"total outbound pkts: {len(pkts)}")
# classify: pixel packets have byte[3]==0x21 and byte[4]==0x38
pix=[p for p in pkts if len(p)>=8 and p[3]==0x21 and p[4]==0x38]
cmd=[p for p in pkts if not (len(p)>=8 and p[3]==0x21 and p[4]==0x38)]
print(f"pixel pkts: {len(pix)}  cmd pkts: {len(cmd)}")
# offsets
offs=[p[5]|(p[6]<<8)|(p[7]<<16) for p in pix]
addrs=[p[1]|(p[2]<<8) for p in pix]
print(f"offset range: {min(offs)} .. {max(offs)}  (step {offs[1]-offs[0] if len(offs)>1 else '?'})")
print(f"addr base: {hex(addrs[0])}  addr-offset const: {hex(addrs[0]-offs[0])}")
total_bytes=max(offs)+56
print(f"total pixel bytes = {total_bytes} = {total_bytes//2} pixels")
import math
px=total_bytes//2
print(f"sqrt pixels = {math.sqrt(px):.3f}")
for w in (160,172,180,184,200,240,128,135,126):
    if px % w == 0:
        print(f"  {w} x {px//w}  (={px})")
# unique pixel values across all payloads
vals=set()
for p in pix:
    d=p[8:8+56]
    for i in range(0,len(d),2):
        vals.add(d[i:i+2])
print(f"unique pixel words: {len(vals)} -> {[v.hex() for v in list(vals)[:8]]}")
# dump the command packets verbatim
print("\n=== COMMAND / HEADER PACKETS ===")
for i,p in enumerate(pkts):
    if not (len(p)>=8 and p[3]==0x21 and p[4]==0x38):
        print(f"  idx{pkts.index(p)}: {p[:24].hex()}")

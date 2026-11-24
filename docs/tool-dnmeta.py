#!/usr/bin/env python3
"""Minimal .NET PE metadata extractor: dumps #Strings and #US heaps and
TypeDef/MethodDef names. Pure stdlib, treats input purely as data."""
import struct, sys

def u16(b,o): return struct.unpack_from('<H',b,o)[0]
def u32(b,o): return struct.unpack_from('<I',b,o)[0]

def rva_to_off(sections, rva):
    for va,vs,raw,rs in sections:
        if va <= rva < va+max(vs,rs):
            return raw + (rva-va)
    return None

def parse(path):
    d=open(path,'rb').read()
    pe=u32(d,0x3C)
    assert d[pe:pe+4]==b'PE\0\0'
    coff=pe+4
    nsec=u16(d,coff+2)
    opt=coff+20
    magic=u16(d,opt)
    # data directories: PE32 magic 0x10b -> dir at opt+96; PE32+ 0x20b -> opt+112
    ddoff = opt + (96 if magic==0x10b else 112)
    # COM descriptor is directory index 14
    com_rva=u32(d,ddoff+14*8)
    sec_off=opt + u16(d,coff+16)  # SizeOfOptionalHeader
    sections=[]
    for i in range(nsec):
        s=sec_off+i*40
        name=d[s:s+8]
        vs=u32(d,s+8); va=u32(d,s+12); rs=u32(d,s+16); raw=u32(d,s+20)
        sections.append((va,vs,raw,rs))
    com_off=rva_to_off(sections,com_rva)
    meta_rva=u32(d,com_off+8)  # cb(4)+major(2)+minor(2)+MetaData rva(4)
    meta_off=rva_to_off(sections,meta_rva)
    assert u32(d,meta_off)==0x424A5342, "no BSJB"
    verlen=u32(d,meta_off+12)
    p=meta_off+16+verlen
    p+=2  # flags
    nstreams=u16(d,p); p+=2
    streams={}
    for _ in range(nstreams):
        off=u32(d,p); size=u32(d,p+4); p+=8
        name=b''
        while d[p]!=0:
            name+=d[p:p+1]; p+=1
        p+=1
        p=(p+3)&~3
        streams[name.decode()]=(meta_off+off,size)
    return d, streams

def dump_strings(d, streams, which, out):
    if which not in streams:
        print(f"(no {which})"); return
    off,size=streams[which]
    blob=d[off:off+size]
    res=[]
    if which=='#Strings':
        for s in blob.split(b'\0'):
            if len(s)>=3:
                try: res.append(s.decode('utf-8'))
                except: pass
    elif which=='#US':
        i=1
        while i<len(blob):
            b0=blob[i]
            if b0==0: i+=1; continue
            if b0&0x80==0:
                ln=b0; i+=1
            elif b0&0xC0==0x80:
                ln=((b0&0x3f)<<8)|blob[i+1]; i+=2
            else:
                ln=((b0&0x1f)<<24)|(blob[i+1]<<16)|(blob[i+2]<<8)|blob[i+3]; i+=4
            if ln==0: continue
            txt=blob[i:i+ln-1]  # last byte is terminal flag
            i+=ln
            try:
                s=txt.decode('utf-16-le')
                if s.strip(): res.append(s)
            except: pass
    seen=set(); uniq=[]
    for s in res:
        if s not in seen:
            seen.add(s); uniq.append(s)
    with open(out,'w') as f:
        f.write('\n'.join(uniq))
    print(f"{which}: {len(uniq)} unique -> {out}")

if __name__=='__main__':
    path=sys.argv[1]; tag=sys.argv[2]
    d,streams=parse(path)
    print("Streams:", list(streams.keys()))
    dump_strings(d,streams,'#Strings', f"{tag}_names.txt")
    dump_strings(d,streams,'#US', f"{tag}_us.txt")

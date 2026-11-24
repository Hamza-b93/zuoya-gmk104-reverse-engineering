# extracted/

This directory holds the **stock firmware image carved from Zuoya's vendor OTA `.exe`**.

The binary itself (`zuoya-gmk104-stock-fw-V0111.bin`, 140 244 bytes) is **not committed**
to the public repository — it is Zuoya's proprietary firmware. It is kept locally only.

## Regenerate it yourself

With the vendor updater `ZUOYA-GK104-CS9DB8-V0111-20260511.exe` present in the project root:

```bash
python3 docs/tool-dnres.py "ZUOYA-GK104-CS9DB8-V0111-20260511.exe" /tmp/res.bin
# then carve from the KNLT marker (fw length is the little-endian u32 8 bytes before it):
python3 - <<'PY'
d=open('/tmp/res.bin.sub0.bin','rb').read()
o=d.find(b'KNLT')-8
ln=int.from_bytes(d[o:o+4],'little')
open('extracted/zuoya-gmk104-stock-fw-V0111.bin','wb').write(d[o:o+ln])
print('wrote', ln, 'bytes')
PY
```

## Provenance / fingerprint

- Source: `code_2M` managed resource inside the V01.11 vendor updater.
- Telink marker `KNLT` at offset 0x08; RISC-V reset code; embedded strings `TLSR9511`
  and `ZUOYA GMK104`.
- SHA-256 (V01.11 image): `5442850a423a44ad003b46a6fc7b13573fdebad2843daf9a92ae35817313bedf`

See [../docs/01-reverse-engineering.md](../docs/01-reverse-engineering.md) for full detail.

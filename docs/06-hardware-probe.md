# Hardware Probe Results (read-only)

Captured from a real ZUOYA GMK104 over **wired USB** on Linux, 2026-11-25. All read-only —
USB/HID descriptors only; nothing was written to the device.

## Identity

| Field | Value |
|---|---|
| USB ID | `320f:5055` |
| iManufacturer | `RDR` (Evision platform constant) |
| iProduct | `ZUOYA GMK104` |
| bcdDevice | **1.11** (matches the extracted V01.11 firmware) |
| Interfaces | 4 (all HID) |

Confirms the GMK104 is the Evision/Telink TLSR9511 platform, same family as `rainy75-zmk`.

## USB interface map

| IF | hidraw | sysfs | Role | Fingerprint |
|----|--------|-------|------|-------------|
| 0 | hidraw1 | `…5055.0002` | Boot keyboard (6KRO) | `05 01 09 06` + 64B consumer feature |
| 1 | hidraw2 | `…5055.0003` | **VIA** | usage page **0xFF60**, usage 0x61, 32B in/out |
| 2 | hidraw3 | `…5055.0004` | NKRO kbd + system + consumer + mouse **+ OTA** | OTA: usage page **0xFFEF**, **Report ID 5**, 63B in/out/feature |
| 3 | hidraw4 | `…5055.0005` | Vendor channel (likely screen / "WOB driver") | usage page **0xFF1C**, Report ID 4, 63B out / 7B in |

### Interface 1 — VIA (confirmed working)
```
06 60 ff  09 61  a1 01
  09 62  15 00 26 ff 00  95 20 75 08  81 02   ; input  32 bytes
  09 63  15 00 26 ff 00  95 20 75 08  91 02   ; output 32 bytes
c0
```
Textbook VIA raw-HID endpoint → **usevia.app works on Linux** (see [02-linux-setup.md](02-linux-setup.md)).

### Interface 2 — OTA (confirmed present; the ZMK flash entry point)
```
06 ef ff  09 00  a1 01  85 05
  15 00 26 ff 00  95 3f 75 08
  09 01 81 02    ; input   63 bytes
  09 02 91 02    ; output  63 bytes
  09 03 b1 02    ; feature 63 bytes
c0
```
Exactly matches `rainy75-zmk`'s `ota_flasher.py` target (`INTERFACE=2, REPORT_ID=0x05,
USAGE_PAGE=0xFFEF`). The no-case-opening flash path is physically available. Also on IF2:
report ID 1 is a 120-key **NKRO** bitmap (full N-key rollover available even on stock).

### Interface 3 — 0xFF1C vendor channel (new finding)
```
06 1c ff  09 92  a1 01  85 04
  19 00 2a ff 00  15 00 26 ff 00  75 08 95 3f  91 00   ; output 63 bytes
  19 00 2a ff 00  75 08 95 07  81 00                    ; input   7 bytes
c0
```
A fourth proprietary channel not seen in the tool analysis. The large 63-byte output + tiny
input is consistent with a **bulk push channel** — most likely the **color-screen image
upload** and/or the proprietary "WOB/RDR driver" config path. Not VIA, not OTA. Would need
its own RE if the screen is ever targeted (see [04-screen-image-tool.md](04-screen-image-tool.md)).

## What this verifies

- ✅ VIA configuration path is real and live on Linux.
- ✅ The OTA flash interface matches rainy75 exactly → the ZMK bootstrap is viable.
- ✅ NKRO present.
- ✅ Firmware rev (1.11) and platform (`RDR`/Evision) confirmed on real hardware.
- 🔍 Identified a 4th channel (`0xFF1C`) as the likely screen/driver path.

## Reproduce (read-only)

```bash
lsusb -d 320f:
for r in /sys/bus/hid/devices/*320F*/report_descriptor; do echo "== $r =="; od -An -tx1 "$r"; done
sudo lsusb -v -d 320f: | grep -iE 'idProduct|bcdDevice|iManufacturer|iProduct|bInterfaceNumber|bInterfaceProtocol|wMaxPacketSize'
```

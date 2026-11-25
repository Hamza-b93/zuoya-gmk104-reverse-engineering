# Screen Protocol RE — COMPLETE (control + pixel pipeline captured)

Reverse-engineering of the GMK104 **color-screen** image-upload protocol. The control/handshake
path was first recovered statically from the Windows "Image Custom Tool" (`Image Custom Tool.exe`,
native C++/MFC + OpenCV); the **full pixel pipeline** was then captured live by running the tool
under **Wine** while sniffing USB with **usbmon/dumpcap**, uploading a solid-red test image, and
decoding the on-wire reports. The reconstructed framebuffer matches the uploaded image exactly, so
the protocol below is confirmed end-to-end and is enough to build a Linux uploader.

**Status: SOLVED.** Resolution, pixel format, framing, addressing, checksum, and the full
command sequence are all recovered. Raw evidence is in [`../screen-re/capture/`](../screen-re/capture/).

## Panel

| Property | Value |
|---|---|
| **Resolution** | **180 × 180** (confirmed: the first non-red pixel in the capture is at index **32400 = 180×180**, on a clean row boundary) |
| **Pixel format** | **RGB565, big-endian** (MSB first) — pure red = word `0xF800` = bytes `F8 00` |
| **Order** | row-major, top-left origin (confirmed on hardware with a four-quadrant test pattern) |
| **Framebuffer** | 180×180 = 32400 px = **64 800 bytes**, padded by the tool to **65 536 bytes** (0x10000); only the first 64 800 bytes are displayed |

## Transport

- **Interface**: 4th HID interface — usage page **`0xFF1C`**, **Report ID `0x04`**. On Linux this
  enumerates as a dedicated `hidraw` node (identify it by the usage page `06 1C FF` in its report
  descriptor; on the test unit it was `/dev/hidraw4`, interface 3). VID `0x320F` / PID `0x5055` (wired).
- **Reports**: fixed **64-byte** HID output reports (`os.write` to the hidraw fd, first byte = report ID).
- Statically, the tool sends the 12-packet *command* handshake via `HidD_SetOutputReport`
  (`0x00491280`); the bulk pixel data goes out as more 64-byte reports on the same interface.

## Packet format (all packets)

Every 64-byte report has the same envelope:

```
byte 0      : 0x04                 report ID
byte 1..2   : checksum, LE16       = sum(bytes[3..63]) & 0xFFFF
byte 3      : opcode
byte 4..    : opcode-specific body (zero-padded to 64 bytes)
```

**Checksum** (verified against all 1171 pixel packets *and* every command packet):

```
cksum = sum(report[3:64]) & 0xFFFF      # little-endian into bytes 1,2
```

## Command sequence

One still-image upload is: **prologue → pixel stream → epilogue**.

### Prologue (5 packets, sent verbatim)

| # | opcode | report (first bytes) | role (inferred) |
|---|--------|----------------------|-----------------|
| 1 | `0x01` | `04 01 00 01 00…` | begin / select screen |
| 2 | `0x06` | `04 29 07 06 30 00 00 00 00 01 04 02 00 01 FF FF FF …` | metadata (frame config / colors / timing) |
| 3 | `0x02` | `04 02 00 02 00…` | — |
| 4 | `0x23` | `04 23 00 23 00…` | prepare pixel write |
| 5 | `0x01` | `04 01 00 01 00…` | begin pixel stream |

The opcode-`0x06` metadata packet's full bytes (payload): `30 00 00 00 00 01 04 02 00 01 FF FF FF
00 00 00 00 00 00 FF 00 00 00 00 00 00 FF 00 09 02 FF 00 01 01 06 15 06 03 25 11 26 00 64 …`.
For a fixed 180×180 still it is constant, so replay it verbatim. (It likely encodes frame count,
interval, and a background/key color — relevant only for GIF/multi-frame, not yet parsed.)

### Pixel stream (opcode `0x21`)

```
byte 0      : 0x04
byte 1..2   : checksum (LE16)
byte 3      : 0x21                 write-pixels opcode
byte 4      : length               0x38 (56) for all but the last packet, 0x10 (16) for the last
byte 5..7   : destination offset   LE24, into the 65 536-byte framebuffer
byte 8..    : pixel payload        <length> bytes = RGB565-BE, 28 px per full packet
```

- Offsets run **0, 56, 112, … 65 520**, step **56**. 1170 packets of 56 bytes + 1 final packet of
  16 bytes = **1171 pixel packets**, covering all 65 536 bytes.
- Payload is the raw framebuffer slice `fb[offset : offset+length]`.

### Epilogue (1 packet)

| opcode | report | role |
|--------|--------|------|
| `0x02` | `04 02 00 02 00…` | commit / refresh (image appears) |

Total for one image = 5 + 1171 + 1 = **1177** output reports (verified against the capture).

## Building the framebuffer

```
img  -> resize to 180x180 -> for each pixel (row-major):
          v = ((R>>3)<<11) | ((G>>2)<<5) | (B>>3)      # RGB565
          emit big-endian: bytes[(v>>8)&0xFF, v&0xFF]
fb   = 64 800 bytes, then pad to 65 536 with 0x00 (padding is not displayed)
```

## Evidence / reproduction

- [`../screen-re/capture/screen_red_upload.pcapng`](../screen-re/capture/) — the live usbmon capture
  (bus 3), 4708 frames, 1177 host→device 64-byte reports.
- [`../screen-re/capture/out_reports_hex.txt`](../screen-re/capture/) — the 1177 outbound report
  payloads as hex, in order.
- [`../screen-re/capture/reconstructed_180x180.png`](../screen-re/capture/) — the framebuffer rebuilt
  from the capture (solid red + a thin padding-noise strip past pixel 32400), proving format + resolution.
- [`../screen-re/decode_screen.py`](../screen-re/decode_screen.py) — classifier/decoder used above.

Recapture (tool under Wine):
```bash
# keyboard on bus N (VID 320f): check /sys/bus/usb/devices/*/idVendor
sudo modprobe usbmon
sudo dumpcap -q -i usbmonN -a duration:1200 -w screen.pcapng   # start, then upload in the tool
# extract outbound reports:
tshark -r screen.pcapng -Y 'usb.endpoint_address.direction==0 && usb.data_len>0' \
       -T fields -e usb.capdata
```

## Linux uploader — status

Implemented in `gui/` (Node, no Wine): `src/screen.js` builds the reports and `src/screen-device.js`
writes them to the `0xFF1C` node. Image decoding (PNG/GIF to RGB888) is not implemented yet. The
steps below describe the flow the codec follows:

1. **Find the node** — scan `/sys/class/hidraw/*/device/report_descriptor` for usage page `06 1C FF`
   and VID `320F`; open that `/dev/hidrawX` (`--device` to override). Needs rw access (see [gui/README.md](../gui/README.md)).
2. **Prep image** — load, resize to 180×180, encode RGB565-BE row-major, pad to 65 536 (the gui codec takes raw RGB888 and does the encoding).
3. **Prologue** — emit the 5 wrapper packets (opcodes `01, 06, 02, 23, 01`), recomputing checksums.
4. **Pixels** — for `offset` in `range(0, 65536, 56)`: build `04 | cksum | 21 | len | offset(LE24) |
   payload` and write; last `len` = 16.
5. **Epilogue** — emit opcode `02` (commit).

Caveats: **close the Windows tool / Wine first** (it holds the hidraw handle); tune a small
inter-write delay if needed; GIF/animation = multiple frames + the opcode-`06` metadata parsed.
The orientation test (four colored quadrants, `gui/send-test-pattern.js`) has passed on hardware: row-major, top-left origin.

## Reverting an uploaded image

Nothing is flashed — the image is just data in the screen framebuffer. To change it back, **upload a
different image** with the tool (import → upload-all). Note: the tool's `显示模式` (Display-mode)
dropdown is `visible="false"` in this build, so that route is not available in the UI.

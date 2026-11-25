# Screen Protocol RE — partial (control channel found; pixel path open)

Reverse-engineering the GMK104 **color-screen** upload protocol from the Windows "Image
Custom Tool" (`Image Custom Tool.exe`, native C++/MFC + OpenCV). Goal: a Linux-native image
uploader + groundwork for a ZMK display driver. **Status: the control/handshake protocol is
recovered; the bulk pixel pipeline still needs a live USB capture.**

All static, from the extracted binary — nothing sent to the keyboard.

## Confirmed

- **Interface**: the screen is the 4th HID interface — usage page **`0xFF1C`**, usage `0x92`,
  **Report ID 4** (from [06-hardware-probe.md](06-hardware-probe.md)).
- **Transport**: `HidD_SetOutputReport` (device enumerated via `SetupDi*` + `CreateFileW`;
  handle stored at `object+0x8B4`). Reports are **17 bytes** (1 report ID + 16 payload).
- **Command function** at `0x00491280` sends a fixed **12-packet sequence** — a
  handshake / frame-select, not pixel data. Decoded immediates per packet:

  | # | byte[1] | byte[2] |   | # | byte[1] | byte[2] |
  |---|---------|---------|---|---|---------|---------|
  | 1 | `0x22` | `0xAA` (lead `0xFF`) | | 7 | `0x44` | `0xAB` |
  | 2 | `0xAD` | | | 8 | `0xAE` | |
  | 3 | `0x44` | `0xAA` | | 9 | `0x22` | `0xAC` |
  | 4 | `0xAD` | | | 10 | `0xAF` | |
  | 5 | `0x22` | `0xAB` | | 11 | `0x44` | `0xAC` |
  | 6 | `0xAE` | | | 12 | `0xAF` | |

  Pattern: a `0x22`/`0x44` phase byte with an **incrementing index** `0xAA→0xAB→0xAC`
  (paired with `0xAD→0xAE→0xAF`). Each packet also copies a 6–7 byte parameter field from
  local state (likely a device/screen id or address). This looks like a per-block
  select/commit sequence.

## Not yet recovered (needs a capture)

- The **bulk pixel transfer** path (it is **not** via `HidD_SetOutputReport` — all 12 of
  those sites are 17-byte command packets; pixel data likely goes through the `WriteFile`
  object-wrapper at `0x004CC600`, but the caller/loop wasn't traced).
- **Pixel format** (RGB565 vs RGB888 — the editor stores per-pixel R/G/B), **panel
  resolution** (editor canvas is 180×180; the real panel may differ), row/column order,
  and the **addressing/framing** of a full frame. GIF/animation handling.

Tracing these statically through the MFC+OpenCV code is possible but slow and
error-prone without execution.

## Recommended way to finish: a USB capture

The reliable completion is to capture the tool actually uploading one image, then replay the
bytes from Linux:

1. On **Windows**, install **Wireshark + USBPcap** (or use a hardware USB analyzer).
2. Start capture on the keyboard's USB device, upload a solid-color test image in the tool,
   stop capture.
3. The `0xFF1C` / Report ID 4 output reports on the wire give the exact command sequence +
   the pixel framing directly. A solid-color image makes the pixel format obvious.
4. From those bytes, a Linux uploader is a short `hidraw` script (open the `0xFF1C`
   interface — see `reverse`-style tooling — and replay/parameterize the frames).

(Running the tool under Wine with `usbmon` is a long shot — Wine HID passthrough to a real
device is unreliable — and it would write to the keyboard, so it's not attempted here.)

## Tools

- [`../screen-re/find_hid_calls.py`](../screen-re/find_hid_calls.py) — locate HID send sites
  in the PE (pefile + capstone).
- [`../screen-re/classify_hid_calls.py`](../screen-re/classify_hid_calls.py) — classify each
  site by argument length / loop context.

Run with capstone + pefile (e.g. in a venv):
```bash
python3 screen-re/find_hid_calls.py "Image Custom Tool.exe"
```

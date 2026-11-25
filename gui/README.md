# zuoya-control (Track A — Linux GUI, no flashing)

A desktop app to configure the ZUOYA GMK104's **keys** and **color screen** from Linux by
talking to the **stock firmware** over `hidraw`. Nothing is flashed, so 2.4G / screen / RGB stay
100% intact. See [`../docs/09-roadmap.md`](../docs/09-roadmap.md) for how this fits the bigger plan.

**Stack (chosen):** Electron + Node (`node-hid`) + a web frontend styled with Tailwind CSS.

## Status — foundation proven, UI not built yet

The hardware/device layer is **done and verified on real hardware**; the Electron UI is the next phase.

| Piece | State |
|---|---|
| Device discovery by HID usage page (VIA / screen / OTA) | ✅ working |
| VIA keymap **read** (`get_buffer` 0x12) → decodes to real keys | ✅ verified |
| VIA keymap **write** (`set_buffer` 0x13) | ✅ implemented, not yet exercised |
| Layer count (= 4) | ✅ |
| Screen upload protocol (180×180 RGB565-BE) | ✅ fully RE'd ([docs/08](../docs/08-screen-protocol.md)); codec not yet ported here |
| Electron window / Tailwind UI | ⬜ not started |
| Keymap-grid editor UI | ⬜ not started |
| Screen uploader UI | ⬜ not started |
| udev rule (no-sudo access) | ⬜ not started (use the chmod below for now) |

## What's here

```
gui/
├── src/
│   ├── device.js     # enumerate GMK104 hidraw interfaces, open by usage page
│   ├── via.js        # VIA codec: protocol version, layer count, get/set keymap buffer
│   └── keycodes.js   # minimal keycode -> label map
├── test-handshake.js # proves comms + reads back real keys from the keyboard
└── package.json
```

## Run the handshake probe

```bash
cd gui
npm install
# grant access to the VIA + screen interfaces (resets on replug — see udev note):
#   find them: ls -l /dev/hidraw*   (match the VIA/screen nodes)
sudo chmod 666 /dev/hidraw2 /dev/hidraw4     # node numbers vary; VIA=0xFF60, SCREEN=0xFF1C
node test-handshake.js
```

Expected output ends with the real top row decoded from the device:

```
layer 0, keys 0-13:
  Esc  F1  F2  F3  F4  F5  F6  F7  F8  F9  F10  F11  F12  PrtSc
  ✅ Two-way VIA comms confirmed; keymap is readable via the buffer protocol.
```

The hidraw node numbers change across replugs; the code finds the right interface **by usage page**,
not by node number, so only the `chmod` targets need updating (a udev rule will remove even that).

## Notes / gotchas (learned during bring-up)

- This firmware **emulates** VIA. The single-key `get_keycode` (0x04) returns a **non-standard**
  frame and must not be used. The **bulk buffer** commands (`get_buffer` 0x12 / `set_buffer` 0x13)
  are fully standard and are the correct path — same as usevia.app.
- Reported VIA protocol version is `0xFF` (a quirk of the emulation); not a problem for buffer I/O.
- Closing the Windows "Image Custom Tool" (or any Wine HID holder) is required before this can open
  the interfaces — only one process can hold a hidraw node.
- Keymap buffer size = `layers × rows × cols × 2` bytes; read/written in 28-byte chunks.

## Next (when we resume)

1. udev rule for passwordless access to the `320F` hidraw interfaces.
2. Electron shell wiring `src/` into a window (main ↔ renderer IPC).
3. Keymap-grid editor from the VIA JSON layout (read → edit → `set_buffer` write).
4. Screen uploader: port the [screen codec](../screen-re/decode_screen.py) — image → 180×180 → RGB565-BE → upload.
5. RGB control, profiles, AppImage/Flatpak packaging.

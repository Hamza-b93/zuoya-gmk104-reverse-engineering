# zuoya-control (Track A — Linux GUI, no flashing)

A desktop app to configure the ZUOYA GMK104's **keys** and **color screen** from Linux by
talking to the **stock firmware** over `hidraw`. Nothing is flashed, so 2.4G / screen / RGB stay
100% intact. See [`../docs/09-roadmap.md`](../docs/09-roadmap.md) for how this fits the bigger plan.

**Stack (chosen):** Electron + Node (`node-hid`) + a web frontend styled with Tailwind CSS.

## Status — device layer verified; Electron shell up

The hardware/device layer is **done and verified on real hardware**. The Electron shell now boots
and surfaces three capabilities (detect device, read keymap, upload image) over a secure IPC bridge.
Run it with `npm start`. Next: the keymap-grid editor and a Tailwind build step.

| Piece | State |
|---|---|
| Device discovery by HID usage page (VIA / screen / OTA) | ✅ working |
| VIA keymap **read** (`get_buffer` 0x12) → decodes to real keys | ✅ verified |
| VIA keymap **write** (`set_buffer` 0x13) | ✅ implemented, not yet exercised |
| Layer count (= 4) | ✅ |
| Screen upload protocol (180×180 RGB565-BE) | ✅ fully RE'd ([docs/08](../docs/08-screen-protocol.md)) |
| Screen codec (`src/screen.js`) | ✅ ported; matches the captured upload offline (`npm run test:screen`). |
| Screen device write (`src/screen-device.js`) | ✅ verified on hardware: four-quadrant test pattern (`node send-test-pattern.js`) shows the correct orientation. |
| Electron shell (window + secure IPC bridge) | ✅ boots; `main.js` + `preload.cjs` + `renderer/`. `npm start`. |
| App UI — detect device, read keymap, upload image | ✅ first pass: three cards wired to the device layer over IPC. |
| Image → screen CLI + decoder (`src/image.js`, `upload-image.js`) | ✅ `npm run upload -- photo.png`; offline test `npm run test:image`. |
| Keymap-grid editor UI (edit + `set_buffer` write-back) | ⬜ not started |
| Styling: hand-rolled CSS for now; Tailwind build step | ⬜ not wired (CSS in `renderer/style.css`) |
| udev rule (`linux/92-zuoya-via.rules`) | ⚠️ installed to `/etc/udev/rules.d/`, but its `uaccess` ACL was not applied on the test machine. The screen node was opened with `chgrp wheel` + `chmod 0660` instead. |

## What's here

```
gui/
├── main.js           # Electron main: owns all device I/O, exposes typed IPC handlers
├── preload.cjs       # contextBridge: exposes window.zuoya to the renderer (no raw ipc/Node)
├── renderer/         # UI: index.html + style.css + renderer.js (talks only to window.zuoya)
├── src/
│   ├── device.js     # enumerate GMK104 hidraw interfaces, open by usage page
│   ├── via.js        # VIA codec: protocol version, layer count, get/set keymap buffer
│   ├── keycodes.js   # minimal keycode -> label map
│   ├── screen.js     # screen codec: RGB888 -> RGB565-BE reports (offline, no I/O)
│   ├── screen-device.js # write screen reports to the 0xFF1C node
│   └── image.js      # decode any image file -> 180x180 RGB888 (sharp)
├── upload-image.js   # CLI: upload an image file to the screen (npm run upload)
├── test-handshake.js # proves comms + reads back real keys from the keyboard
├── test-screen-codec.js # offline codec test (npm run test:screen)
├── test-image.js     # offline image-decoder test (npm run test:image)
├── send-test-pattern.js # four-quadrant orientation test on the device
└── package.json
```

## Run the app

```bash
cd gui
npm install
npm start        # launches the Electron window
```

The window has three cards — **Detect** (lists the hidraw interfaces by usage page), **Read keymap**
(VIA protocol version, layer count, decoded top row), and **Upload image…** (file picker → 180×180 →
screen). Each button calls the same verified device layer the CLIs use, over the `preload.cjs` bridge.
It needs the same hidraw access as the probe below (udev rule or the `chgrp` fallback).

## Run the handshake probe

```bash
cd gui
npm install
# grant access to the VIA + screen interfaces (fallback if the udev ACL isn't applied; resets on replug):
#   find them: ls -l /dev/hidraw*   (VIA=0xFF60, SCREEN=0xFF1C; node numbers vary)
sudo chgrp wheel /dev/hidraw2 /dev/hidraw4 && sudo chmod 0660 /dev/hidraw2 /dev/hidraw4
node test-handshake.js
```

Expected output ends with the real top row decoded from the device:

```
layer 0, keys 0-13:
  Esc  F1  F2  F3  F4  F5  F6  F7  F8  F9  F10  F11  F12  PrtSc
  ✅ Two-way VIA comms confirmed; keymap is readable via the buffer protocol.
```

The hidraw node numbers change across replugs; the code finds the right interface **by usage page**,
not by node number, so only the access targets need updating (the udev rule should remove even that once its ACL applies).

## Test the screen upload

```bash
npm run test:screen         # offline codec test against the captured Windows-tool upload
npm run test:image          # offline image-decoder test (decode -> 180x180 RGB888)
node send-test-pattern.js   # sends a four-quadrant pattern to the keyboard screen
```

## Upload an image to the screen

```bash
npm run upload -- path/to/photo.png          # or: node upload-image.js photo.png
node upload-image.js photo.jpg --fit contain --bg '#101010'
```

Any format sharp reads (PNG/JPG/WebP/GIF/…) is decoded, resized to 180×180 and uploaded.
`--fit cover` (default) fills the square and crops; `--fit contain` fits the whole image and
letterboxes with `--bg`. GIFs upload their first frame (animation is not wired up yet). Close the
Windows tool / Wine first — it holds the hidraw handle.

## Notes / gotchas (learned during bring-up)

- This firmware **emulates** VIA. The single-key `get_keycode` (0x04) returns a **non-standard**
  frame and must not be used. The **bulk buffer** commands (`get_buffer` 0x12 / `set_buffer` 0x13)
  are fully standard and are the correct path — same as usevia.app.
- Reported VIA protocol version is `0xFF` (a quirk of the emulation); not a problem for buffer I/O.
- Closing the Windows "Image Custom Tool" (or any Wine HID holder) is required before this can open
  the interfaces — only one process can hold a hidraw node.
- Keymap buffer size = `layers × rows × cols × 2` bytes; read/written in 28-byte chunks.

## Next (when we resume)

1. Keymap-grid editor from the VIA JSON layout (read → edit → `set_buffer` write) — the first
   write-back path, still never exercised. Needs a fuller keycode table than `src/keycodes.js`.
2. Screen uploader UX in-app: thumbnail/preview before push, drag-and-drop, maybe a live 180×180
   preview canvas. The decode + device path are done (`src/image.js` → `uploadImage`).
3. Swap the hand-rolled `renderer/style.css` for a real Tailwind build step (declared stack).
4. Make udev access work without manual permission changes (the rule is installed; the ACL needs investigating).
5. RGB control via VIA channel 3 only (brightness, effect, speed, global color). A probe of channels 0–7 and value IDs 1–5 found no per-key channel, so per-key/ARGB editing is out of scope. Profiles and AppImage/Flatpak packaging come after that.
6. GIF animation upload (first frame works today) — needs an animated capture to RE the `0x06`
   metadata for multi-frame playback.

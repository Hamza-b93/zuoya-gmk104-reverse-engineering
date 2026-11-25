# Keeb Control (Track A — Linux GUI, no flashing)

**Keeb Control** is an *unofficial, community* desktop app to configure the ZUOYA GMK104's **keys**
and **color screen** — and, increasingly, other compatible VIA keyboards — from Linux by talking to
the **stock firmware** over `hidraw`. Nothing is flashed, so 2.4G / screen / RGB stay 100% intact.
Not affiliated with or endorsed by ZUOYA. See [`../docs/09-roadmap.md`](../docs/09-roadmap.md) for
how this fits the bigger plan.

- **Package id:** `io.github.Hamza-b93.keeb_control`  ·  **License:** GPL-3.0-or-later
- **Stack:** Electron + Node (`node-hid`, `sharp`). UI is hand-rolled CSS for now (Tailwind build
  step is a planned follow-up).

## Status — device layer verified; Electron shell up

The hardware/device layer is **done and verified on real hardware**. The Electron shell now boots
and surfaces three capabilities (detect device, read keymap, upload image) over a secure IPC bridge.
Run it with `npm start`. Device layer, keymap editor and screen upload are all working and
hardware-verified; `v0.1.1` is packaged (AppImage/Snap/Flatpak) as a draft release. Next: make the
app registry-driven so it supports boards beyond the GMK104 (see "Next" at the bottom).

| Piece | State |
|---|---|
| Device discovery by HID usage page (VIA / screen / OTA) | ✅ working |
| VIA keymap **read** (`get_buffer` 0x12) → decodes to real keys | ✅ verified |
| VIA keymap **write** (`set_buffer` 0x13) | ✅ verified on hardware (read-back confirmed) |
| Layer count (= 4) | ✅ |
| Screen upload protocol (180×180 RGB565-BE) | ✅ fully RE'd ([docs/08](../docs/08-screen-protocol.md)) |
| Screen codec (`src/screen.js`) | ✅ ported; matches the captured upload offline (`npm run test:screen`). |
| Screen device write (`src/screen-device.js`) | ✅ verified on hardware: four-quadrant test pattern (`node send-test-pattern.js`) shows the correct orientation. |
| Electron shell (window + secure IPC bridge) | ✅ boots; `main.js` + `preload.cjs` + `renderer/`. `npm start`. |
| App UI — detect device, screen uploader | ✅ cards wired to the device layer over IPC. Screen uploader has drag-and-drop + a 180×180 live preview (fit toggle) + push. |
| Image → screen CLI + decoder (`src/image.js`, `upload-image.js`) | ✅ `npm run upload -- photo.png`; offline test `npm run test:image`. |
| Keymap-grid editor UI (read → click → `set_buffer` write-back) | ✅ built: full board from the VIA JSON, per-layer, keycode picker, write with read-back confirm. Write path **verified on hardware** (`0,0` Esc→Z→Esc round trip, read-back confirmed). |
| Headless write check (`write-key.js`) | ✅ `npm run write-key -- <layer> <row> <col> [code]` — read a cell, or write + confirm, no GUI. |
| KLE layout parser (`src/layout.js`) | ✅ parses the VIA definition; offline test `npm run test:layout`. |
| Diagnostics dump (`doctor.js`) + keyboard registry (`src/registry.js`) | ✅ `npm run doctor` writes a redacted report for issue-based board support. |
| Packaging (AppImage / Snap / Flatpak) | ✅ electron-builder config + CI release workflow. AppImage build verified; Snap/Flatpak via CI. |
| Live game stats on the screen (Dota 2) | ✅ pipeline built + offline-verified (GSI listen → parse → render → codec frame). Device streaming not yet run on hardware. `npm run game`. |
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
│   ├── keycodes.js   # keycode <-> label map + grouped picker palette
│   ├── layout.js     # parse the VIA KLE layout -> positioned keys + matrix; keymap offsets
│   ├── registry.js   # known-keyboard registry (VID/PID + usage pages); generalization seed
│   ├── screen.js     # screen codec: RGB888 -> RGB565-BE reports (offline, no I/O)
│   ├── screen-device.js # write screen reports to the 0xFF1C node (one-shot)
│   ├── screen-stream.js # stream frames for live content (keeps handle open, latest-wins)
│   ├── render.js     # compose a 180x180 RGB888 frame from a scene (SVG -> sharp)
│   ├── image.js      # decode any image file -> 180x180 RGB888 (sharp)
│   └── providers/
│       └── dota2.js  # Dota 2 Game State Integration listener + parser (+ config generator)
├── game-screen.js    # CLI: live game stats on the screen (npm run game) — Dota 2 today
├── doctor.js         # read-only diagnostic dump of HID keyboards (npm run doctor)
├── upload-image.js   # CLI: upload an image file to the screen (npm run upload)
├── write-key.js      # CLI: read/write one keymap cell with read-back (npm run write-key)
├── build/icon.png    # app icon for electron-builder
├── test-handshake.js # proves comms + reads back real keys from the keyboard
├── test-*.js         # offline tests (npm run test:screen / test:image / test:layout)
├── send-test-pattern.js # four-quadrant orientation test on the device
└── package.json      # scripts + electron-builder config
```

## Run the app

```bash
cd gui
npm install
npm start        # launches the Electron window
```

Two tabs:
- **Device & Screen** — **Detect** (lists the hidraw interfaces by usage page) and a **Screen**
  uploader: drag an image onto the card (or **Choose image…**), see a 180×180 preview of exactly
  what the panel will show (updates live with the **Fit** toggle: cover/crop or contain/letterbox),
  then **Push to screen**.
- **Keymap** — renders the full board from the VIA JSON, one layer at a time. **Read from keyboard**
  pulls every layer's keycodes; click a key, pick a new keycode, and it's written over VIA
  (`set_buffer`) and read back to confirm.

Each action calls the same verified device layer the CLIs use, over the `preload.cjs` bridge. It needs
the same hidraw access as the probe below (udev rule or the `chgrp` fallback).

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

## Live game stats on the screen (Dota 2)

The screen is a dumb 180×180 panel — it shows whatever frame the host pushes. "Dynamic" content
means the app renders a fresh frame when the data changes and streams it. A full frame is ~1177 HID
reports (~1 report/ms over USB), so expect ~1–1.5 s per frame: ideal for slow-changing data like a
scoreboard, not for video.

**Dota 2** is wired up via Valve's Game State Integration (GSI): Dota POSTs live match state to a
local HTTP endpoint we run, and we render K/D/A (+ hero, net worth) to the screen.

```bash
npm run game -- --print-config    # prints the GSI config file + where to put it (no device needed)
# ...save that file, add -gamestateintegration to Dota 2's launch options...
npm run game                      # listen on 127.0.0.1:3200 and stream KDA to the screen
```

Pieces: `src/providers/dota2.js` (GSI listener + a defensive parser for the `player` section, which
differs between playing and spectating), `src/render.js` (scene → SVG → 180×180 RGB888 via sharp),
`src/screen-stream.js` (keeps the `0xFF1C` handle open and streams frames, newest wins). Offline
tests in `test-game.js`. Adding another game = a new provider under `src/providers/` that emits the
same normalized shape (CS2 also has GSI; League has the Live Client Data API).

## Packaging (AppImage / Snap / Flatpak)

electron-builder config lives in `package.json` (`build`). Targets: AppImage (reliable),
Snap and Flatpak.

```bash
npm run pack        # unpacked app dir (fast smoke test)
npm run dist        # AppImage
npm run dist:all    # AppImage + Snap + Flatpak (needs snapcraft + flatpak-builder installed)
```

- **v0.1.1 built successfully in CI** — AppImage (147 MB), Snap (127 MB) *and* Flatpak (108 MB) all
  produced and attached to a **draft** GitHub Release (unpublished as of writing; smoke-test the
  AppImage on a clean machine before publishing).
- **Releases via CI:** `.github/workflows/release.yml` builds AppImage (+ best-effort Snap/Flatpak)
  on a `v*` tag and attaches them to a **draft** release — stays private until you click *Publish*.
  CI installs `libusb-1.0-0-dev` + `libudev-dev` first, which node-hid's native rebuild needs.
- **Store publishing (Snap Store / Flathub / AUR) is deferred.** Each needs your own account and,
  for Flathub, a reviewed PR; none can be done from CI alone. When you're ready, the build artifacts
  are already produced — see the roadmap's distribution notes.
- **Gotcha:** node-gyp cannot rebuild native modules (node-hid) when the project path contains a
  space. This repo's folder is `ZUOYA GMK104` (has a space), so `npm run dist` fails *locally*.
  CI checks out to a space-free path, so it's unaffected; to build locally, copy `gui/` (plus the
  VIA JSON) to a path with no spaces first.

## Support another keyboard

The device layer matches interfaces by **HID usage page**, not by a hardcoded GMK104 id, so other
VIA keyboards (usage page `0xFF60`) can often be driven with no code change. To add one:

1. Run the read-only diagnostic and share the result:
   ```bash
   npm run doctor        # writes zuoya-doctor-report.md — no serials, no personal data
   ```
2. Open a **Keyboard support request** issue (template in `.github/ISSUE_TEMPLATE/`) and paste the
   dump. It shows every interface, which ones are VIA/OTA/screen, and the HID report descriptors.
3. Add the board to `src/registry.js` (`KNOWN_KEYBOARDS`). Keymap works for any VIA board; the
   **screen** tool additionally needs a `0xFF1C` interface that speaks the GMK104 upload protocol,
   which has to be confirmed per board (that's what the dump is for).

> **Note:** the registry + diagnostics are in, but the GUI does not yet *load* a board from the
> registry — it still reads the GMK104 layout at startup. Making layout loading registry-driven is
> the top "Next" item below; until then, adding a board to the registry doesn't fully wire it into
> the editor.

## Notes / gotchas (learned during bring-up)

- This firmware **emulates** VIA. The single-key `get_keycode` (0x04) returns a **non-standard**
  frame and must not be used. The **bulk buffer** commands (`get_buffer` 0x12 / `set_buffer` 0x13)
  are fully standard and are the correct path — same as usevia.app.
- Reported VIA protocol version is `0xFF` (a quirk of the emulation); not a problem for buffer I/O.
- Closing the Windows "Image Custom Tool" (or any Wine HID holder) is required before this can open
  the interfaces — only one process can hold a hidraw node.
- Keymap buffer size = `layers × rows × cols × 2` bytes; read/written in 28-byte chunks.

## Next (when we resume)

1. **Multi-board plumbing (top priority).** The GUI still hardcodes the GMK104 VIA JSON
   (`main.js` → `viaDefPath()`). Make layout loading registry-driven: detect the connected board,
   load its registered definition, and show a graceful "run `doctor` / unsupported board" state for
   ones with no definition yet. This is what makes the app usable by people with other keyboards.
2. **Verify a remap survives a replug** (persists to flash, not just RAM) and that there's no VIA
   commit/save step. Keymap write is otherwise hardware-verified. Use `npm run write-key`.
3. ✅ *Done:* screen uploader UX (drag-and-drop + 180×180 live preview + push). Possible follow-ups:
   paste-from-clipboard, recent images, and an in-app preview for the live widgets.
4. Swap the hand-rolled `renderer/style.css` for a real Tailwind build step (declared stack).
5. Make udev access work without manual permission changes (the rule is installed; the ACL needs investigating).
6. RGB control via VIA channel 3 only (brightness, effect, speed, global color). A probe of channels 0–7 and value IDs 1–5 found no per-key channel, so per-key/ARGB editing is out of scope.
7. GIF animation upload (first frame works today) — needs an animated capture to RE the `0x06`
   metadata for multi-frame playback.
8. Store listings (AUR / Flathub / Snap Store) — deferred until the AppImage is smoke-tested on a
   clean machine and a few others have used it.

The picker now covers letters/numbers/function/modifiers/nav/punctuation plus Media, System & Web,
Edit-actions and Layers, and has a raw-keycode box for any 16-bit VIA code. Media/system labels use
the classic QMK keycode values; the write read-back will reveal any the firmware maps differently.

# Project Roadmap — Two Tracks

Taking the GMK104 work from "reverse-engineered" to two concrete deliverables:

- **Track A — a modern Linux GUI** to configure the keyboard + screen **without flashing** (for people
  who want their keyboard fully open-configurable but risk-free, keeping 2.4G/screen/RGB 100% intact).
- **Track B — open on-device firmware** (ZMK/Zephyr-based) that can be safely flashed, with the
  stretch goal of **preserving the 2.4 GHz link**.

Track A is near-term and low-risk; Track B is a longer research project. They're independent — A
ships value regardless of whether B ever lands.

---

## Track A — "ZuoyaControl" (Linux GUI, no flashing)

A desktop app that talks to the **stock firmware** over `hidraw`. Nothing is flashed, so every
hardware feature stays intact. This is the host-side "compatibility layer."

### Features
1. **Key remapping** — read/write the keymap, layers, and macros via the **VIA protocol**
   (usage page `0xFF60`, `/dev/hidrawX` = interface 1). The repo's VIA JSON defines the matrix/layout.
2. **Screen upload** — drag-drop an image/GIF, preview at **180×180**, push it using the
   protocol in [08-screen-protocol.md](08-screen-protocol.md) (`0xFF1C`, interface 3). The device write
   path and orientation are verified; image decoding is still to do.
3. **RGB / lighting** — global effect, brightness, speed, and color over VIA channel 3 (read path
   verified). Per-key/ARGB is **not** exposed: a probe of channels 0–7 found no per-key channel.
4. **Quality-of-life** — auto-detect the device, wired/2.4G mode indicator, save/load profiles,
   AppImage/Flatpak packaging so non-technical users just run it.

### Architecture
```
┌─────────────── GUI (Electron + Tailwind) ───────────────┐
│  keymap editor · screen canvas · RGB panel · profiles   │
└───────────────┬─────────────────────────────────────────┘
                │ IPC
┌───────────────▼── device layer (Node + node-hid) ───────┐
│  hidraw open/enumerate (match usage page in report desc) │
│  VIA protocol codec (0xFF60)   screen codec (0xFF1C)     │
└──────────────────────────────────────────────────────────┘
```
- **VIA codec**: implement the standard VIA HID commands (protocol version, layer count,
  get/set keycode, dynamic keymap, macros, lighting) — these are documented in VIA/QMK and are the
  same commands usevia.app sends. We already have the matrix JSON.
- **Screen codec**: port the already-recovered protocol (RGB565-BE, 64-byte reports, checksum,
  prologue/stream/epilogue). The [decoder](../screen-re/decode_screen.py) is the reference.

### Tech stack — **decided: Electron**
Chosen by the user: Electron + Node (`node-hid`) + Tailwind CSS (see [gui/README.md](../gui/README.md)).
Tauri was the original recommendation here; it was not chosen. GTK4/libadwaita was not pursued.

### Phases
- **A1 — device layer**: ✅ done. Enumerate + open the right hidraw nodes by usage page; VIA
  handshake (protocol version, layer/keymap read). Proves two-way comms.
- **A1.5 — Electron shell**: ✅ done. Window + secure IPC bridge (`main.js`/`preload.cjs`/`renderer/`)
  surfacing detect-device, read-keymap and upload-image. Boots and talks to the device layer.
- **A2 — keymap editor**: ✅ UI built — full board rendered from the VIA KLE layout (`src/layout.js`),
  per-layer, click-to-pick keycode, write via `set_buffer` with read-back confirm. Write path
  **verified on hardware** (single-cell Esc→Z→Esc round trip). Remaining: confirm a remap survives
  a replug (persisted to flash, not just RAM).
- **A3 — screen tool**: ✅ device write + orientation verified; ✅ image import/decode done
  (`src/image.js`, `upload-image.js` CLI + in-app upload). Still: GIF animation and a preview canvas.
- **A4 — RGB + polish + packaging**: RGB scope decided (global effect/brightness/speed/color only,
  not yet wired in the UI). ✅ Packaging set up — electron-builder (AppImage verified; Snap/Flatpak
  via CI on a `v*` tag). Profiles not started.
- **A5 — widen hardware support**: ✅ started. Device registry (`gui/src/registry.js`) + a read-only
  diagnostics dump (`gui/doctor.js`) + a GitHub issue form so owners of other VIA keyboards can
  request support. Keymap generalizes by usage page; the screen tool needs per-board confirmation.

---

## Track B — Open on-device firmware (flashing)

Replace the stock firmware with an open, ZMK/Zephyr-based image. (**QMK is permanently out** — it has
no Telink RISC-V port.) ZMK already runs on this exact chip family (`scholzri/rainy75-zmk`), and this
repo has a draft board port in [`../zmk-port/`](../zmk-port/) with the matrix GPIOs confirmed.

### The 2.4 GHz problem — read this first
This is the crux and the biggest risk. The 2.4G link is a **proprietary Acrox RF protocol** spoken
between the keyboard and its specific dongle. There is **no open-source stack** for it. ZMK/Zephyr
gives **BLE + wired**, not this. So:

- **B as "ZMK, accept 2.4G loss"** → achievable (BLE replaces the dongle for wireless).
- **B as "ZMK *and* keep the 2.4G dongle working"** → requires reverse-engineering the Acrox RF
  register-level protocol on the keyboard **and** matching it on the dongle's firmware. This is a
  separate, open-ended **radio-RE research spike** that may prove infeasible without the dongle's
  firmware/registers. We treat it as a go/no-go investigation, not a committed deliverable.

### Delivery & safety
The vendor OTA uses a **CRC16 integrity check, not a cryptographic signature** (see
[03](03-firmware-and-flashing.md)). So a custom image with the right markers can likely be loaded
**through the existing OTA path — no case-opening — with the stock bootloader kept as a recovery
route.** That is what makes B "safely flashable" rather than a soldering job.

### Phases
- **B1 — ZMK board brings-up**: finish the [board port](../zmk-port/), build, flash via the OTA path on
  a test unit, get basic matrix typing + RGB. (2.4G not yet; BLE/wired only.)
- **B2 — screen driver**: disassemble the stock firmware's display-init (find the panel controller,
  SPI pins, init commands — same method that recovered the matrix GPIOs), then write a **Zephyr
  display driver** for the 180×180 RGB565 panel. We already know its resolution/format.
- **B3 — config coexistence**: expose **ZMK Studio** (and optionally a VIA-compatible endpoint) so
  it's configurable by the same class of tools as stock — ideally by **Track A's GUI** too.
- **B4 — 2.4G research spike**: attempt to RE + reimplement the Acrox RF link. High risk; may end in
  "not feasible, use BLE." Decided on evidence, not hope.

---

## Sequencing & how the tracks meet
1. **Start Track A** — fastest real value, serves the no-flash majority, and forces us to implement a
   clean VIA + screen device layer…
2. …**which Track B reuses**: if ZMK exposes VIA/Studio, the *same GUI* configures both stock and
   open firmware. The device layer built in A1–A3 is the bridge between the tracks.
3. **Track B proceeds in parallel/after**, gated at B4 on the honest 2.4G answer.

## Risk register
| Item | Risk | Mitigation |
|---|---|---|
| 2.4G preservation (B4) | **High** — may be infeasible | Scope as go/no-go spike; ship BLE as the fallback |
| Bricking on flash (B1) | Medium | Use CRC-OTA path; keep stock bootloader as recovery; dump stock FW first (done) |
| Screen driver (B2) | Medium | Resolution/format known; method proven on the matrix GPIOs |
| VIA RGB coverage (A4) | Resolved | Only global effect/brightness/speed/color on channel 3; per-key not exposed |
| hidraw permissions (A) | Low | udev rule in `linux/` is installed but its ACL didn't apply on the test machine; `chgrp wheel` workaround in [gui/README.md](../gui/README.md) |

## Decision (resolved)
**GUI stack: Electron** (chosen by the user). Tauri was the original recommendation.

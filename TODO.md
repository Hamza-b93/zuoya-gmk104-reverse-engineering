# TODO — deferred build directions

Parking lot for work scoped but not yet started. The committed roadmap lives in
[`docs/09-roadmap.md`](docs/09-roadmap.md); this file is the short "what's next"
queue so nothing gets lost between sessions.

_Last updated: 2026-11-26._

## Recently done
- **RGB + profiles (A4)** — ✅ built: VIA lighting panel (effect / brightness /
  speed / color on custom channel 3) + save/load profiles. Offline-tested; still
  to verify on hardware (effect-index range, flash persistence).
- **Macros editor** — ✅ built: VIA dynamic-macro codec (`src/macros.js`) + a
  **Macros** tab (text / tap / hold / release / delay steps, byte budget, write +
  reset). Codec offline-tested (`test-macros.js`). **Unverified on hardware** —
  the stock VIA-emulation firmware may not implement the macro commands; the read
  path reports "no macro support" gracefully if so.
- **CS2 screen provider + Now Playing widget** — ✅ built: CS2 live stats via GSI
  (shared `src/providers/gsi-server.js` + `src/providers/cs2.js`, `--game cs2`),
  and a **Now Playing** widget (`src/providers/nowplaying.js`) showing the running
  Steam/Lutris game's **logo** (Steam reliable via `/proc`+`registry.vdf`+local art;
  Lutris best-effort; no web API). Parsers offline-tested (`test-cs2.js`,
  `test-nowplaying.js`). Not yet streamed to real hardware.

## Track B — open ZMK firmware (flashing)
Full analysis in [`docs/05-zmk-porting-plan.md`](docs/05-zmk-porting-plan.md) /
[`docs/03`](docs/03-firmware-and-flashing.md). Verdict: **GO as a project**, the
no-case-opening OTA path is confirmed, and the board scaffold + all row GPIOs +
RGB count are already resolved on paper. Remaining work is hardware + toolchain
gated. **Decide the tradeoffs first: ZMK = USB + BLE only — you lose the 2.4 GHz
dongle and the screen.**

Doable now (desk work, zero risk):
- [ ] **OTA preflight probe** — a read-only helper that confirms the stock YKQ
      flasher talks to *this* unit (`ota_flasher.py --version` equivalent) before
      any write. Proves the no-case path on the real board without flashing.
- [ ] **Flash runbook** — step-by-step: fork `scholzri/rainy75-zmk`, Zephyr SDK
      0.17.0 workspace, build combined MCUboot+ZMK + bridge, OTA install, mcumgr
      DFU, `restore_stock.sh` recovery. Plus a pre-flight safety checklist.

Hardware + toolchain gated (needs the keyboard, a Zephyr build, and acceptance
of the risk):
- [ ] Stand up the rainy75-zmk build workspace; build the `zuoya_gmk104` image.
- [ ] First **diagnostic flash** via stock OTA; confirm the "likely" column GPIOs,
      resolve the duplicated `RC(7,13)` cell, verify the RGB position→index map.
- [ ] Iterate matrix + RGB in ZMK Studio until all keys/LEDs are correct.
- [ ] **Brick insurance:** have a Telink Burning EVK (SWS/PA7 recovery) ready
      before the first write — the only confirmed B91 programmer.

Related:
- [ ] **OpenRGB** — not worthwhile on stock firmware (no per-key channel; a driver
      would only re-expose the global-only ceiling the Lighting tab already has).
      **Note: flashing ZMK does NOT give OpenRGB support.** OpenRGB only drives a
      keyboard via a native vendor protocol or **QMK's** OpenRGB direct-mode
      feature; ZMK implements neither, and the QMK path is closed on this chip
      (no Telink target). ZMK unlocks *per-key RGB on the device* (configured in
      ZMK / ZMK Studio), but OpenRGB-the-app still won't talk to it without
      net-new work: an OpenRGB-protocol endpoint **inside** the ZMK firmware **+**
      an OpenRGB driver for it (neither exists; also cuts against ZMK's low-power
      BLE model). More tractable alternative if host-side RGB control is the goal:
      give **Keeb Control** its own ZMK RGB control path — we own both ends.

## Queued (picked from the A6 / A3 "Next" lists)
- [ ] **More live providers (A6)** — ✅ CS2 + Now Playing done. Remaining: **League
      Live Client Data** (localhost:2999), a **media / now-playing** widget (MPRIS
      on Linux), and **desktop notifications** on the screen. Same render→stream
      pipeline; no new hardware deps.
- [ ] **GIF animation + preview (A3)** — animated GIF upload to the 180×180
      panel plus a live preview canvas in the screen tab.
- [ ] **Partial-region screen updates (A6)** — use the protocol's arbitrary
      offset writes so only changed regions stream, cutting per-frame bytes.
      Full payoff needs on-device refresh-rate measurement.

## App features (GUI)
- [ ] **Encoder / knob mapping** — the GMK104 has an encoder (`RC(5,4/6/7)`); expose
      CW/CCW/press binding instead of raw-code guessing.
- [ ] **Auto-detect on launch + hotplug** — poll or `usb-detection` so the device
      appears without clicking **Detect**, with a live wired/2.4G mode indicator.
- [ ] **Keycode picker search** — filter the palette; the full VIA code space is big.
- [ ] **"Reset keymap to default"** — reflash the stock layout from the VIA JSON.
- [ ] **Kanata config generator** — host-side advanced remapping is the documented
      power path ([docs/02](docs/02-linux-setup.md)); let the app emit/apply a Kanata
      config so layers/combos/tap-hold work beyond what the firmware allows.

## Quality & infra
- [ ] **Aggregate `npm test` + CI test workflow** — there's only `release.yml`; run the
      unit suite (screen/image/layout/game/widgets/lighting/profiles) on push/PR.
      Needs the handshake probe kept out of the glob (it exits non-zero with no board).
- [ ] **ESLint + Prettier** — no lint/format config today; the editor flags constant
      style drift. Pin a config so contributions stay consistent.
- [ ] **Permissions doctor / udev installer** — the shipped `uaccess` rule didn't apply
      on the test machine (chgrp-wheel workaround). A guided fix + a clear "hidraw
      permission denied" error path. Known issue in [gui/README.md](gui/README.md).

## Distribution & docs (from the roadmap's deferred list)
- [ ] **AUR `-bin` PKGBUILD** + `.SRCINFO` wrapping the release AppImage.
- [ ] **Flathub submission** — Flatpak manifest + AppStream metainfo, PR to flathub.
- [ ] **Snap Store** — register the name, store credentials secret, `snapcraft upload`.
- [ ] **README screenshots / demo GIF** + a `CONTRIBUTING.md` — the app has five tabs
      now and nothing visual in the docs.

## Hardware breadth (A5)
- [ ] **User-supplied VIA JSON loader** — drop any VIA definition so other boards get
      the keymap editor without a code change (generalizes past the bundled GMK104 JSON).

## Hardware-gated (needs the keyboard plugged in)
- [ ] Confirm a remap **survives a replug** (persisted to flash, not just RAM) — A2.
- [ ] Run widgets / game screen **on device** and measure the real sustainable
      refresh rate — A6.
- [ ] Per-board **screen** confirmation for non-GMK104 VIA boards — A5.

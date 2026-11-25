# ZMK Porting Plan & Flash-Path Feasibility — GMK104

A GMK104-specific checklist built from [`scholzri/rainy75-zmk`](https://github.com/scholzri/rainy75-zmk),
which is a hardware-verified open ZMK port for the **same Evision TLSR9511/B91 platform**.
This is the "is it a weekend or a month, and can we do it without opening the case" analysis.

---

## Go / no-go summary

| Question | Verdict |
|---|---|
| Is the GMK104 the same platform as a board ZMK already runs on? | ✅ **Yes** — Evision "YKQ" / Telink TLSR9511, shared VID/PID `320F:5055`/`5088`, shared 8×16 matrix, VIA-V3 branch. Your updater is literally trademarked **YKQ**, the same developer-initials string rainy75 found inside the firmware. |
| Can ZMK be flashed **without opening the case**? | ✅ **Yes (confirmed)** — the GMK104 uses the **identical** stock OTA protocol rainy75 already drives: the same **YKQ `KM_USB_mode_ota_pc` v5.0.2** flasher. Every constant matches (VID/PID `320F:5055`, usage page `0xFFEF`, report ID `05`, interface 2, CRC16 poly `0xA001`, cmd `0x01`/`0x02`). rainy75's `ota_flasher.py` should talk to the GMK104 as-is; its only gate is a CRC16 integrity check, not a signature. |
| Is this a from-scratch port? | ❌ **No** — it's a **delta port**. Most of rainy75-zmk (SoC, open BLE, USB, RGB driver, DFU flow) transfers. |
| Realistic effort | **Days-to-weeks** for someone comfortable with Zephyr + hardware bring-up — dominated by resolving the matrix/RGB deltas. Not a one-click flash. |
| What you give up | **2.4 GHz dongle** (not ported anywhere), **the OLED screen** (no driver), **VIA** (replaced by ZMK Studio). USB + BLE only. |

**Bottom line: GO, as a project** — and the no-case-opening path is very likely available,
with a hardware SWS programmer needed only as brick insurance.

---

## Why this is a delta port, not a rewrite

rainy75-zmk already solved the hard, platform-generic parts for TLSR9511/B91:

- ✅ B91 Zephyr SoC + **blob-free open BLE controller** (no proprietary Telink blob)
- ✅ B91 drivers: USB device, **SPI WS2812 RGB** (PB7 PSPI MOSI, DMA), battery ADC
- ✅ **MCUboot bootstrap over the stock OTA** + mcumgr DFU + `restore_stock.sh`
- ✅ A documented **reference pinout** (the Evision TLSR9511 design, likely shared with us)
- ✅ Tooling: `via_dump_keymap.py` (VIA JSON → ZMK keymap), `extract_stock_firmware.py`
  (the same `code_2M`/`TLNK` extraction already proven on our GMK104 image)

What the GMK104 does **not** inherit is its own physical layout — that's the work.

## The flash path (how the no-case-opening install works)

rainy75's `install_zmk.sh`, all over USB, no debugger:

1. Uses the **stock Evision/YKQ OTA protocol** (raw HID) to flash a small **bridge**
   firmware into flash bank 1.
2. The bridge writes the full **MCUboot + ZMK** image to `0x0` via a RAM trampoline and
   resets into ZMK.
3. From then on, updates use standard **mcumgr DFU**; `restore_stock.sh` reverts.

**Why the CRC gate isn't a blocker:** the GMK104 updater rejects images with
`"Firmware CRC is wrong，illegal firmware"` — but that's a **CRC16 integrity check, not a
signature**. Any custom image with a correct CRC passes. That's precisely what the bridge
relies on, and it's a platform constant, so it should hold on the GMK104.

### The one thing to verify first (DFU feasibility gate)

Compare the **GMK104 stock OTA report format** against rainy75's bridge flasher:
- GMK104 side (already reversed here): raw HID, **UsagePage `0xFFEF`, ReportID `05`**,
  `OTA_CMD`, `crc16`, regions `code_2M`/`param_128K` — see [`03-firmware-and-flashing.md`](03-firmware-and-flashing.md).
- rainy75 side: `reverse/tools/` (`rainy75_dfu.py`, the OTA flasher, `extract_stock_firmware.py`).

If the packetization matches (very likely — same YKQ OTA), the no-case path is a go. If it
differs in detail, the flasher needs small adjustments, or you fall back to the SWS EVK.

## The GMK104 deltas to resolve (the actual work)

### 1. Matrix — the main delta
- rainy75 (75%, 6 rows) wires: **cols** = `PE4-7, PA0-4, PB1-6, PC1` (16); **rows** =
  `PE0, PD2-PD6` (6).
- The GMK104 is **full-size, 8 rows × 15 cols** (per its VIA JSON). Columns almost
  certainly reuse the same platform pins (15 of the 16). **Rows need 2 more GPIOs** than
  the Rainy uses — the likely candidates are pins the Rainy leaves "unused/other": **PE3**
  (already referenced in shared platform code as key position `0x408`), and one of
  `PB0 / PE1 / PE2`.
- **How to resolve:** either (a) RE the GMK104 stock firmware's `gpio_matrix_init()`
  (we already have the image), or (b) flash a ZMK/diagnostic build and probe GPIO
  registers the way rainy75 did (`boot_diag`-style). (b) is easier *once* the OTA flash
  path is confirmed.

### 2. RGB — count + order
- Data pin `PB7` and the `PC2` LED-power MOSFET are likely identical. **LED count and the
  per-key physical order differ** (full-size ≈ 104+ LEDs vs the Rainy's 83). Need the
  GMK104's LED count and a position→LED-index map (derive from the VIA layout + probing).

### 3. Keymap / layout
- Convert `ZUOYA-GMK104-USB.json` → ZMK keymap with rainy75's `via_dump_keymap.py`. The
  8×15 matrix and key positions are already in the JSON.

### 4. The OLED screen — out of scope
- Color TFT (~180×180), proprietary HID upload, no ZMK driver anywhere. Leave it dark for
  a first bring-up; a driver is a separate RE project — see [`04-screen-image-tool.md`](04-screen-image-tool.md).

### 5. Battery / misc
- Battery ADC likely `PD1` (platform default); confirm during bring-up.

## Phased plan

1. **Verify the flash path** (desk work): diff the GMK104 OTA protocol vs rainy75's flasher.
   Decide no-case vs SWS-required. *(I can do most of this from the files already here.)*
2. **Backup first:** extract the stock OTA image (done — `extracted/…V0111.bin`) and, ideally,
   acquire a Telink EVK to take a *full* flash dump (captures per-device calibration + BT MAC
   at `0xFE000`) before writing anything.
3. **Scaffold the board:** copy `zmk/boards/rainy75` → `zuoya_gmk104`, set the layout, convert
   the keymap, start matrix cols from the platform pinout, rows as best-guess.
4. **First flash (diagnostic):** build + OTA-flash a minimal/diagnostic image; read GPIO
   registers to confirm the 8 row pins + 15 col pins + RGB count.
5. **Iterate** matrix + RGB map until all keys/LEDs are correct (OTA re-flash each time;
   `restore_stock.sh` as the safety net).
6. **Polish:** BLE profiles, battery, deep sleep, ZMK Studio, keymap.

## What you need

- **Linux** + a Zephyr toolchain: **Zephyr SDK 0.17.0 (exactly)**, west, `hal_telink`,
  MCUboot (pinned via rainy75's manifest), built in an **Arch distrobox**. `mcumgr` CLI.
- **Brick insurance (strongly recommended):** a **Telink Burning EVK** (`TLSRGSOCBK56B`) —
  the *only* confirmed SWS programmer for B91 (the open pvvx/TLSRPGM tools are TLSR82xx-only;
  an FTDI cannot bit-bang B91 SWS). Recovery = 3 wires to the **SWS/VCC/GND** pads by the
  MCU; SWS is **PA7**. See rainy75's `docs/recovery.md`.
- Basic hardware tools (opening the case, a multimeter/logic probe) if you probe pins.

## Risks

- **Bricking** if a bad image lands and USB stops enumerating → recoverable **only** with the
  SWS EVK (open the case). Keep the stock image; prefer a full SWS dump before first write.
- **Protocol mismatch** on the OTA bridge → the no-case path may need flasher tweaks.
- **No 2.4 GHz, no screen** in the result — make sure that's acceptable before investing.
- The default open-BLE build ships no proprietary code; only the opt-in `--blob` build links
  Telink's BLE blob (don't redistribute that build).

## Phase 1 result (done)

- **OTA go/no-go: GO (confirmed).** The GMK104 and rainy75 ship the *same* YKQ stock OTA
  flasher; the protocol constants match exactly, so the no-case-opening bootstrap applies.
- **Board scaffold created:** [`../zmk-port/boards/zuoya_gmk104/`](../zmk-port/boards/zuoya_gmk104/)
  — a draft ZMK board generated from the VIA definition (correct matrix transform + physical
  layout for all 107 keys), with the platform SoC/flash/USB/BLE/column wiring reused from
  rainy75. See its [`BOARD-README.md`](../zmk-port/boards/zuoya_gmk104/BOARD-README.md) for the
  status table and the remaining hardware unknowns.

## Remaining before a first flash (needs the keyboard + toolchain)

1. **Confirm the 2 extra row GPIOs** (rows 6–7) and the **RGB LED count** — probe on
   hardware (rainy75's `boot_diag`/`rainy75_rgb.py` method) or RE the GMK104 stock firmware.
2. **Resolve the duplicated `RC(7,13)` cell** (ESC vs the tall numpad key).
3. **Stand up the build** inside a rainy75-zmk fork (Zephyr SDK 0.17.0), build the combined
   image + bridge, then flash via the stock OTA and iterate in ZMK Studio.
4. **Have SWS recovery ready** (Telink EVK) before the first write.

# Firmware RE — matrix GPIO pins (static, from the stock firmware)

Resolving the ZMK port's biggest unknowns (the matrix row pins) by **disassembling the
stock firmware** — no hardware probing, no flashing. The firmware image is the one carved
from the vendor updater (`extracted/zuoya-gmk104-stock-fw-V0111.bin`, RISC-V / B91).

## Method

- Disassembled as **RISC-V RV32 + compressed** with capstone (`skipdata` on, load base
  `0x20000000`), tool: [`../zmk-port/tools/fw_matrix_re.py`](../zmk-port/tools/fw_matrix_re.py).
- The B91 reads key rows from the GPIO **input** registers: `PD` at `0x80140318`, `PE` at
  `0x80140320` (register map per the rainy75 B91 docs). The scan extracts individual bits
  using Andes custom bit-field instructions (opcode `0x5b`, bit index in word bits `[23:20]`),
  so the tool follows each `lb …,0x318(reg)` / `lb …,0x320(reg)` and reads the extracted bit.

## Result — all 8 matrix rows confirmed

| Row | Pin | Evidence (first ref) |
|-----|-----|----------------------|
| 0 | **PE0** | `0x2000216e` (`PE & 1`) |
| 1 | **PD2** | `0x2000218e` |
| 2 | **PD3** | `0x200021ae` |
| 3 | **PD4** | `0x200021ce` |
| 4 | **PD5** | `0x200021ee` |
| 5 | **PD6** | `0x20002210` |
| 6 | **PE3** | `0x20008f48` |
| 7 | **PD7** | `0x2000d0d0` |

`PD` bits scanned = `{2,3,4,5,6,7}`, `PE` bits scanned = `{0,3}` (plus `PE7`/`PD0` which are a
column / RF-calibration pin, not rows). This matches the Evision platform exactly and adds
the two rows the 75% rainy75 board doesn't populate: **row 6 = PE3, row 7 = PD7**.

This **corrects** the earlier scaffold, which had rows 6/7 guessed in the wrong order. The
board DTS now uses the confirmed assignment.

## Columns (platform constant, not re-derived here)

From the shared Evision platform (rainy75 `docs/gpio-matrix.md`): cols in order
`PE4, PE5, PE6, PE7, PA0, PA1, PA2, PA3, PA4, PB1, PB2, PB3, PB4, PB5(, PB6, PC1)`. The
GMK104 layout uses **14 columns (0–13)** → `PE4-7, PA0-4, PB1-5`. RGB data is `PB7` (PSPI
MOSI), LED power gate `PC2` — both platform constants.

## RGB LED count — 104 (physical count)

Static constant-search was inconclusive (`.byte` misdecodes inject noise; weak activity
around 103–104 near the RGB/matrix code). Resolved by physical count instead: the owner
counted **104** per-key LEDs (one per switch hole, no separate underglow). This fits the
geometry — 107 VIA positions − 2 encoder half-keys = 105 switch positions, minus the encoder
push (no LED) = **104**. `chain-length = 104`.

## Still open

- **Duplicated cell `RC(7,13)`** (ESC vs the tall numpad key) — a VIA-JSON artifact; resolve
  by probing which physical key reads that cell.

## Reproduce

```bash
python3 -m venv .venv && ./.venv/bin/pip install capstone
./.venv/bin/python zmk-port/tools/fw_matrix_re.py extracted/zuoya-gmk104-stock-fw-V0111.bin
```

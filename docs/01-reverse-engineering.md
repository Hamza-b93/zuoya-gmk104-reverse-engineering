# Reverse-Engineering Report — ZUOYA GMK104

**Date:** 2026-11-25
**Goal:** Determine whether the GMK104 genuinely supports VIA/QMK firmware, identify the
MCU, and establish what is achievable on Linux.
**Method:** Pure static analysis of the bundled Windows tools (treated as data — nothing
was executed). The `.exe` files are .NET assemblies, so their type/method names and
string literals were parsed directly from PE/CLI metadata; the embedded firmware was
carved from the managed-resource section and fingerprinted.

Scripts used are in this folder: [`tool-dnmeta.py`](tool-dnmeta.py) (dumps the `#Strings`
and `#US` metadata heaps) and [`tool-dnres.py`](tool-dnres.py) (dumps the .NET
managed-resource region).

---

## 1. File identification

All three `.exe` files are **PE32 / .NET (Mono/.Net) assemblies**, not native code —
which is why they decompile/parse cleanly.

| File | Internal identity | Role |
|---|---|---|
| `ZUOYA-GMK104-CS49BE-V0105-20240815.exe` | `USB_OTA.exe` v1.0.0.7, trademark "YKQ" | Firmware OTA updater, bundling fw **V01.05** |
| `ZUOYA-GK104-CS9DB8-V0111-20260511.exe` | `USB_OTA.exe` v1.0.0.7, trademark "YKQ" | **Same app**, bundling fw **V01.11** |
| `qmk_toolbox_beta.exe` | QMK Toolbox (github.com/qmk/qmk_toolbox) | Community QMK flasher |

The two vendor `.exe` files share **identical** metadata (same 818 type/method names, same
175 string literals). They are the *same program* re-released with a different embedded
firmware image and filename. The app's real name is `USB_OTA.exe` — a generic
**ITON/Telink "mouse & keyboard USB OTA"** factory/update utility (leftover factory
artifacts include an embedded SQL connection string and WMI USB hot-plug watchers).

## 2. The MCU: Telink TLSR9511B (RISC-V) — confirmed

The firmware image is embedded as a .NET resource (`code_2M`) inside the vendor `.exe`.
Carved out (140 244 bytes) and fingerprinted:

- **Telink firmware marker** `KNLT` ("TLNK" byte-swapped) at **offset 0x08** — Telink's
  standard image signature.
- **UTF-16 strings inside the firmware:**
  - `TLSR9511` — the chip model
  - `ZUOYA GMK104` — the BLE advertising name
- **Entry code is RISC-V.** The reset sequence decodes as the canonical RISC-V
  `__global_pointer$` setup:

  | Offset | Word | Instruction |
  |---|---|---|
  | 0x10 | `e0080197` | `auipc gp, …` (opcode 0x17) |
  | 0x14 | `7d818193` | `addi gp, gp, 0x7d8` (0x13) |
  | 0x18 | `801002b7` | `lui   t0, …` (0x37) |
  | 0x1c | `70028293` | `addi  t0, t0, …` (0x13) |
  | 0x24 | `506280a3` | `sw    …` (store, 0x23) |

  These opcodes (0x17 / 0x13 / 0x37 / 0x23) are textbook RISC-V — definitively **not**
  the TC32 core used by the older TLSR8 family.

**Conclusion:** the keyboard's wireless MCU is a **Telink TLSR9511B**:
32-bit RISC-V (Andes D25F, up to 96 MHz), 256 KB SRAM, 1 MB flash, Bluetooth dual-mode
(Classic + LE 5.3) + 2.4 GHz + BLE Mesh. This matches the GMK104's tri-mode
USB/BT/2.4G + RGB + OLED hardware.

> Note: an early guess (from the OTA tool's `code_2M` / `param_128K` flash-partition
> labels) was that this might be an older TLSR8. Extracting and decoding the actual
> firmware corrected that — it is the newer **RISC-V TLSR9** line.

## 3. The vendor OTA protocol (`USB_OTA.exe`)

Raw USB-HID updater. Key facts recovered from metadata/strings:

- Transport: **raw HID** via `HidD_SetOutputReport` / `HidD_SetFeature` / `HidD_GetFeature`.
- HID selectors (defaults shown in the tool UI): **UsagePage `0xFFEF`**, **Usage `0x00`**,
  **ReportID `05`**. (These are the *OTA* interface, distinct from the VIA interface.)
- Command set (`CMD_TYPE` enum): `OTA_CMD`, `BREATH_CMD`, `BTN_CFG_CMD`, `DPI_CFG_CMD`,
  `REPORT_RATE_CFG_CMD`, `MOUSE_INF_CMD`, `ID_CMD` — a generic keyboard+mouse dongle tool.
- Image handling: loads a `*.bin`, computes **`crc16`** (`bin_crc` / `check_bin_is_ok`),
  reports `Firmware Verson=0x…`, and **rejects mismatches** with
  `"Firmware CRC is wrong，illegal firmware"`. Flash regions are labelled
  `code_2M` and `param_128K`.
- Telltale strings: `telink`, `telink bin File format error`, `OTA Success` / `OTA Fail`.

**Implication:** firmware updates are gated by a CRC/format check and the Telink image
format. You cannot push arbitrary (e.g. QMK/ZMK) firmware through this path.

## 4. QMK Toolbox analysis

`qmk_toolbox_beta.exe` is the **genuine, unmodified** community tool
(`https://github.com/qmk/qmk_toolbox`). Its advertised bootloader support:

> Atmel DFU · QMK DFU · Caterina · STM32 DFU · APM32 DFU · Kiibohd DFU · STM32duino ·
> HalfKay (Teensy) · BootloadHID · USBasp · Atmel SAM-BA (Massdrop) · WB32 DFU

**Telink is not in the list, and QMK does not target Telink at all.** A Telink TLSR9
chip exposes none of these bootloaders over USB, so QMK Toolbox physically cannot talk to
this keyboard. This is the root cause of the "people have issues flashing VIA firmware"
reports: the suggested tool/firmware path does not apply to this hardware.

## 5. The VIA definition files

`ZUOYA-GMK104-USB.json` and `-2.4G.json` are standard **VIA definitions**:

- `vendorId: 0x320F`; `productId: 0x5055` (USB) / `0x5088` (2.4G) — the **only** difference
  between the two files.
- `matrix: 8 rows × 15 cols`; `keycodes: ["qmk_lighting"]`.
- RGB menu: brightness, **19 effect modes** (Wave, Vortex, Meteor, Rain, Starry, …),
  speed, color.
- Custom keycodes expose the board's extras: 2.4G / BT1–3 switching, Win-lock,
  Mac/Win toggle, logo LED, **OLED on/off + OLED mode**, rotary-wheel mode, key-scan delay.

These files are what you sideload into VIA/usevia.app's **Design** tab. Their existence
confirms the stock firmware speaks the VIA protocol (usage page `0xFF60`) — i.e. VIA is
real for *configuration*. The OLED *content* (GIFs/clock) is not covered by VIA and needs
Zuoya's separate image tool (not included in this folder).

## 6. Summary of findings

1. MCU = **Telink TLSR9511B, RISC-V** (proven from firmware).
2. Stock firmware = proprietary, **VIA-protocol-emulating**; not QMK.
3. VIA **configuration** works (wired, sideloaded JSON) — including on Linux via WebHID.
4. **No** supported path to flash real QMK/VIA (wrong chip family; QMK Toolbox incompatible;
   OTA CRC-gated).
5. ZMK is *theoretically* conceivable (RISC-V + Zephyr family) but is an unported,
   hardware-flash-only project — see [03-firmware-and-flashing.md](03-firmware-and-flashing.md).

## Reproduce

```bash
# dump .NET metadata string heaps (type/method names + string literals)
python3 docs/tool-dnmeta.py "ZUOYA-GK104-CS9DB8-V0111-20260511.exe" new

# dump the managed-resource region, then carve the firmware at the KNLT marker
python3 docs/tool-dnres.py "ZUOYA-GK104-CS9DB8-V0111-20260511.exe" /tmp/res.bin
strings -e l -n 4 extracted/zuoya-gmk104-stock-fw-V0111.bin | grep -E 'TLSR|ZUOYA'
```

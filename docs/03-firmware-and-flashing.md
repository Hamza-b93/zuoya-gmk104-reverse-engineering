# Firmware & Flashing — what's possible on the GMK104

**Short version:** the only *supported* firmware path is the vendor's Telink USB-HID OTA
updater with a Zuoya-signed `.bin`. Real **QMK/VIA cannot be flashed**. **ZMK** is
theoretically possible (the chip is RISC-V) but unported and hardware-flash-only.

---

## The MCU and why it matters

- MCU: **Telink TLSR9511B** — 32-bit **RISC-V** (Andes D25F), BT dual-mode + 2.4 GHz,
  256 KB SRAM, 1 MB flash. Proven from the firmware (see
  [01-reverse-engineering.md](01-reverse-engineering.md) §2).
- QMK targets AVR / STM32 / RP2040 / WB32 / etc. **It has no Telink target.** So there is
  no "QMK firmware" that exists for this board to flash.
- The VIA you can use is the stock firmware's *protocol emulation*, not QMK underneath.

## Vendor OTA (the supported path)

The two `.exe` files are the Telink **USB-HID OTA** updater (`USB_OTA.exe`):

- Transport: raw HID (`SetOutputReport` / `SetFeature`), UsagePage `0xFFEF`, ReportID `05`.
- Accepts a `*.bin`, checks **CRC16** and Telink image format, and refuses anything it
  doesn't like with `"Firmware CRC is wrong，illegal firmware"`.
- Flash partitions labelled `code_2M` / `param_128K`.

This means you can only load **Zuoya-provided** firmware this way (bug-fix releases). It is
not a route for custom firmware.

> A Linux re-implementation of this OTA protocol is feasible (the report format, CRC, and
> partitions are known), but it would still only flash *vendor* images — it gets you no
> closer to QMK/ZMK — so it isn't worth building for that purpose.

## Can QMK Toolbox flash it? No.

`qmk_toolbox_beta.exe` is the genuine community tool. Its bootloaders are Atmel/QMK DFU,
Caterina, STM32/APM32/Kiibohd DFU, HalfKay, BootloadHID, USBasp, SAM-BA, WB32 DFU — **no
Telink**. A TLSR9 chip exposes none of these over USB, so QMK Toolbox simply can't see the
keyboard. If a seller says "flash VIA firmware with QMK Toolbox," that instruction does not
apply to this hardware.

## ZMK (the only open-source angle) — feasible, as a port

Because the chip is **RISC-V TLSR9511 (B91)**, there is now a real reference:
**[`scholzri/rainy75-zmk`](https://github.com/scholzri/rainy75-zmk)** — a hardware-verified
open **ZMK port for the exact same TLSR9511/B91 platform** (the Wobkey Rainy 75 Pro, also an
"Evision" board with the same `320F:5055` stock USB ID). A second keyboard has already been
ported from it ([`dwaris/crush80-zmk`](https://github.com/dwaris/crush80-zmk)). The generic,
hard parts are therefore **done**:

- A working B91 Zephyr + ZMK base, plus a **blob-free open BLE controller**.
- B91 drivers: USB, SPI WS2812 RGB, battery ADC.
- A **no-case-opening install path**: a two-stage **OTA → mcumgr DFU** flow
  (`./install_zmk.sh`) that flashes ZMK *through the stock updater's own protocol*, plus
  `./restore_stock.sh` to revert. No hardware debugger needed for the normal path.

### What's still GMK104-specific

- **Its own ZMK board port**: the GMK104's GPIO matrix (which pins = rows/cols), RGB data
  pin, and layout. The *logical* matrix (8×15) and keymap come from the VIA JSON here
  (convertible with rainy75's `reverse/tools/via_dump_keymap.py`); the *physical pin* mapping
  does not — it needs hardware probing or firmware RE.
- **Confirm the DFU foothold** on the GMK104. Its updater is the "YKQ/USB_OTA" skin, not
  Wobkey's; the mcuboot/OTA entry path must be verified before trusting the software-only
  install.
- **The color screen** has no ZMK driver anywhere — out of scope for a first bring-up
  (see [`04-screen-image-tool.md`](04-screen-image-tool.md)).

### Trade-offs (same as rainy75)

USB + **Bluetooth LE only** (the proprietary **2.4 GHz dongle is not ported**), **no VIA**
(remap via **ZMK Studio**), **no screen**, 6-key rollover by default (NKRO optional), and
build-from-source on Linux.

### Recovery

The normal install is reversible in software, but a *bad* flash is recoverable only over the
chip's **hardware debug pads** — for TLSR9 that's the **JTAG** route (Telink TLSR9 DEV_KEY /
burning board + RISC-V OpenOCD; the simple single-wire SWS tooling is TLSR8-only). Keep a
stock backup before starting.

### Restore safety net

The stock firmware is preserved at
[`../extracted/zuoya-gmk104-stock-fw-V0111.bin`](../extracted/zuoya-gmk104-stock-fw-V0111.bin)
(carved from the V01.11 vendor `.exe`, 140 244 bytes). It is the Telink *application*
image; a full chip restore may also require the vendor's bootloader/stack regions, which
are **not** included — so treat any hardware flashing as potentially one-way.

## Practical recommendation

For QMK-like power without any of the above risk, remap **host-side with Kanata** and keep
on-board config in **VIA** — see [02-linux-setup.md](02-linux-setup.md). Leave firmware
replacement alone unless a TLSR9511 ZMK port is a project you *want* to take on.

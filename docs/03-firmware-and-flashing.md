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

## ZMK (the only open-source angle) — theoretical

Because the chip is **RISC-V TLSR9**, it's in the family that *Zephyr* supports — unlike
the dead-end TLSR8. But:

- Zephyr's supported board is the **TLSR9518 (B91)** dev kit, **not** the **9511B**. Same
  `TLSR951x` series, different variant → it would need its own SoC/board definition.
- **ZMK has no Telink board** at all (ZMK officially covers nRF52, RP2040/RP2350, STM32,
  SAMD21). Everything else is "may work with custom configuration."
- A real port would mean bringing up: RISC-V board def, the Telink BLE controller, the
  2.4 GHz dongle link, the RGB matrix, and the OLED. **Months of work**, for one board.

### And you'd have to flash it over hardware debug, not USB

The vendor OTA won't take foreign images. A ZMK/custom image would go in over the chip's
**single-wire debug interface (SWS)** using a Telink burning EVK / compatible flasher and
RISC-V OpenOCD — which means **opening the case** and soldering/probing. Brick risk is real.

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

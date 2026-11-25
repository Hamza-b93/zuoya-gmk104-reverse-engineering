# ZUOYA GMK104 — Reverse-Engineering & Linux Notes

Analysis of the ZUOYA GMK104 wireless mechanical keyboard, its bundled Windows
tools, and what is actually possible regarding **VIA / QMK / custom firmware**,
with a focus on **using the board on Linux**.

> **TL;DR**
> - The GMK104 is **VIA-*configurable***, **not QMK-*flashable***.
> - The MCU is a **Telink TLSR9511B** (32-bit **RISC-V**, BT dual-mode + 2.4 GHz). Confirmed from the firmware itself.
> - The stock firmware only *emulates* the VIA HID protocol so you can remap keys / set RGB. It is **not** QMK.
> - **QMK Toolbox cannot flash this board** — it has no Telink bootloader; Telink isn't a QMK target.
> - Firmware updates ship as a vendor **USB-HID OTA** `.exe` that CRC-checks images and rejects anything foreign (`"illegal firmware"`).
> - **On Linux today:** remap/RGB via [usevia.app](https://usevia.app) (wired) + advanced remapping via **Kanata** (host-side). No flashing required.

---

## What's in this folder

| File | What it is |
|---|---|
| `ZUOYA-GMK104-USB.json` | **VIA definition** for wired USB mode (`productId 0x5055`). Load this in usevia.app. |
| `ZUOYA-GMK104-2.4G.json` | **VIA definition** for 2.4 GHz mode (`productId 0x5088`). Byte-identical to the USB file except the product ID. |
| `ZUOYA-GMK104-CS49BE-V0105-20240815.exe` | Vendor firmware **OTA updater**, bundling firmware **V01.05**. |
| `ZUOYA-GK104-CS9DB8-V0111-20260511.exe` | **Same** OTA updater app, bundling newer firmware **V01.11**. |
| `qmk_toolbox_beta.exe` | Stock, unmodified community **QMK Toolbox** (the seller's suggested flasher — which does **not** work here). |
| `Image Custom Tool 0703.exe` | Evision/Acrox Windows tool for uploading **images/GIFs to the keyboard's color screen**. Its upload protocol is now fully reverse-engineered (see docs/08) — a Linux uploader is possible without it. |
| `docs/` | Full write-up (see below) + the analysis scripts used. |
| `extracted/` | The **stock firmware blob** carved out of the vendor `.exe` (your only backup). |
| `zmk-port/` | **Draft** ZMK board scaffold for the GMK104 (not yet flashed) — see [zmk-port/README.md](zmk-port/README.md). |
| `linux/` | Host-side helpers — `92-zuoya-via.rules` udev rule for usevia.app without root. |
| `screen-re/` | Screen-protocol RE: the live USB **capture**, the extracted outbound reports, a **reconstructed proof image**, and the decoder script. |

## Documentation

- **[docs/01-reverse-engineering.md](docs/01-reverse-engineering.md)** — Full methodology and evidence: how the chip was identified, the OTA tool internals, the QMK Toolbox analysis, and the VIA definitions.
- **[docs/02-linux-setup.md](docs/02-linux-setup.md)** — Practical guide: configuring the board on Linux with usevia.app + udev, and Kanata for advanced remapping. Includes live HID-probe commands.
- **[docs/03-firmware-and-flashing.md](docs/03-firmware-and-flashing.md)** — The Telink OTA protocol, why QMK/VIA can't be flashed, the ZMK/Zephyr reality for this chip, and the (risky) hardware-flash path.
- **[docs/04-screen-image-tool.md](docs/04-screen-image-tool.md)** — The Evision "Image Custom Tool" for the color screen: what it is, the ~180×180 panel, and Linux/ZMK implications.
- **[docs/05-zmk-porting-plan.md](docs/05-zmk-porting-plan.md)** — If you want to pursue ZMK: a GMK104-specific porting checklist + no-case-opening flash-path go/no-go, built from the sibling `rainy75-zmk` port.
- **[docs/06-hardware-probe.md](docs/06-hardware-probe.md)** — Read-only USB/HID probe of a real unit: the 4-interface map confirming VIA (`0xFF60`), the OTA channel (`0xFFEF`), NKRO, and a 4th `0xFF1C` vendor channel.
- **[docs/07-firmware-gpio-re.md](docs/07-firmware-gpio-re.md)** — Static RISC-V disassembly of the stock firmware confirming all 8 matrix **row** GPIOs (incl. `row6=PE3`, `row7=PD7`) for the ZMK port.
- **[docs/09-roadmap.md](docs/09-roadmap.md)** — Where this is headed: **Track A** (a no-flash Linux GUI to configure keys + screen) and **Track B** (open ZMK-based firmware, with the 2.4G-preservation question scoped honestly).
- **[docs/08-screen-protocol.md](docs/08-screen-protocol.md)** — Screen (`0xFF1C`) upload protocol **fully reverse-engineered** (live usbmon capture of the Windows tool under Wine): **180×180, RGB565 big-endian**, 64-byte reports, the checksum, and the complete command sequence — enough to upload images from Linux without Wine. Raw capture + reconstructed proof image in [`screen-re/capture/`](screen-re/capture/).

## Verdict on "can it run VIA firmware?"

Two different claims hide under "VIA support":

| Claim | Answer | Why |
|---|---|---|
| Configure keys/RGB/macros with VIA | ✅ **Yes** (wired, via sideloaded JSON) | Stock firmware answers the VIA HID protocol (usage page `0xFF60`). |
| Flash real **QMK/VIA firmware** onto it | ❌ **No** | Chip is **Telink TLSR9511B**; QMK has no Telink target; QMK Toolbox has no Telink bootloader; vendor OTA rejects foreign images. |
| Flash **ZMK** (open-source) onto it | ⚠️ **Feasible, but a project** | A working ZMK + open-BLE port exists for the **same TLSR9511/B91 chip** ([`scholzri/rainy75-zmk`](https://github.com/scholzri/rainy75-zmk)) with a no-case-opening install path. The GMK104 still needs its own **board port** (GPIO matrix/RGB probing), loses 2.4 GHz and the screen, and carries brick risk. See [docs/03](docs/03-firmware-and-flashing.md). |

---

## Upstream: the `rainy75-zmk` reference port

The entire ZMK angle (Track B) rests on **[`scholzri/rainy75-zmk`](https://github.com/scholzri/rainy75-zmk)**
— a hardware-verified open ZMK port for the Wobkey Rainy 75 Pro, which is built on the **same
Evision / Telink TLSR9511 (B91) platform** as the GMK104 (shared stock USB ID `320F:5055`, the same
"YKQ" OTA updater). It does the hard, platform-generic work so our board only has to resolve its
own physical layout. Full credit to its author for reverse-engineering the platform and publishing
an open port; a second board ([`dwaris/crush80-zmk`](https://github.com/dwaris/crush80-zmk)) was
already derived from it.

**What the GMK104 inherits from it (the generic hard parts — done):**

- A working **B91 Zephyr SoC** base + a **blob-free open BLE controller** (no proprietary Telink blob).
- B91 drivers: **USB** device, **SPI WS2812 RGB**, **battery ADC**.
- A **no-case-opening install path**: a two-stage **stock-OTA → MCUboot/mcumgr DFU** flow, plus a
  `restore_stock.sh` revert — so ZMK is flashed *through the stock updater's own protocol*.
- A documented **reference pinout** for the Evision TLSR9511 design (likely shared with us).
- Tooling: `via_dump_keymap.py` (VIA JSON → ZMK keymap), `extract_stock_firmware.py`, the OTA
  flasher, and `boot_diag` / `rainy75_rgb.py` for probing GPIOs and LEDs.

### What's needed from that repo to actually flash the GMK104

You can't build or flash from this repo's draft board alone — it depends on rainy75-zmk's out-of-tree
code and tooling. Concretely, from `scholzri/rainy75-zmk` you need:

1. **The whole repo as a west workspace.** Our board
   ([`zmk-port/boards/zuoya_gmk104/`](zmk-port/boards/zuoya_gmk104/)) must be built *inside a fork of
   rainy75-zmk*, because it relies on that repo's B91 drivers, the open BLE controller, the Telink
   HAL + patches, `matrix_transform.h`, `physical_layouts.dtsi`, and the `telink,b91-*` bindings.
2. **Its build setup** — `docs/zmk-firmware.md`: the pinned **Zephyr SDK 0.17.0 (exactly)**, `west`,
   `hal_telink`, and MCUboot via its manifest, built in an **Arch distrobox**. Plus the `mcumgr` CLI.
3. **The flash/install tooling** in `reverse/tools/` — the **OTA flasher** (`ota_flasher.py`, incl.
   the read-only `--version` probe), `install_zmk.sh` (bridge → combined MCUboot+ZMK image),
   `rainy75_dfu.py` (mcumgr DFU), and `restore_stock.sh` (revert to our stock backup).
4. **Its install + recovery docs** — `INSTALL.md` (the bridge → MCUboot → DFU sequence) and
   `docs/recovery.md` (the **SWS / PA7** hardware-recovery path with a Telink Burning EVK, the only
   confirmed B91 programmer — your brick insurance).
5. **The probing tools** (`boot_diag`-style GPIO readout, `rainy75_rgb.py`) to settle the GMK104's
   two remaining hardware unknowns — the "likely" column GPIOs and the exact RGB LED count/order.

See [docs/05-zmk-porting-plan.md](docs/05-zmk-porting-plan.md) for the step-by-step port/flash plan
and [docs/03-firmware-and-flashing.md](docs/03-firmware-and-flashing.md) for the OTA/recovery detail.

---

*Last updated: 2026-11-26. Added the `rainy75-zmk` upstream section (credit + what's needed to flash). Screen upload protocol fully reverse-engineered (180×180 RGB565-BE). See `docs/` for evidence and reproduction steps.*

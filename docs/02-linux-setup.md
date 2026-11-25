# Using the ZUOYA GMK104 on Linux

None of the bundled Windows `.exe` tools are needed for day-to-day use on Linux. The
realistic stack is:

1. **usevia.app** (wired) — remap keys, layers, macros, and RGB; saved **on the keyboard**.
2. **Kanata** — advanced host-side remapping (home-row mods, tap-hold, combos, layers)
   that works across **all** connection modes (USB / Bluetooth / 2.4 GHz).

What you **cannot** do from Linux (same as Windows): flash real QMK/ZMK (wrong chip, see
[03-firmware-and-flashing.md](03-firmware-and-flashing.md)), or push custom OLED images
(needs Zuoya's Windows image tool).

---

## 1. VIA configuration via usevia.app

VIA uses **WebHID**, so you need a Chromium-based browser (Chrome/Chromium/Edge/Brave).
**Firefox does not support WebHID.**

### 1a. udev rule (so the browser can open the device without root)

A ready-made rule ships in [`../linux/92-zuoya-via.rules`](../linux/92-zuoya-via.rules):

```bash
sudo cp linux/92-zuoya-via.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules && sudo udevadm trigger
```

Unplug/replug the keyboard afterwards. (The rule just grants your user access to the
`0x320F` HID interfaces — confirmed present in [06-hardware-probe.md](06-hardware-probe.md).)

### 1b. Load the definition and configure

1. Connect the keyboard **by USB cable** (VIA config is wired-mode only on this board).
2. Open **https://usevia.app** in Chromium.
3. **Settings** (gear) → enable **"Show Design tab"**.
4. **Design** tab → **Load** → pick `ZUOYA-GMK104-USB.json` from this folder.
5. **Authorize** the device when the browser prompts (it lists the `0x320F` device).
6. Go to the **Configure** tab → remap keys, set layers/macros, adjust RGB.

Changes persist on the keyboard. If it isn't detected: confirm wired mode, confirm the
udev rule applied (below), and make sure no other app is holding the HID device.

## 2. Verify the hardware (run with the keyboard plugged in)

These confirm the device enumerates and that the VIA (`0xFF60`) interface is present:

```bash
# 1. Does it enumerate? (expect 320f:5055 in wired mode)
lsusb -d 320f:

# 2. Interfaces / HID (needs root for full descriptors)
sudo lsusb -v -d 320f: 2>/dev/null | grep -iE 'bInterfaceNumber|bInterfaceClass|iInterface|idProduct|bcdDevice'

# 3. HID report descriptors — look for usage page 0xFF60 (VIA) and 0xFFEF (vendor OTA)
for d in /sys/bus/hid/devices/*320F*/report_descriptor; do echo "== $d =="; od -An -tx1 "$d"; done

# 4. Which hidraw node is the VIA interface
ls -l /dev/hidraw* ; cat /sys/class/hidraw/hidraw*/device/uevent 2>/dev/null | grep -i 320F
```

A `06 60 FF` (Usage Page 0xFF60) block in the report descriptor = the VIA interface is
live. `06 EF FF` = the vendor OTA interface.

## 3. Kanata (advanced remapping, all connection modes)

[Kanata](https://github.com/jtroo/kanata) remaps at the OS level via `uinput`, so it works
regardless of USB/BT/2.4G and needs no firmware changes. It gives you the QMK-style
features the stock firmware lacks (robust tap-hold, layers, combos, chords, macros).

Trade-offs: remaps live on *this computer* (not the keyboard), and it can't touch RGB or
the OLED.

### Install

- Arch/EndeavourOS: `yay -S kanata` (AUR), or grab a release binary from the project.
- Ensure `uinput` is available: `sudo modprobe uinput`.
- Permissions (so Kanata can read input / write uinput without root): add yourself to the
  `input` group and add a udev rule for `uinput`:

  ```
  # /etc/udev/rules.d/93-kanata-uinput.rules
  KERNEL=="uinput", MODE="0660", GROUP="input", OPTIONS+="static_node=uinput"
  ```
  ```bash
  sudo usermod -aG input "$USER"   # re-login afterwards
  sudo udevadm control --reload-rules && sudo udevadm trigger
  ```

### Minimal starter config

Save as `~/.config/kanata/gmk104.kbd` and run `kanata -c ~/.config/kanata/gmk104.kbd`:

```lisp
;; Minimal example: Caps Lock becomes Esc (tap) / Control (hold),
;; and a nav layer under the spacebar hold. Expand as you like.
(defsrc
  caps spc)

(defalias
  cesc (tap-hold 200 200 esc lctl)
  nav  (tap-hold 200 200 spc (layer-toggle navigation)))

(deflayer base
  @cesc @nav)

(deflayer navigation
  _ _)
```

Point Kanata at the GMK104 explicitly if you have multiple keyboards (see
`linux-dev` device filtering in Kanata's docs; match on name `ZUOYA GMK104` or the
`320F` IDs).

## 4. Recommended setup

- Light remapping + RGB that should live on the keyboard and roam between machines →
  **usevia.app**.
- Power-user layering / home-row mods / macros, especially while wireless →
  **Kanata**.
- The two coexist fine: keep VIA mappings minimal (or default) and do the heavy lifting in
  Kanata, or vice-versa.

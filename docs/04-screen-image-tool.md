# The Screen "Image Custom Tool"

`Image Custom Tool 0703.exe` (dated 2023-07-03) is the Windows app for putting custom
**images / GIFs** on the GMK104's built-in **screen** (the little display VIA exposes via
its `OLED_ON_OFF` / `OLED MODE SET` keycodes). It is **not** a firmware or keymap tool.

## What it is

- **A Nullsoft (NSIS) installer** (skinned with the Chinese "niuniu" `nsNiuniuSkin` UI)
  wrapping `app.7z` (~34 MB). The real program unpacks to:
  - `Image Custom Tool.exe` — native C++/**MFC + DuiLib** GUI (not .NET).
  - `opencv_world320.dll`, `opencv_ffmpeg320.dll` — **OpenCV 3.2**, used to decode/resize
    images and video/GIF frames to the screen.
  - `DefaultData/*.json` — bundled device profiles and default screen content.
- **Platform: Evision / Acrox** — strings reference `acrox.eevision.com`, an
  `http://acrox.eevision.com/api/` cloud endpoint, and device classes
  `CEevisionKeyboardDevice`, `CEevisionMouseDevice`, `CEevisionMousePadDevice`,
  `CEevisionHS6533Device`, `CEevisionUSBDevice`. This is the **same "Evision" OEM platform**
  that the TLSR9511/B91 keyboards (incl. this one) are built on — see
  [`01-reverse-engineering.md`](01-reverse-engineering.md).
- **It is a generic multi-product configurator.** The bundled `Keyboard.json` default is a
  *sample* device (`DevciesChipmodel: "VS11K09A"`, `eevision_A_kb_001…`, VID `0x0C45` Sonix)
  — **not** the GMK104. The GMK104 (`320F:5055`, Telink TLSR9511) is loaded as its own
  profile at runtime. Don't mistake that sample for this keyboard's hardware.

## The screen

- The custom-screen data (`DefaultData/e_ScreenCustom1_0.json`, `…2_0.json`) stores the
  image as a **per-pixel RGB bitmap** (`Red`/`Green`/`Blue`/`Flag` per pixel) — i.e. the
  display is a **color TFT**, not a monochrome OLED, despite VIA calling it "OLED".
- Pixel count in the default canvas: **32,400 px**, which factors cleanly as **180 × 180**
  (square) — the most likely panel size (the only other common fit is 240 × 135 / 16:9).
- Upload transport: **raw USB-HID** (`HidD_SetOutputReport`, `HidP_GetUsages`). The exact
  report/command format was not reversed here (not needed for the goals); it would be a
  separate RE task if a non-Windows uploader were wanted.

## Implications

### Linux
- **No Linux support, and no Linux equivalent.** Changing the screen image currently
  requires this Windows tool (and some features expect the Evision cloud). Running it under
  Wine is unverified. If you must set a screen image, do it from Windows.
- Everything else (keymap, RGB) is unaffected — see [`02-linux-setup.md`](02-linux-setup.md).

### ZMK port
- A ZMK port (see [`03-firmware-and-flashing.md`](03-firmware-and-flashing.md)) would **lose
  the screen** unless someone writes a driver. The reference `rainy75-zmk` board has **no
  screen**, so there's no existing code to copy — you'd need to reverse the panel's
  controller + the SPI/parallel wiring and the image-upload path from scratch. Treat the
  screen as **out of scope** for a first ZMK bring-up.

## Note on the bundled binary
`Image Custom Tool 0703.exe` is Evision/Zuoya proprietary software (and 36 MB). Like the
other vendor binaries it is **excluded from the public repo** (see `.gitignore`); obtain it
from the manufacturer if needed.

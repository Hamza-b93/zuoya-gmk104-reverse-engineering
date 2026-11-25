# zmk-port/ — ZMK board scaffold for the GMK104

A **draft, not-yet-flashed** ZMK board for the ZUOYA GMK104 (Telink TLSR9511/B91),
scaffolded from the sibling [`scholzri/rainy75-zmk`](https://github.com/scholzri/rainy75-zmk)
port. Read [`../docs/05-zmk-porting-plan.md`](../docs/05-zmk-porting-plan.md) first.

```
boards/zuoya_gmk104/     the board (dts, keymap, Kconfig, defconfig, metadata)
  BOARD-README.md        status table + known unknowns + build/flash steps
tools/
  gen_board.py           generates zuoya_gmk104.dts + .keymap from the VIA JSON
  kle_inspect.py         prints the parsed matrix/layout for inspection
```

Regenerate the board files from the VIA definition:

```bash
python3 tools/gen_board.py ../ZUOYA-GMK104-USB.json \
    boards/zuoya_gmk104/zuoya_gmk104.dts \
    boards/zuoya_gmk104/zuoya_gmk104.keymap
```

**What's solid:** the matrix transform + physical layout (from the VIA definition) and the
flash path (the GMK104 uses the identical YKQ stock OTA protocol rainy75 already drives).
**What needs hardware:** the 2 extra row GPIOs, the RGB LED count, and a handful of
ambiguous legends. See the board README.

This is meant to be dropped into a fork of rainy75-zmk (it relies on that project's B91
drivers / open BLE / HAL patches). Platform wiring and structure adapted from rainy75-zmk
(Apache-2.0).

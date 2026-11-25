#!/usr/bin/env python3
"""Generate a ZMK board skeleton (matrix transform, physical layout, draft keymap)
for the ZUOYA GMK104 from its VIA definition JSON. Output is a STARTING POINT that
must be verified on hardware (row GPIOs, RGB count, ambiguous legends)."""
import json, sys, itertools

via_json, out_dts, out_keymap = sys.argv[1], sys.argv[2], sys.argv[3]
j = json.load(open(via_json))
rows = j["layouts"]["keymap"]

keys = []  # (r,c,x,y,w,h)
y = 0.0
for row in rows:
    x = 0.0; w = h = 1.0
    for item in row:
        if isinstance(item, dict):
            x += item.get("x", 0); y += item.get("y", 0)
            if "w" in item: w = item["w"]
            if "h" in item: h = item["h"]
        else:
            r, c = (int(v) for v in item.split("\n")[0].split(","))
            keys.append((r, c, round(x, 3), round(y, 3), w, h)); x += w; w = h = 1.0
    y += 1.0

order = sorted(keys, key=lambda k: (round(k[3]*2)/2, k[2]))
grouped = [list(g) for _, g in itertools.groupby(order, key=lambda k: round(k[3]*2)/2)]

# Best-guess legends keyed by matrix (r,c). DRAFT — verify every one in ZMK Studio.
L = {
 (7,13):"&kp ESC",(0,1):"&kp F1",(0,2):"&kp F2",(0,3):"&kp F3",(0,4):"&kp F4",
 (0,5):"&kp F5",(0,6):"&kp F6",(0,7):"&kp F7",(0,8):"&kp F8",(0,9):"&kp F9",
 (0,10):"&kp F10",(0,11):"&kp F11",(0,12):"&kp F12",
 (0,13):"&kp PSCRN",(7,0):"&kp SLCK",(7,1):"&kp PAUSE_BREAK",
 (5,4):"&kp C_VOL_UP",(5,6):"&kp C_VOL_DN",(5,7):"&kp C_MUTE",   # encoder/knob? verify
 (1,0):"&kp GRAVE",(1,1):"&kp N1",(1,2):"&kp N2",(1,3):"&kp N3",(1,4):"&kp N4",
 (1,5):"&kp N5",(1,6):"&kp N6",(1,7):"&kp N7",(1,8):"&kp N8",(1,9):"&kp N9",
 (1,10):"&kp N0",(1,11):"&kp MINUS",(1,12):"&kp EQUAL",(1,13):"&kp BSPC",
 (7,2):"&kp INS",(7,3):"&kp HOME",(7,6):"&kp PG_UP",
 (6,0):"&kp KP_NUM",(6,1):"&kp KP_DIVIDE",(6,2):"&kp KP_MULTIPLY",(6,3):"&kp KP_MINUS",
 (2,0):"&kp TAB",(2,1):"&kp Q",(2,2):"&kp W",(2,3):"&kp E",(2,4):"&kp R",(2,5):"&kp T",
 (2,6):"&kp Y",(2,7):"&kp U",(2,8):"&kp I",(2,9):"&kp O",(2,10):"&kp P",
 (2,11):"&kp LBKT",(2,12):"&kp RBKT",(2,13):"&kp BSLH",
 (7,4):"&kp DEL",(7,5):"&kp END",(7,7):"&kp PG_DN",
 (6,4):"&kp KP_N7",(6,5):"&kp KP_N8",(6,6):"&kp KP_N9",(6,10):"&kp KP_PLUS",
 (3,0):"&kp CAPS",(3,1):"&kp A",(3,2):"&kp S",(3,3):"&kp D",(3,4):"&kp F",(3,5):"&kp G",
 (3,6):"&kp H",(3,7):"&kp J",(3,8):"&kp K",(3,9):"&kp L",(3,10):"&kp SEMI",(3,11):"&kp SQT",
 (3,13):"&kp RET",(6,7):"&kp KP_N4",(6,8):"&kp KP_N5",(6,9):"&kp KP_N6",
 (4,0):"&kp LSHFT",(4,2):"&kp Z",(4,3):"&kp X",(4,4):"&kp C",(4,5):"&kp V",(4,6):"&kp B",
 (4,7):"&kp N",(4,8):"&kp M",(4,9):"&kp COMMA",(4,10):"&kp DOT",(4,11):"&kp FSLH",
 (4,13):"&kp RSHFT",(7,8):"&kp UP",(7,9):"&kp KP_N1",(6,11):"&kp KP_N2",(6,12):"&kp KP_N3",
 (5,0):"&kp LCTRL",(5,1):"&kp LGUI",(5,2):"&kp LALT",(5,5):"&kp SPACE",(5,9):"&kp RALT",
 (5,10):"&mo 1",(5,11):"&kp K_APP",(5,12):"&kp RCTRL",(5,13):"&kp LEFT",
 (7,10):"&kp DOWN",(7,11):"&kp RIGHT",(6,13):"&kp KP_N0",(7,12):"&kp KP_DOT",
}
# second physical key on the duplicated cell 7,13 (tall key by numpad) — JSON reuses 7,13
DUP_7_13 = "&kp KP_ENTER"   # ANOMALY: VIA JSON maps both ESC and this to RC(7,13) — verify

def binding_for(r, c, seen):
    if (r, c) == (7, 13):
        if (7, 13) in seen:
            return DUP_7_13
        seen.add((7, 13)); return L[(7, 13)]
    return L.get((r, c), "&trans")

# ---- matrix transform map + keymap bindings, same visual-row grouping ----
tmap_lines, kb_lines = [], []
seen = set()  # global across all rows, so the duplicated RC(7,13) is handled once
for g in grouped:
    g = sorted(g, key=lambda k: k[2])
    tmap_lines.append("\t\t\t" + " ".join(f"RC({r},{c})" for r,c,*_ in g))
    kb_lines.append("\t\t\t\t" + " ".join(binding_for(r,c,seen) for r,c,*_ in g))

# ---- physical layout keys ----
pl_lines = []
for i,(r,c,x,yy,w,h) in enumerate(order):
    lead = "    = " if i==0 else "    , "
    pl_lines.append(f"\t\t{lead}<&key_physical_attrs {int(w*100):>4} {int(h*100):>4} "
                    f"{int(round(x*100)):>5} {int(round(yy*100)):>5}       0     0     0>  /* RC({r},{c}) */")

maxc = max(k[1] for k in keys); ncols = maxc + 1; nrows = max(k[0] for k in keys)+1

DTS = f'''/dts-v1/;

/*
 * ZUOYA GMK104 — Telink TLSR9511 (B91) — ZMK board skeleton  [DRAFT / UNVERIFIED]
 *
 * Generated from ZUOYA-GMK104-USB.json by tools/gen_board.py. This reuses the
 * Evision/B91 platform wiring proven on scholzri/rainy75-zmk (Apache-2.0). Build
 * it inside a fork of rainy75-zmk that provides the B91 drivers, open BLE
 * controller, telink HAL + patches, and the rainy_rgb engine.
 *
 *   VERIFIED  : matrix transform + physical layout (from the VIA definition),
 *               column GPIOs (Evision platform constant), all 8 ROW GPIOs
 *               (confirmed in the stock firmware disassembly), SoC/flash/USB/BLE.
 *   TODO/PROBE: the RGB chain-length, and the duplicated matrix cell RC(7,13)
 *               (see keymap). See BOARD-README.md.
 */

#include <freq.h>
#include <telink/telink_b91.dtsi>
#include <zephyr/dt-bindings/gpio/gpio.h>
#include <dt-bindings/zmk/matrix_transform.h>
#include <dt-bindings/led/led.h>
#include <physical_layouts.dtsi>

/ {{
	model = "ZUOYA GMK104";
	compatible = "zuoya,gmk104";

	aliases {{ watchdog0 = &wdt0; }};

	chosen {{
		zephyr,sram = &ram_dlm;
		zephyr,flash = &flash;
		zephyr,flash-controller = &flash_mspi;
		zephyr,code-partition = &slot0_partition;
		zephyr,bt-hci = &bt_hci;
		zmk,battery = &battery;
		zmk,underglow = &led_strip;
		zmk,kscan = &kscan0;
		zmk,physical-layout = &gmk104_layout;
	}};

	bt_hci: bt_hci {{ compatible = "telink,b91-bt-hci"; status = "okay"; }};

	default_transform: keymap_transform_0 {{
		compatible = "zmk,matrix-transform";
		columns = <{ncols}>;
		rows = <{nrows}>;
		/* physical order; RC(r,c) = electrical matrix cell from the VIA definition */
		map = <
{chr(10).join(tmap_lines)}
		>;
	}};

	gmk104_layout: gmk104_layout {{
		compatible = "zmk,physical-layout";
		display-name = "ZUOYA GMK104";
		transform = <&default_transform>;

		keys  //                     w   h    x    y     rot    rx    ry
{chr(10).join(pl_lines)}
		    ;
	}};

	zephyr_udc0: usbd@80100800 {{
		compatible = "telink,b91-usbd";
		reg = <0x80100800 0x400>;
		interrupt-parent = <&plic0>;
		interrupts = <11 2>;
		num-bidir-endpoints = <8>;
		status = "okay";
	}};

	kscan0: kscan {{
		compatible = "zmk,kscan-gpio-matrix";
		diode-direction = "col2row";
		wakeup-source;
		debounce-press-ms = <1>;

		/* COLUMNS ({ncols}) — Evision TLSR9511 platform order (same as rainy75,
		 * taking the first {ncols} of PE4-7 / PA0-4 / PB1-6). Verify on hardware. */
		col-gpios
			= <&gpioe 4 GPIO_ACTIVE_LOW>
			, <&gpioe 5 GPIO_ACTIVE_LOW>
			, <&gpioe 6 GPIO_ACTIVE_LOW>
			, <&gpioe 7 GPIO_ACTIVE_LOW>
			, <&gpioa 0 GPIO_ACTIVE_LOW>
			, <&gpioa 1 GPIO_ACTIVE_LOW>
			, <&gpioa 2 GPIO_ACTIVE_LOW>
			, <&gpioa 3 GPIO_ACTIVE_LOW>
			, <&gpioa 4 GPIO_ACTIVE_LOW>
			, <&gpiob 1 GPIO_ACTIVE_LOW>
			, <&gpiob 2 GPIO_ACTIVE_LOW>
			, <&gpiob 3 GPIO_ACTIVE_LOW>
			, <&gpiob 4 GPIO_ACTIVE_LOW>
			, <&gpiob 5 GPIO_ACTIVE_LOW>
			;

		/* ROWS ({nrows}) — all confirmed in the stock firmware's matrix scan
		 * (disassembly: PE0 + PD2-6 = rows 0-5; PE3 read @0x20008f48 = row 6;
		 *  PD7 read @0x2000d0d0 = row 7). Order matches the Evision platform. */
		row-gpios
			= <&gpioe 0 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 0 = PE0 */
			, <&gpiod 2 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 1 = PD2 */
			, <&gpiod 3 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 2 = PD3 */
			, <&gpiod 4 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 3 = PD4 */
			, <&gpiod 5 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 4 = PD5 */
			, <&gpiod 6 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 5 = PD6 */
			, <&gpioe 3 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 6 = PE3 (fw-confirmed) */
			, <&gpiod 7 (GPIO_ACTIVE_LOW | GPIO_PULL_UP)>   /* row 7 = PD7 (fw-confirmed) */
			;
	}};

	battery: battery-adc {{
		compatible = "telink,b91-battery-adc";
		adc-channel = <0x0A>;  /* PD1 on rainy75 — verify on GMK104 */
		divider-numerator = <1>;
		divider-denominator = <2>;
		full-mv = <4200>;
		empty-mv = <3300>;
		status = "okay";
	}};

	led_strip: ws2812 {{
		compatible = "telink,b91-spi-led-strip";
		/* TODO: GMK104 per-key LED count unknown (full-size ~104-110). Placeholder. */
		chain-length = <107>;
		color-mapping = <LED_COLOR_ID_GREEN LED_COLOR_ID_RED LED_COLOR_ID_BLUE>;
	}};

	wdt0: watchdog@80140140 {{ compatible = "telink,b91-watchdog"; reg = <0x80140140 0x20>; status = "okay"; }};
}};

&cpu0 {{ clock-frequency = <DT_FREQ_M(48)>; }};
&ram_ilm {{ reg = <0x00000000 0x00020000>; }};
&ram_dlm {{ reg = <0x00080000 0x00020000>; }};

&flash {{
	reg = <0x20000000 0x100000>;
	partitions {{
		compatible = "fixed-partitions";
		#address-cells = <1>;
		#size-cells = <1>;
		boot_partition:    partition@0     {{ label = "mcuboot"; reg = <0x0 0x10000>; }};
		slot0_partition:   partition@10000 {{ label = "image-0"; reg = <0x10000 0x70000>; }};
		slot1_partition:   partition@80000 {{ label = "image-1"; reg = <0x80000 0x70000>; }};
		storage_partition: partition@f0000 {{ label = "storage"; reg = <0xf0000 0xe000>; }};
		/* 0xFE000 calibration + 0xFF000 BLE MAC preserved — do NOT map */
	}};
}};

&pinctrl {{ pad-mul-sel = <1>; }};
&gpioa {{ status = "okay"; }};
&gpiob {{ status = "okay"; }};
&gpioc {{ status = "okay"; }};
&gpiod {{ status = "okay"; interrupts = <25 1>; }};
&gpioe {{ status = "okay"; interrupts = <27 1>; }};
&mtimer {{ interrupts-extended = <&hlic 7>; }};
'''

KEYMAP = f'''#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/bt.h>
#include <dt-bindings/zmk/outputs.h>

/*
 * ZUOYA GMK104 — DRAFT keymap  [UNVERIFIED LEGENDS]
 *
 * Key COUNT and ORDER match the matrix transform in zuoya_gmk104.dts (generated
 * from the VIA definition, so they are correct). The LEGENDS below are a
 * best-effort guess for a standard full-size + numpad + encoder layout — verify
 * each one live in ZMK Studio once flashed and fix as needed. Known unknowns:
 *   - encoder keys RC(5,4)/(5,6)/(5,7): guessed as volume up/down/mute
 *   - bottom-right RC(5,10)/(5,11)/(5,12): guessed as Fn / Menu / RCTRL
 *   - RC(7,13) is REUSED by two physical keys in the VIA JSON (ESC and the tall
 *     numpad key): on real hardware they can't share a cell, so one is wrong —
 *     resolve by probing. Here ESC is given to the top key, KP_ENTER to the tall one.
 */

/ {{
	keymap {{
		compatible = "zmk,keymap";

		default_layer {{
			bindings = <
{chr(10).join(kb_lines)}
			>;
		}};

		fn_layer {{
			bindings = <
{chr(10).join("\t\t\t\t" + " ".join("&trans" for _ in g) for g in grouped)}
			>;
		}};
	}};
}};
'''

open(out_dts, "w").write(DTS)
open(out_keymap, "w").write(KEYMAP)
print(f"wrote {out_dts} and {out_keymap}: {len(keys)} keys, {nrows} rows x {ncols} cols")

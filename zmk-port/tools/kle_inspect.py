#!/usr/bin/env python3
"""Minimal KLE parser for a VIA definition's layouts.keymap -> matrix map + physical layout."""
import json, sys, math

j = json.load(open(sys.argv[1]))
rows = j["layouts"]["keymap"]

keys = []          # (r, c, x, y, w, h)
y = 0.0
for row in rows:
    x = 0.0
    w = h = 1.0
    ydelta_applied = False
    for item in row:
        if isinstance(item, dict):
            if "x" in item: x += item["x"]
            if "y" in item: y += item["y"]
            if "w" in item: w = item["w"]
            if "h" in item: h = item["h"]
        else:
            label = item.split("\n")[0].strip()      # "r,c"
            r, c = (int(v) for v in label.split(","))
            keys.append((r, c, round(x,3), round(y,3), w, h))
            x += w
            w = h = 1.0
    y += 1.0

maxr = max(k[0] for k in keys); maxc = max(k[1] for k in keys)
print(f"// {len(keys)} keys, matrix rows 0..{maxr} ({maxr+1}), cols 0..{maxc} ({maxc+1})")

# group into visual rows by y (rounded)
keys_sorted = sorted(keys, key=lambda k: (round(k[3]*2)/2, k[2]))
import itertools
print("\n==== matrix_transform map (RC(r,c), physical order) ====")
for yval, grp in itertools.groupby(keys_sorted, key=lambda k: round(k[3]*2)/2):
    g = sorted(grp, key=lambda k: k[2])
    print("\t\t\t" + " ".join(f"RC({r},{c})" for r,c,_,_,_,_ in g))

print("\n==== physical-layout keys (w h x y) ====")
for r,c,x,yy,w,h in keys_sorted:
    print(f"\t\t    , <&key_physical_attrs {int(w*100):>4} {int(h*100):>4} {int(round(x*100)):>5} {int(round(yy*100)):>5}       0     0     0>  /* RC({r},{c}) */")

print("\n==== matrix coverage (rows x cols used) ====")
used = {}
for r,c,*_ in keys:
    used.setdefault(r, set()).add(c)
for r in sorted(used):
    print(f"row {r}: cols {sorted(used[r])}")

// Parse the VIA keyboard definition (KLE-style `layouts.keymap`) into positioned
// keys tagged with their matrix (row, col). Pure: JSON in, geometry out.
// No device I/O. Reference: the ZUOYA-GMK104 VIA JSON at the repo root.

// Parse one KLE `keymap` array into { rows, cols, width, height, keys }.
// Each key: { x, y, w, h, row, col } in key units (1 unit = 1u keycap).
export function parseKle(keymap) {
  const keys = [];
  let y = 0;
  let cur = { w: 1, h: 1 };
  let maxX = 0;
  let maxY = 0;

  for (const row of keymap) {
    let x = 0;
    for (const item of row) {
      if (typeof item === 'string') {
        const label = item.split('\n')[0].trim(); // "row,col"
        const [r, c] = label.split(',').map((n) => Number.parseInt(n, 10));
        keys.push({ x, y, w: cur.w, h: cur.h, row: r, col: c });
        x += cur.w;
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y + cur.h);
        cur = { w: 1, h: 1 }; // size applies to one key only
      } else if (item && typeof item === 'object') {
        if (typeof item.x === 'number') x += item.x;
        if (typeof item.y === 'number') y += item.y;
        if (typeof item.w === 'number') cur.w = item.w;
        if (typeof item.h === 'number') cur.h = item.h;
      }
    }
    y += 1;
  }

  return { width: maxX, height: maxY, keys };
}

// Build the full editor layout from a parsed VIA definition object.
export function buildLayout(def) {
  const matrix = def.matrix ?? {};
  const rows = matrix.rows;
  const cols = matrix.cols;
  const keymap = def.layouts?.keymap;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || !Array.isArray(keymap)) {
    throw new Error('VIA definition missing matrix.rows/cols or layouts.keymap');
  }
  const { width, height, keys } = parseKle(keymap);
  // Guard: every key must land inside the matrix.
  for (const k of keys) {
    if (k.row < 0 || k.row >= rows || k.col < 0 || k.col >= cols || Number.isNaN(k.row)) {
      throw new Error(`key ${k.row},${k.col} is outside the ${rows}x${cols} matrix`);
    }
  }
  return { rows, cols, width, height, keys, name: def.name };
}

// Byte offset of a key's 16-bit keycode in the dynamic-keymap buffer.
export function keyOffset({ layer, row, col, rows, cols }) {
  return (layer * rows * cols + row * cols + col) * 2;
}

// Renderer: UI only. All device work goes through window.zuoya (preload bridge).
const $ = (id) => document.getElementById(id);

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

async function withBusy(btn, fn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Working…';
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    const view = tab.dataset.view;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    if (view === 'keymap') ensureLayout();
  }),
);

// ---------- Device detect ----------
const USAGE_TAG = { '0xff60': 'VIA', '0xff1c': 'SCREEN', '0xffef': 'OTA' };

$('btn-detect').addEventListener('click', () =>
  withBusy($('btn-detect'), async () => {
    const list = $('device-list');
    list.innerHTML = '';
    const res = await window.zuoya.listDevices();
    if (!res.ok) return setStatus($('device-status'), res.error, 'err');
    const ifaces = res.data;
    if (ifaces.length === 0) {
      return setStatus($('device-status'), 'No GMK104 found — plug in (wired) and check /dev/hidraw* permissions.', 'err');
    }
    setStatus($('device-status'), `Found ${ifaces.length} interface(s).`, 'ok');
    for (const d of ifaces) {
      const tag = USAGE_TAG[d.usagePage] ?? '';
      const li = document.createElement('li');
      li.innerHTML = `<span class="tag">${tag || '·'}</span> ${d.usagePage ?? '?'} <span class="muted">${d.product ?? ''} (${d.productId})</span>`;
      list.appendChild(li);
    }
  }),
);

// ---------- Screen upload ----------
$('btn-upload').addEventListener('click', () =>
  withBusy($('btn-upload'), async () => {
    setStatus($('screen-status'), 'Decoding and uploading…');
    const res = await window.zuoya.pickAndUpload({ fit: $('fit').value });
    if (!res.ok) return setStatus($('screen-status'), res.error, 'err');
    if (res.data.canceled) return setStatus($('screen-status'), 'Cancelled.');
    const { path, reports } = res.data;
    setStatus($('screen-status'), `Uploaded ${path.split('/').pop()} — ${reports} reports sent.`, 'ok');
  }),
);

// ---------- Keymap editor ----------
const UNIT = 40; // px per 1u keycap
const state = {
  layout: null, // { rows, cols, width, height, keys, palette }
  labelFor: (code) => `0x${code.toString(16).padStart(4, '0')}`,
  keycodes: null, // flat layer-major array from the device
  layerCount: 1,
  layer: 0,
  selected: null, // { row, col, el }
};

// Build a code -> label map from the palette the main process sends.
function buildLabelMap(palette) {
  const map = new Map();
  for (const group of palette) for (const { code, label } of group.items) map.set(code, label);
  return (code) => map.get(code) ?? `0x${code.toString(16).padStart(4, '0')}`;
}

async function ensureLayout() {
  if (state.layout) return true;
  const res = await window.zuoya.keymapLayout();
  if (!res.ok) {
    setStatus($('keymap-status'), res.error, 'err');
    return false;
  }
  state.layout = res.data;
  state.labelFor = buildLabelMap(res.data.palette);
  renderLayerTabs();
  renderKeyboard();
  renderPicker();
  return true;
}

function renderLayerTabs() {
  const host = $('layer-tabs');
  host.innerHTML = '';
  for (let i = 0; i < state.layerCount; i++) {
    const b = document.createElement('button');
    b.className = 'layer-tab' + (i === state.layer ? ' active' : '');
    b.textContent = `L${i}`;
    b.addEventListener('click', () => {
      state.layer = i;
      clearSelection();
      renderLayerTabs();
      paintKeycaps();
    });
    host.appendChild(b);
  }
}

function renderKeyboard() {
  const board = $('keyboard');
  const { width, height, keys } = state.layout;
  board.style.width = `${width * UNIT}px`;
  board.style.height = `${height * UNIT}px`;
  board.innerHTML = '';
  for (const k of keys) {
    const el = document.createElement('div');
    el.className = 'cap';
    el.style.left = `${k.x * UNIT}px`;
    el.style.top = `${k.y * UNIT}px`;
    el.style.width = `${k.w * UNIT - 4}px`;
    el.style.height = `${k.h * UNIT - 4}px`;
    el.dataset.row = k.row;
    el.dataset.col = k.col;
    el.innerHTML = `<span class="cap-label">·</span><span class="cap-mx">${k.row},${k.col}</span>`;
    el.addEventListener('click', () => selectKey(k.row, k.col, el));
    board.appendChild(el);
  }
  paintKeycaps();
}

// Flat index into the keycodes array for the current layer.
function codeAt(row, col) {
  if (!state.keycodes) return null;
  const { rows, cols } = state.layout;
  return state.keycodes[state.layer * rows * cols + row * cols + col] ?? null;
}

function paintKeycaps() {
  // Iterate the DOM (not the matrix) so layout-option duplicates both repaint.
  $('keyboard').querySelectorAll('.cap').forEach((el) => {
    const code = codeAt(Number(el.dataset.row), Number(el.dataset.col));
    el.querySelector('.cap-label').textContent = code == null ? '·' : state.labelFor(code);
    el.classList.toggle('unread', code == null);
  });
}

function clearSelection() {
  if (state.selected?.el) state.selected.el.classList.remove('selected');
  state.selected = null;
  $('picker-card').classList.add('hidden');
}

function selectKey(row, col, el) {
  if (state.selected?.el) state.selected.el.classList.remove('selected');
  state.selected = { row, col, el };
  el.classList.add('selected');
  $('picker-target').textContent = `L${state.layer} · ${row},${col}`;
  $('picker-card').classList.remove('hidden');
}

function renderPicker() {
  const host = $('picker');
  host.innerHTML = '';
  for (const group of state.layout.palette) {
    const wrap = document.createElement('div');
    wrap.className = 'picker-group';
    wrap.innerHTML = `<div class="picker-group-name">${group.group}</div>`;
    const row = document.createElement('div');
    row.className = 'picker-keys';
    for (const { code, label } of group.items) {
      const b = document.createElement('button');
      b.className = 'picker-key';
      b.textContent = label;
      b.title = `0x${code.toString(16).padStart(4, '0')}`;
      b.addEventListener('click', () => assign(code));
      row.appendChild(b);
    }
    wrap.appendChild(row);
    host.appendChild(wrap);
  }
}

async function assign(code) {
  if (!state.selected) return;
  if (!state.keycodes) {
    return setStatus($('keymap-status'), 'Read the keymap from the keyboard first.', 'err');
  }
  const { row, col } = state.selected;
  setStatus($('keymap-status'), `Writing ${state.labelFor(code)} to ${row},${col}…`);
  const res = await window.zuoya.keymapWriteKey({ layer: state.layer, row, col, code });
  if (!res.ok) return setStatus($('keymap-status'), res.error, 'err');
  if (!res.data.ok) {
    return setStatus($('keymap-status'), `Wrote ${row},${col} but read back ${res.data.label} — not confirmed.`, 'err');
  }
  const { rows, cols } = state.layout;
  state.keycodes[state.layer * rows * cols + row * cols + col] = res.data.code;
  paintKeycaps();
  setStatus($('keymap-status'), `Set ${row},${col} → ${res.data.label} (confirmed on device).`, 'ok');
}

$('picker-close').addEventListener('click', clearSelection);

$('btn-keymap-read').addEventListener('click', () =>
  withBusy($('btn-keymap-read'), async () => {
    if (!(await ensureLayout())) return;
    const res = await window.zuoya.keymapRead();
    if (!res.ok) return setStatus($('keymap-status'), res.error, 'err');
    state.keycodes = res.data.keycodes;
    state.layerCount = res.data.layerCount;
    if (state.layer >= state.layerCount) state.layer = 0;
    renderLayerTabs();
    paintKeycaps();
    setStatus($('keymap-status'), `Read ${state.layerCount} layers. Click a key to reassign it.`, 'ok');
  }),
);

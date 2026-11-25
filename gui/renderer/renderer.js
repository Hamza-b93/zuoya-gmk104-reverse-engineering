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
    if (view === 'macros') ensureMacros();
    if (view === 'lighting') ensureLighting();
    if (view === 'profiles') ensureProfiles();
    if (view === 'widgets') ensureWidgets();
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

// ---------- Screen upload (pick/drop → preview → push) ----------
const screen = { path: null, name: '' };

async function loadPreview(path, name) {
  screen.path = path;
  screen.name = name || path.split(/[\\/]/).pop();
  const res = await window.zuoya.screenPreview({ path, fit: $('fit').value });
  if (!res.ok) {
    $('btn-push').disabled = true;
    return setStatus($('screen-status'), res.error, 'err');
  }
  const img = $('preview');
  img.src = res.data;
  img.hidden = false;
  $('preview-placeholder').hidden = true;
  $('btn-push').disabled = false;
  setStatus($('screen-status'), `Ready: ${screen.name} — press “Push to screen”.`);
}

$('btn-pick').addEventListener('click', () =>
  withBusy($('btn-pick'), async () => {
    const res = await window.zuoya.pickFile();
    if (!res.ok) return setStatus($('screen-status'), res.error, 'err');
    if (res.data.canceled) return;
    await loadPreview(res.data.path);
  }),
);

// Re-render the preview when the fit changes (if an image is loaded).
$('fit').addEventListener('change', () => {
  if (screen.path) loadPreview(screen.path, screen.name);
});

$('btn-push').addEventListener('click', () =>
  withBusy($('btn-push'), async () => {
    if (!screen.path) return;
    setStatus($('screen-status'), `Pushing ${screen.name}…`);
    const res = await window.zuoya.uploadPath({ path: screen.path, fit: $('fit').value });
    if (!res.ok) return setStatus($('screen-status'), res.error, 'err');
    setStatus($('screen-status'), `Pushed ${res.data.name} — ${res.data.reports} reports sent.`, 'ok');
  }),
);

// Drag and drop onto the dropzone.
const dropzone = $('dropzone');
['dragenter', 'dragover'].forEach((e) =>
  dropzone.addEventListener(e, (ev) => {
    ev.preventDefault();
    dropzone.classList.add('dragging');
  }),
);
['dragleave', 'drop'].forEach((e) =>
  dropzone.addEventListener(e, (ev) => {
    ev.preventDefault();
    if (e === 'dragleave' && dropzone.contains(ev.relatedTarget)) return;
    dropzone.classList.remove('dragging');
  }),
);
dropzone.addEventListener('drop', async (ev) => {
  const file = ev.dataTransfer?.files?.[0];
  if (!file) return;
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
    return setStatus($('screen-status'), 'That doesn’t look like an image file.', 'err');
  }
  const path = window.zuoya.pathForFile(file);
  if (!path) return setStatus($('screen-status'), 'Could not resolve the dropped file path.', 'err');
  await loadPreview(path, file.name);
});

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

// Parse "0x1d", "1d", "001D" (hex) or a plain decimal into a 0..0xffff code.
function parseCode(text) {
  const t = text.trim();
  if (!t) return null;
  const hex = /^0x[0-9a-f]+$/i.test(t) || /^[0-9a-f]*[a-f][0-9a-f]*$/i.test(t);
  const n = hex ? Number.parseInt(t.replace(/^0x/i, ''), 16) : Number.parseInt(t, 10);
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) return null;
  return n;
}

$('raw-assign').addEventListener('click', () => {
  const code = parseCode($('raw-hex').value);
  if (code == null) return setStatus($('keymap-status'), 'Enter a code from 0x0000 to 0xFFFF (e.g. 0x5201).', 'err');
  assign(code);
});
$('raw-hex').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('raw-assign').click();
});

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

// ---------- Macros ----------
const MAX_DELAY = 64769; // matches src/macros.js MAX_DELAY_MS
const macroState = { loaded: false, count: 0, size: 0, slots: [], active: 0, keyOptions: '' };

// Build grouped <option>s for the key dropdowns from the keymap palette, keeping
// only basic 8-bit keycodes (macros can't carry 16-bit layer/custom codes).
function buildKeyOptions() {
  if (macroState.keyOptions) return;
  let html = '';
  for (const group of state.layout?.palette ?? []) {
    const items = group.items.filter((it) => it.code <= 0xff && it.code > 0);
    if (!items.length) continue;
    html += `<optgroup label="${group.group}">`;
    for (const it of items) html += `<option value="${it.code}">${it.label}</option>`;
    html += '</optgroup>';
  }
  macroState.keyOptions = html || '<option value="4">A</option>';
}

// Client-side byte cost (mirror of macrosByteLength) so the budget updates live.
function macroBytes(steps) {
  let n = 1; // terminator
  for (const s of steps) {
    if (s.type === 'text') n += [...String(s.value)].length;
    else if (s.type === 'delay') n += 4;
    else n += 3;
  }
  return n;
}
const macrosBytes = () => macroState.slots.reduce((n, s) => n + macroBytes(s), 0);

async function ensureMacros() {
  if (macroState.loaded) return;
  await ensureLayout(); // palette for the key dropdowns (no device needed)
  buildKeyOptions();
  macroState.loaded = true;
}

function renderSlots() {
  const host = $('macro-slots');
  host.innerHTML = '';
  for (let i = 0; i < macroState.count; i++) {
    const b = document.createElement('button');
    b.className = 'layer-tab' + (i === macroState.active ? ' active' : '');
    b.textContent = `M${i}`;
    b.addEventListener('click', () => { macroState.active = i; renderSlots(); renderSteps(); });
    host.appendChild(b);
  }
}

function updateBudget() {
  const used = macrosBytes();
  const over = used > macroState.size;
  $('macro-budget').textContent = `${used} / ${macroState.size} bytes`;
  $('macro-budget').classList.toggle('err', over);
  $('btn-macro-write').disabled = over;
}

function stepRow(step, idx) {
  const li = document.createElement('li');
  li.className = 'macro-step';
  const steps = macroState.slots[macroState.active];
  const badge = { text: 'TEXT', tap: 'TAP', down: 'HOLD ↓', up: 'REL ↑', delay: 'DELAY' }[step.type];

  let control;
  if (step.type === 'text') {
    control = document.createElement('input');
    control.type = 'text';
    control.value = step.value;
    control.placeholder = 'typed literally';
    control.addEventListener('input', () => { step.value = control.value; updateBudget(); });
  } else if (step.type === 'delay') {
    control = document.createElement('input');
    control.type = 'number';
    control.min = 0; control.max = MAX_DELAY; control.value = step.ms;
    control.className = 'macro-ms';
    control.addEventListener('input', () => {
      step.ms = Math.max(0, Math.min(MAX_DELAY, Number(control.value) || 0));
      updateBudget();
    });
  } else {
    control = document.createElement('select');
    control.innerHTML = macroState.keyOptions;
    control.value = String(step.code);
    control.addEventListener('change', () => { step.code = Number(control.value); });
  }
  control.classList.add('macro-value');

  const mk = (txt, title, fn, disabled) => {
    const b = document.createElement('button');
    b.className = 'ghost macro-mini'; b.textContent = txt; b.title = title;
    b.disabled = !!disabled;
    b.addEventListener('click', fn);
    return b;
  };
  const move = (from, to) => {
    if (to < 0 || to >= steps.length) return;
    [steps[from], steps[to]] = [steps[to], steps[from]];
    renderSteps();
  };

  const badgeEl = document.createElement('span');
  badgeEl.className = 'macro-badge'; badgeEl.textContent = badge;
  if (step.type === 'delay') {
    const ms = document.createElement('span'); ms.className = 'muted macro-unit'; ms.textContent = 'ms';
    li.append(badgeEl, control, ms);
  } else {
    li.append(badgeEl, control);
  }
  li.append(
    mk('↑', 'Move up', () => move(idx, idx - 1), idx === 0),
    mk('↓', 'Move down', () => move(idx, idx + 1), idx === steps.length - 1),
    mk('✕', 'Remove', () => { steps.splice(idx, 1); renderSteps(); }),
  );
  return li;
}

function renderSteps() {
  $('macro-editor').classList.remove('hidden');
  $('macro-target').textContent = `Macro ${macroState.active}`;
  const ul = $('macro-steps');
  ul.innerHTML = '';
  const steps = macroState.slots[macroState.active] ?? [];
  if (!steps.length) {
    ul.innerHTML = '<li class="macro-empty muted">Empty — add a step below.</li>';
  } else {
    steps.forEach((s, i) => ul.appendChild(stepRow(s, i)));
  }
  updateBudget();
}

// Add-step buttons.
document.querySelectorAll('#macro-editor .macro-add button').forEach((btn) =>
  btn.addEventListener('click', () => {
    const steps = macroState.slots[macroState.active];
    if (!steps) return;
    const kind = btn.dataset.add;
    if (kind === 'text') steps.push({ type: 'text', value: '' });
    else if (kind === 'delay') steps.push({ type: 'delay', ms: 100 });
    else if (kind === 'tap') steps.push({ type: 'tap', code: 0x04 });
    else if (kind === 'down') steps.push({ type: 'down', code: 0xe1 });
    else if (kind === 'up') steps.push({ type: 'up', code: 0xe1 });
    renderSteps();
  }),
);

$('btn-macro-read').addEventListener('click', () =>
  withBusy($('btn-macro-read'), async () => {
    await ensureMacros();
    const res = await window.zuoya.macrosRead();
    if (!res.ok) return setStatus($('macro-status'), res.error, 'err');
    if (!res.data.supported) {
      $('macro-editor').classList.add('hidden');
      return setStatus($('macro-status'), `No macro support: ${res.data.reason}`, 'err');
    }
    macroState.count = res.data.count;
    macroState.size = res.data.size;
    macroState.slots = res.data.macros;
    if (macroState.active >= macroState.count) macroState.active = 0;
    renderSlots();
    renderSteps();
    setStatus($('macro-status'), `Read ${res.data.count} macro slot(s). ${res.data.used}/${res.data.size} bytes used.`, 'ok');
  }),
);

$('btn-macro-write').addEventListener('click', () =>
  withBusy($('btn-macro-write'), async () => {
    const res = await window.zuoya.macrosWrite(macroState.slots);
    if (!res.ok) return setStatus($('macro-status'), res.error, 'err');
    setStatus($('macro-status'), `Wrote macros to the keyboard — ${res.data.used}/${res.data.size} bytes.`, 'ok');
  }),
);

$('btn-macro-reset').addEventListener('click', () =>
  withBusy($('btn-macro-reset'), async () => {
    const res = await window.zuoya.macrosReset();
    if (!res.ok) return setStatus($('macro-status'), res.error, 'err');
    macroState.slots = macroState.slots.map(() => []);
    renderSteps();
    setStatus($('macro-status'), `Cleared all ${res.data.count} macros on the keyboard.`, 'ok');
  }),
);

// ---------- Lighting ----------
const LIGHT_FIELDS = ['effect', 'brightness', 'speed', 'hue', 'sat'];
const lighting = { loaded: false, debounce: null };

// HSV(0-255 each) -> CSS rgb(), for the color-preview swatch. Value is pinned to
// full so the swatch shows hue/sat even when the keyboard brightness is low.
function hsvToCss(h, s) {
  const H = (h / 255) * 360, S = s / 255, V = 1;
  const c = V * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = V - c;
  const [r, g, b] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x]
    : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
  const to = (n) => Math.round((n + m) * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

function reflectLight(values) {
  for (const f of LIGHT_FIELDS) {
    if (values[f] == null) continue;
    $(f).value = values[f];
    $(`${f}-val`).textContent = values[f];
  }
  $('light-swatch').style.background = hsvToCss(Number($('hue').value), Number($('sat').value));
}

async function ensureLighting() {
  if (lighting.loaded) return;
  lighting.loaded = true;
  // Try to load current values, but a disconnected board shouldn't block the UI.
  const res = await window.zuoya.lightingRead();
  if (res.ok) {
    reflectLight(res.data);
    setStatus($('light-status'), 'Loaded current lighting from the keyboard.', 'ok');
  } else {
    setStatus($('light-status'), `Couldn’t read lighting: ${res.error}`, 'err');
  }
}

// Push one field live as the slider moves (debounced so we don't flood HID).
function wireLightSlider(field) {
  const input = $(field);
  input.addEventListener('input', () => {
    $(`${field}-val`).textContent = input.value;
    if (field === 'hue' || field === 'sat') {
      $('light-swatch').style.background = hsvToCss(Number($('hue').value), Number($('sat').value));
    }
    clearTimeout(lighting.debounce);
    lighting.debounce = setTimeout(async () => {
      const patch = { [field]: Number(input.value) };
      const res = await window.zuoya.lightingSet(patch);
      if (!res.ok) setStatus($('light-status'), res.error, 'err');
      else setStatus($('light-status'), `Set ${field} → ${input.value} (live).`, 'ok');
    }, 60);
  });
}
LIGHT_FIELDS.forEach(wireLightSlider);

$('btn-light-read').addEventListener('click', () =>
  withBusy($('btn-light-read'), async () => {
    const res = await window.zuoya.lightingRead();
    if (!res.ok) return setStatus($('light-status'), res.error, 'err');
    reflectLight(res.data);
    setStatus($('light-status'), 'Loaded current lighting from the keyboard.', 'ok');
  }),
);

$('btn-light-save').addEventListener('click', () =>
  withBusy($('btn-light-save'), async () => {
    const res = await window.zuoya.lightingSave();
    if (!res.ok) return setStatus($('light-status'), res.error, 'err');
    setStatus($('light-status'), 'Saved to keyboard flash — survives a replug.', 'ok');
  }),
);

// ---------- Profiles ----------
const profiles = { loaded: false };

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function renderProfiles(list) {
  const host = $('profile-list');
  host.innerHTML = '';
  if (!list.length) {
    host.innerHTML = '<li class="profile-empty muted">No profiles yet. Set up your keymap and lighting, then “Save current”.</li>';
    return;
  }
  for (const p of list) {
    const li = document.createElement('li');
    li.className = 'profile-row';
    const meta = p.broken
      ? '<span class="err">unreadable file</span>'
      : `${p.layerCount ?? '?'} layers · ${p.hasLighting ? 'with RGB' : 'keymap only'}${p.created ? ' · ' + fmtDate(p.created) : ''}`;
    li.innerHTML =
      `<div class="profile-info"><span class="profile-name">${p.name}</span>` +
      `<span class="muted profile-meta">${meta}</span></div>` +
      `<div class="profile-actions">` +
      `<button class="apply" ${p.broken ? 'disabled' : ''}>Apply</button>` +
      `<button class="ghost export" ${p.broken ? 'disabled' : ''}>Export</button>` +
      `<button class="ghost danger del">Delete</button></div>`;
    li.querySelector('.apply')?.addEventListener('click', (e) => applyProfile(e.target, p));
    li.querySelector('.export')?.addEventListener('click', () => exportProfile(p));
    li.querySelector('.del').addEventListener('click', () => deleteProfile(p));
    host.appendChild(li);
  }
}

async function refreshProfiles(list) {
  if (!list) {
    const res = await window.zuoya.profilesList();
    if (!res.ok) return setStatus($('profile-status'), res.error, 'err');
    list = res.data;
  }
  renderProfiles(list);
}

async function ensureProfiles() {
  if (profiles.loaded) return;
  profiles.loaded = true;
  await refreshProfiles();
}

$('btn-profile-save').addEventListener('click', () =>
  withBusy($('btn-profile-save'), async () => {
    const name = $('profile-name').value.trim();
    if (!name) return setStatus($('profile-status'), 'Give the profile a name first.', 'err');
    setStatus($('profile-status'), `Reading the keyboard to save “${name}”…`);
    const res = await window.zuoya.profilesSave(name);
    if (!res.ok) return setStatus($('profile-status'), res.error, 'err');
    $('profile-name').value = '';
    renderProfiles(res.data.profiles);
    setStatus($('profile-status'), `Saved “${name}”.`, 'ok');
  }),
);

async function applyProfile(btn, p) {
  await withBusy(btn, async () => {
    setStatus($('profile-status'), `Writing “${p.name}” to the keyboard…`);
    const res = await window.zuoya.profilesApply(p.file);
    if (!res.ok) return setStatus($('profile-status'), res.error, 'err');
    const light = res.data.lightingApplied ? ' + RGB' : '';
    setStatus($('profile-status'), `Applied “${res.data.name}” — ${res.data.keymap} keys${light} written to the keyboard.`, 'ok');
  });
}

async function exportProfile(p) {
  const res = await window.zuoya.profilesExport(p.file);
  if (!res.ok) return setStatus($('profile-status'), res.error, 'err');
  if (res.data.canceled) return;
  setStatus($('profile-status'), `Exported “${p.name}” → ${res.data.path}`, 'ok');
}

async function deleteProfile(p) {
  const res = await window.zuoya.profilesDelete(p.file);
  if (!res.ok) return setStatus($('profile-status'), res.error, 'err');
  renderProfiles(res.data.profiles);
  setStatus($('profile-status'), `Deleted “${p.name}”.`, 'ok');
}

$('btn-profile-import').addEventListener('click', () =>
  withBusy($('btn-profile-import'), async () => {
    const res = await window.zuoya.profilesImport();
    if (!res.ok) return setStatus($('profile-status'), res.error, 'err');
    if (res.data.canceled) return;
    renderProfiles(res.data.profiles);
    setStatus($('profile-status'), 'Imported a profile. Click Apply to write it to the keyboard.', 'ok');
  }),
);

// ---------- Screen widgets ----------
const widgets = { loaded: false, active: null };

async function ensureWidgets() {
  if (widgets.loaded) return reflectWidgetStatus();
  const res = await window.zuoya.widgetsList();
  if (!res.ok) return setStatus($('widget-status'), res.error, 'err');
  const grid = $('widget-grid');
  grid.innerHTML = '';
  // The built-in widgets, plus a "rotate" tile.
  const tiles = [...res.data, { id: 'rotate', name: 'Rotate all' }];
  for (const w of tiles) {
    const card = document.createElement('div');
    card.className = 'widget-tile';
    card.dataset.id = w.id;
    card.innerHTML =
      `<div class="widget-preview"><img alt="" hidden /><span class="muted">${w.id === 'rotate' ? '↻' : '…'}</span></div>` +
      `<div class="widget-meta"><span class="widget-name">${w.name}</span>` +
      `<button class="widget-start" data-id="${w.id}">Start</button></div>`;
    card.querySelector('.widget-start').addEventListener('click', () => startWidget(w.id));
    grid.appendChild(card);
    if (w.id !== 'rotate') loadWidgetThumb(w.id, card.querySelector('img'), card.querySelector('.widget-preview span'));
  }
  widgets.loaded = true;
  reflectWidgetStatus();
}

async function loadWidgetThumb(id, img, placeholder) {
  const res = await window.zuoya.widgetsPreview(id);
  if (!res.ok) return;
  img.src = res.data;
  img.hidden = false;
  if (placeholder) placeholder.hidden = true;
}

async function startWidget(id) {
  const res = await window.zuoya.widgetsStart(id);
  if (!res.ok) return setStatus($('widget-status'), res.error, 'err');
  widgets.active = res.data.active;
  reflectWidgetStatus(res.data);
}

$('btn-widget-stop').addEventListener('click', async () => {
  const res = await window.zuoya.widgetsStop();
  if (!res.ok) return setStatus($('widget-status'), res.error, 'err');
  widgets.active = null;
  reflectWidgetStatus(res.data);
});

async function reflectWidgetStatus(status) {
  if (!status) {
    const res = await window.zuoya.widgetsStatus();
    if (!res.ok) return;
    status = res.data;
  }
  widgets.active = status.active;
  $('btn-widget-stop').disabled = !status.running;
  document.querySelectorAll('.widget-tile').forEach((t) => {
    const isActive = status.running && (status.rotate ? t.dataset.id === 'rotate' : t.dataset.id === status.active);
    t.classList.toggle('active', isActive);
    const btn = t.querySelector('.widget-start');
    btn.textContent = isActive ? 'Running' : 'Start';
    btn.disabled = isActive;
  });
  if (status.running) {
    setStatus($('widget-status'), status.rotate ? `Rotating widgets (now: ${status.active}).` : `Streaming “${status.active}” to the screen.`, 'ok');
  } else {
    setStatus($('widget-status'), 'Live content streamed to the 180×180 panel. Start one and leave it running.');
  }
}

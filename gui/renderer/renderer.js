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

const USAGE_TAG = { '0xff60': 'VIA', '0xff1c': 'SCREEN', '0xffef': 'OTA' };

// --- Detect ---
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

// --- Keymap ---
$('btn-keymap').addEventListener('click', () =>
  withBusy($('btn-keymap'), async () => {
    $('keymap-meta').innerHTML = '';
    $('keymap-row').innerHTML = '';
    const res = await window.zuoya.viaHandshake();
    if (!res.ok) return setStatus($('keymap-status'), res.error, 'err');

    const { protocolVersion, layerCount, topRow } = res.data;
    setStatus($('keymap-status'), 'Two-way VIA comms confirmed.', 'ok');
    $('keymap-meta').innerHTML =
      `<div class="kv"><span class="k">VIA protocol</span><span class="v">0x${protocolVersion.toString(16)}</span></div>` +
      `<div class="kv"><span class="k">Layers</span><span class="v">${layerCount}</span></div>`;
    for (const name of topRow) {
      const el = document.createElement('div');
      el.className = 'key';
      el.textContent = name;
      $('keymap-row').appendChild(el);
    }
  }),
);

// --- Screen upload ---
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

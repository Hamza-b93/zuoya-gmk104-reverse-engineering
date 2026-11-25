// VIA dynamic-macro codec: translate between the QMK on-device byte format and a
// structured step list the UI can edit.
//
// On the wire, the macro area is one byte buffer holding `count` macros, each
// terminated by a 0x00. Inside a macro, printable bytes are typed literally;
// special steps are introduced by the prefix 0x01:
//
//   0x01 0x01 <kc>        tap keycode        (SS_TAP_CODE)
//   0x01 0x02 <kc>        hold keycode down  (SS_DOWN_CODE)
//   0x01 0x03 <kc>        release keycode    (SS_UP_CODE)
//   0x01 0x04 <lo> <hi>   delay in ms        (SS_DELAY_CODE)
//
// Keycodes here are basic 8-bit HID codes (KC_A = 0x04). The delay bytes are
// each stored as (component + 1) so a delay never contains a 0x00 terminator:
// ms = (lo - 1) + (hi - 1) * 255.
export const SS_QMK_PREFIX = 0x01;
export const SS = { TAP: 0x01, DOWN: 0x02, UP: 0x03, DELAY: 0x04 };
export const MACRO_TERMINATOR = 0x00;

// Largest delay the two-byte encoding can represent.
export const MAX_DELAY_MS = 254 * 255 + 254; // 64769

const clampDelay = (ms) => Math.max(0, Math.min(MAX_DELAY_MS, Math.round(Number(ms) || 0)));

function encodeDelay(ms) {
  const d = clampDelay(ms);
  return [(d % 255) + 1, Math.floor(d / 255) + 1];
}

function decodeDelay(lo, hi) {
  return (lo - 1) + (hi - 1) * 255;
}

// A printable byte may appear literally in a macro's text run. Exclude the two
// control bytes the format reserves (0x00 terminator, 0x01 prefix).
export function isTextByte(b) {
  return b >= 0x02 && b <= 0xff && b !== SS_QMK_PREFIX;
}

// Decode one macro's bytes (no terminator) into a list of steps. Adjacent typed
// characters are coalesced into a single { type:'text' } step.
export function decodeMacro(bytes) {
  const steps = [];
  let text = '';
  const flush = () => { if (text) { steps.push({ type: 'text', value: text }); text = ''; } };

  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b === SS_QMK_PREFIX) {
      flush();
      const tag = bytes[i + 1];
      if (tag === SS.TAP) { steps.push({ type: 'tap', code: bytes[i + 2] }); i += 3; }
      else if (tag === SS.DOWN) { steps.push({ type: 'down', code: bytes[i + 2] }); i += 3; }
      else if (tag === SS.UP) { steps.push({ type: 'up', code: bytes[i + 2] }); i += 3; }
      else if (tag === SS.DELAY) { steps.push({ type: 'delay', ms: decodeDelay(bytes[i + 2], bytes[i + 3]) }); i += 4; }
      else { i += 1; } // unknown tag: skip the stray prefix
    } else {
      text += String.fromCharCode(b);
      i += 1;
    }
  }
  flush();
  return steps;
}

// Encode one macro's steps to bytes (no terminator). Throws on an un-typeable
// text character so a bad macro can't silently truncate on a 0x00/0x01 byte.
export function encodeMacro(steps) {
  const out = [];
  for (const s of steps) {
    if (s.type === 'text') {
      for (const ch of String(s.value)) {
        const code = ch.codePointAt(0);
        if (!isTextByte(code)) {
          throw new Error(`Macro text can't contain ${JSON.stringify(ch)} (0x${code.toString(16)}).`);
        }
        out.push(code);
      }
    } else if (s.type === 'tap') { out.push(SS_QMK_PREFIX, SS.TAP, s.code & 0xff); }
    else if (s.type === 'down') { out.push(SS_QMK_PREFIX, SS.DOWN, s.code & 0xff); }
    else if (s.type === 'up') { out.push(SS_QMK_PREFIX, SS.UP, s.code & 0xff); }
    else if (s.type === 'delay') { out.push(SS_QMK_PREFIX, SS.DELAY, ...encodeDelay(s.ms)); }
    else throw new Error(`Unknown macro step type: ${s.type}`);
  }
  return out;
}

// Decode the whole macro buffer into exactly `count` macros (step lists). Empty
// slots (consecutive terminators, or a short buffer) come back as [].
export function decodeMacros(buffer, count) {
  const macros = [];
  let start = 0;
  for (let i = 0; i < buffer.length && macros.length < count; i++) {
    if (buffer[i] === MACRO_TERMINATOR) {
      macros.push(decodeMacro(buffer.subarray(start, i)));
      start = i + 1;
    }
  }
  while (macros.length < count) macros.push([]);
  return macros;
}

// Encode `count` macros into a single terminated buffer.
export function encodeMacros(macros) {
  const bytes = [];
  for (const steps of macros) {
    bytes.push(...encodeMacro(steps), MACRO_TERMINATOR);
  }
  return Buffer.from(bytes);
}

// Byte cost of a macro set (what has to fit in the device's macro buffer).
export function macrosByteLength(macros) {
  return macros.reduce((n, steps) => n + encodeMacro(steps).length + 1, 0);
}

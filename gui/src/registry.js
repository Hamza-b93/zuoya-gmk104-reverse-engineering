// Known-keyboard registry. The app is built around the ZUOYA GMK104, but the
// device layer keys everything off HID usage pages, so other VIA keyboards on
// the same Evision/Telink-style stack can be added here without touching code.
//
// Each entry describes how to recognize a board and which vendor interfaces it
// exposes. `usagePages` are the ones this app knows how to drive.

// Vendor interface usage pages this app understands.
export const USAGE = {
  VIA: 0xff60, // keymap / layers / macros (VIA bulk-buffer protocol)
  SCREEN: 0xff1c, // color-screen image upload (GMK104-style)
  OTA: 0xffef, // firmware OTA
};

// Capabilities we can light up when a given usage page is present.
export const CAPABILITY = {
  [USAGE.VIA]: 'keymap',
  [USAGE.SCREEN]: 'screen',
  [USAGE.OTA]: 'ota',
};

export const KNOWN_KEYBOARDS = [
  {
    id: 'zuoya-gmk104',
    name: 'ZUOYA GMK104',
    vendorId: 0x320f,
    productIds: { 0x5055: 'wired (USB)', 0x5088: '2.4GHz dongle' },
    via: 'ZUOYA-GMK104-USB.json',
    notes: 'Fully supported: keymap read/write, 180x180 RGB565 screen upload.',
  },
  // Add more boards here. A board is a candidate for this app if it exposes a
  // VIA interface (usage page 0xFF60); the screen tool additionally needs a
  // 0xFF1C interface that speaks the GMK104 upload protocol (needs confirming
  // per board — that's what a diagnostic dump is for).
];

// Find a known keyboard by VID/PID (PID optional).
export function matchKeyboard(vendorId, productId) {
  return (
    KNOWN_KEYBOARDS.find(
      (k) => k.vendorId === vendorId && (productId == null || productId in k.productIds),
    ) ?? null
  );
}

export function usageLabel(usagePage) {
  for (const [name, page] of Object.entries(USAGE)) if (page === usagePage) return name;
  return null;
}

// Device discovery for the ZUOYA GMK104 over hidraw.
// Matches the keyboard by VID and picks interfaces by HID usage page.
import HID from 'node-hid';

export const VENDOR_ID = 0x320f;
export const PRODUCT_IDS = [0x5055 /* wired */, 0x5088 /* 2.4G */];

// Usage pages of the vendor interfaces (from the RE docs).
export const USAGE = {
  VIA: 0xff60,    // keymap / RGB / macros  (interface 1)
  SCREEN: 0xff1c, // color-screen upload    (interface 3)
  OTA: 0xffef,    // firmware OTA           (interface 2)
};

// Return all GMK104 HID interfaces visible to the OS.
export function listInterfaces() {
  return HID.devices().filter(
    (d) => d.vendorId === VENDOR_ID && PRODUCT_IDS.includes(d.productId),
  );
}

// Find the device-info entry for a given usage page (VIA / SCREEN / OTA).
export function findInterface(usagePage) {
  const matches = listInterfaces().filter((d) => d.usagePage === usagePage);
  // Prefer an entry that actually carries a path we can open.
  return matches.find((d) => d.path) || matches[0] || null;
}

// Open the interface for a usage page; throws a helpful error if absent.
export function openInterface(usagePage) {
  const info = findInterface(usagePage);
  if (!info || !info.path) {
    const have = listInterfaces().map((d) => `0x${(d.usagePage ?? 0).toString(16)}`);
    throw new Error(
      `GMK104 interface with usage page 0x${usagePage.toString(16)} not found. ` +
        (have.length
          ? `Interfaces seen: ${have.join(', ')}. Check permissions on /dev/hidraw*.`
          : `No GMK104 interfaces seen at all — is it plugged in (wired mode) and readable?`),
    );
  }
  return new HID.HID(info.path);
}

export function describe() {
  return listInterfaces().map((d) => ({
    path: d.path,
    product: d.product,
    usagePage: d.usagePage ? `0x${d.usagePage.toString(16)}` : undefined,
    usage: d.usage,
    interface: d.interface,
    productId: `0x${d.productId.toString(16)}`,
  }));
}

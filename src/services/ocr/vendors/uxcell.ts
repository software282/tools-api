import type { VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseBySku, toLines } from './common.js';

/**
 * uxcell item numbers look like `a19052400ux0362` — a leading letter, a date-like
 * digit run, `ux`, then a short serial.
 *
 * NOT VERIFIED against a real uxcell receipt. The shape is distinctive enough
 * that a false positive is implausible, and `getVendorParser` runs the generic
 * block parser behind this one, so if the pattern is wrong the result is simply
 * the generic baseline rather than a failure. Confirm and adjust when a real
 * uxcell order confirmation is available.
 */
const UXCELL_SKU = /\b[a-z]\d{6,12}ux\d{3,5}\b/i;

export const parseUxcell: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items = parseBySku(lines, UXCELL_SKU);
  if (items.length === 0) return null;

  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

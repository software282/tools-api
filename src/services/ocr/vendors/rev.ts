import type { VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseBySku, toLines } from './common.js';

// REV Robotics SKUs look like REV-31-1425 or REV-41-1097.
const REV_SKU = /\bREV-\d{2}-\d{3,4}\b/i;

export const parseRev: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items = parseBySku(lines, REV_SKU);
  if (items.length === 0) return null;
  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

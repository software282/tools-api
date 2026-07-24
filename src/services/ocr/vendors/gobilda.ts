import type { VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseBySku, toLines } from './common.js';

// goBILDA SKUs look like 5203-2402-0027 (three hyphen-separated numeric groups).
const GOBILDA_SKU = /\b\d{4}-\d{4}-\d{3,4}\b/;

export const parseGobilda: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items = parseBySku(lines, GOBILDA_SKU);
  if (items.length === 0) return null;
  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

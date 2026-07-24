import type { ParsedLineItem, VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseGenericItemLine, toLines } from './common.js';

// Axon receipts (often via distributors) lack a standardized SKU in the text,
// so we key on the "Axon" product name plus a price on the line.
export const parseAxon: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items: ParsedLineItem[] = [];
  for (const line of lines) {
    if (!/axon/i.test(line)) continue;
    const item = parseGenericItemLine(line);
    if (item) items.push(item);
  }
  if (items.length === 0) return null;
  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

import type { ParsedLineItem, VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseGenericItemLine, toLines } from './common.js';

/**
 * Last-resort text parser for vendors without a tuned parser. Treats any line
 * that has a price and a plausible name as a line item.
 */
export const parseGeneric: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items: ParsedLineItem[] = [];
  for (const line of lines) {
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

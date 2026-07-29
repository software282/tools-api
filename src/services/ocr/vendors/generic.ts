import type { VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseGenericBlocks, toLines } from './common.js';

/**
 * Vendor-agnostic parser, used for vendors with no tuned parser and as the
 * second pass behind every tuned one.
 *
 * Block-based, so it reads both shapes a receipt arrives in: a stacked digital
 * order confirmation (name, quantity and prices on separate lines) and a
 * single-line OCR'd photo.
 */
export const parseGeneric: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items = parseGenericBlocks(lines);
  if (items.length === 0) return null;

  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

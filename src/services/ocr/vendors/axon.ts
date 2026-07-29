import type { ParsedLineItem, VendorParser } from '../types.js';
import { collectBlocks, findOrderTotal, findPurchaseDate, parseBlockItem, toLines } from './common.js';

// Axon receipts (often via distributors) lack a standardized SKU in the text, so
// the product name is the anchor. Block-based like the SKU parsers, so a digital
// order confirmation that stacks the price under the name still works.
export const parseAxon: VendorParser = (text, vendor) => {
  const lines = toLines(text);
  const items: ParsedLineItem[] = [];

  for (const { block } of collectBlocks(lines, (line) => /axon/i.test(line))) {
    const item = parseBlockItem(block);
    // Require a price so headings like "Axon Servos" are not treated as items.
    if (item && item.lineTotal !== undefined) items.push(item);
  }

  if (items.length === 0) return null;
  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

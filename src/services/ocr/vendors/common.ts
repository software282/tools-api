import type { ParsedLineItem } from '../types.js';

/** Parse a money string like "$12.34" or "1,234.56" into a number. */
export function parseMoney(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Split OCR text into trimmed, non-empty lines. */
export function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Find an order total by scanning for a "total" label near the end. */
export function findOrderTotal(lines: string[]): number | undefined {
  // Prefer "Grand Total" / "Order Total" / "Total" — scan bottom-up.
  const patterns = [/grand\s*total/i, /order\s*total/i, /\btotal\b/i];
  for (const pattern of patterns) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (pattern.test(lines[i]) && !/sub\s*total/i.test(lines[i])) {
        const money = lines[i].match(/\$?\s?[\d,]+\.\d{2}/);
        if (money) return parseMoney(money[0]);
      }
    }
  }
  return undefined;
}

/** Try to find a purchase date in common receipt formats. Returns ISO string. */
export function findPurchaseDate(text: string): string | undefined {
  // e.g. 01/23/2026, 2026-01-23, Jan 23, 2026
  const mdy = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? `20${y}` : y;
    const date = new Date(Number(year), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const named = text.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (named) {
    const date = new Date(`${named[1]} ${named[2]}, ${named[3]}`);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

/**
 * Generic quantity/price tail parser. Given a line, tries to pull a trailing
 * "qty ... unitPrice ... lineTotal" pattern and the leading item name.
 * Returns null if it doesn't look like a line item.
 */
export function parseGenericItemLine(line: string): ParsedLineItem | null {
  // Skip obvious non-item lines.
  if (/sub\s*total|shipping|tax|total|discount|coupon|order\s*#|invoice/i.test(line)) {
    return null;
  }

  const moneyMatches = [...line.matchAll(/\$?\s?[\d,]+\.\d{2}/g)].map((m) => m[0]);
  // Need at least one price to consider it a purchasable line.
  if (moneyMatches.length === 0) return null;

  const qtyMatch = line.match(/(?:^|\s)(?:x\s*)?(\d{1,4})(?:\s*(?:x|ea|@))?\s/i);
  const quantity = qtyMatch ? Number(qtyMatch[1]) : 1;

  const lineTotal = parseMoney(moneyMatches[moneyMatches.length - 1]);
  const unitPrice = moneyMatches.length > 1 ? parseMoney(moneyMatches[0]) : lineTotal;

  // Item name = line with prices and standalone qty stripped.
  let name = line;
  for (const m of moneyMatches) name = name.replace(m, ' ');
  name = name.replace(/\b\d{1,4}\s*(?:x|ea|@)\b/gi, ' ').replace(/\s{2,}/g, ' ').trim();
  if (name.length < 2) return null;

  return { rawText: line, name, quantity: quantity > 0 ? quantity : 1, unitPrice, lineTotal };
}

const MONEY = /\$?\s?[\d,]+\.\d{2}/g;

/** Lines that mark the end of the item list, or are never items themselves. */
const NON_ITEM_LINE =
  /sub\s*total|shipping|handling|sales\s*tax|\btax\b|\btotal\b|discount|coupon|promo|order\s*#|invoice|payment|billing|ship\s*to|bill\s*to|tracking/i;

const QTY_LABEL = /\bqty\.?\s*[:x]?\s*(\d{1,4})\b/i;
const QTY_WORD = /\bquantity\s*[:x]?\s*(\d{1,4})\b/i;
const LEADING_MULTIPLIER = /(?:^|\s)(\d{1,3})\s*x\b/i;
const STANDALONE_INT = /^(\d{1,4})$/;

function moneyIn(text: string): string[] {
  return [...text.matchAll(MONEY)].map((m) => m[0]);
}

/** True if the line carries no information beyond a price or a bare quantity. */
function isNoiseLine(line: string): boolean {
  const stripped = line.replace(MONEY, ' ').replace(/\s+/g, ' ').trim();
  if (stripped.length === 0) return true;
  if (STANDALONE_INT.test(stripped)) return true;
  if (/^(qty|quantity)\.?\s*[:x]?\s*\d{0,4}$/i.test(stripped)) return true;
  if (/^(each|ea|per|unit price|item price|price|amount)$/i.test(stripped)) return true;
  return false;
}

/**
 * Group lines into one block per anchor line.
 *
 * Receipts arrive in two very different shapes. OCR'd photos put a whole item on
 * one line; digital order confirmations and PDF invoices usually stack the SKU,
 * name, quantity and prices on consecutive lines. Collecting a block per anchor
 * handles both: a single-line layout simply yields a one-line block.
 *
 * A block ends at the next anchor, at a totals/shipping line, or after
 * `maxBlockLines` — so a trailing "Order Total" is never absorbed into an item.
 */
export function collectBlocks(
  lines: string[],
  isAnchor: (line: string) => boolean,
  maxBlockLines = 8,
): Array<{ anchor: string; block: string[] }> {
  const anchorIndexes = lines.map((line, i) => (isAnchor(line) ? i : -1)).filter((i) => i >= 0);

  return anchorIndexes.map((start, position) => {
    const nextAnchor = anchorIndexes[position + 1] ?? lines.length;
    const hardStop = Math.min(nextAnchor, start + maxBlockLines, lines.length);

    const block = [lines[start]];
    for (let i = start + 1; i < hardStop; i++) {
      if (NON_ITEM_LINE.test(lines[i])) break;
      block.push(lines[i]);
    }
    return { anchor: lines[start], block };
  });
}

/**
 * Pull one line item out of a block. `sku` is removed from the text first so its
 * digits cannot be mistaken for a quantity or a price.
 */
export function parseBlockItem(block: string[], sku?: string): ParsedLineItem | null {
  const anchor = block[0];
  const withoutSku = (text: string) => (sku ? text.split(sku).join(' ') : text);
  const blockText = withoutSku(block.join('\n'));

  // Prices, in document order, across the whole block.
  const money = moneyIn(blockText);
  const lineTotal = parseMoney(money[money.length - 1]);
  const unitPrice = money.length > 1 ? parseMoney(money[0]) : lineTotal;

  // Quantity: an explicit label anywhere in the block wins; then a leading "N x"
  // on the anchor; then a line that is nothing but an integer.
  const labelled = blockText.match(QTY_LABEL) ?? blockText.match(QTY_WORD);
  const multiplier = withoutSku(anchor).match(LEADING_MULTIPLIER);
  const standalone = block
    .slice(1)
    .map((l) => withoutSku(l).trim().match(STANDALONE_INT))
    .find(Boolean);

  const rawQty = labelled?.[1] ?? multiplier?.[1] ?? standalone?.[1];
  const quantity = rawQty && Number(rawQty) > 0 ? Number(rawQty) : 1;

  const clean = (text: string) =>
    withoutSku(text)
      .replace(MONEY, ' ')
      .replace(/\b(qty|quantity)\.?\s*[:x]?\s*\d+\b/gi, ' ')
      .replace(/(?:^|\s)\d{1,3}\s*x\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

  // Single-line layout: the name is whatever remains on the anchor line. Stacked
  // layout: the anchor is just the SKU, so take the most descriptive other line.
  let name = clean(anchor);
  if (name.length < 2) {
    const candidates = block.slice(1).filter((l) => !isNoiseLine(l)).map(clean);
    name = candidates.sort((a, b) => b.length - a.length)[0] ?? '';
  }
  if (name.length < 2) name = sku ?? '';
  if (!name) return null;

  return { rawText: block.join(' | '), sku, name, quantity, unitPrice, lineTotal };
}

/**
 * Extract line items without knowing the vendor's SKU format.
 *
 * Anchors on any line that could be a product name — one that is not a price, a
 * bare quantity, or a totals line — and keeps only the blocks that contain a
 * price. That price requirement is what discards headers, addresses, and order
 * metadata without needing a list of what those look like.
 *
 * Used for vendors with no tuned parser, and as a second pass for tuned ones, so
 * an unrecognised SKU never costs more than the SKU itself.
 */
export function parseGenericBlocks(lines: string[]): ParsedLineItem[] {
  const isAnchor = (line: string) => !isNoiseLine(line) && !NON_ITEM_LINE.test(line);

  const items: ParsedLineItem[] = [];
  for (const { block } of collectBlocks(lines, isAnchor)) {
    // No price anywhere in the block means this was not a purchased line.
    if (moneyIn(block.join('\n')).length === 0) continue;

    const item = parseBlockItem(block);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Extract line items anchored on lines containing a vendor SKU. Handles both
 * single-line and stacked layouts — see `collectBlocks`.
 */
export function parseBySku(lines: string[], skuRegex: RegExp): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  for (const { anchor, block } of collectBlocks(lines, (line) => skuRegex.test(line))) {
    const sku = anchor.match(skuRegex)?.[0];
    const item = parseBlockItem(block, sku);
    if (item) items.push(item);
  }
  return items;
}

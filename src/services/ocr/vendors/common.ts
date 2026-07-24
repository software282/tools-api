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

/**
 * Extract line items whose lines contain a vendor SKU matching `skuRegex`.
 * If a matched line has no price, the next line is checked (many receipts wrap
 * the name and price onto separate lines).
 */
export function parseBySku(lines: string[], skuRegex: RegExp): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const skuMatch = line.match(skuRegex);
    if (!skuMatch) continue;

    const sku = skuMatch[0];
    let priceSource = line;
    let combined = line;
    // If no price on the SKU line, look at the following line.
    if (!/[\d,]+\.\d{2}/.test(line) && i + 1 < lines.length) {
      priceSource = lines[i + 1];
      combined = `${line} ${lines[i + 1]}`;
    }

    const moneyMatches = [...priceSource.matchAll(/\$?\s?[\d,]+\.\d{2}/g)].map((m) => m[0]);
    const lineTotal = parseMoney(moneyMatches[moneyMatches.length - 1]);
    const unitPrice = moneyMatches.length > 1 ? parseMoney(moneyMatches[0]) : lineTotal;

    // Detect quantity on text with the SKU removed so its digits don't interfere.
    // Two common layouts: "Qty 4" (label first) and "2 x SKU ..." (count then x).
    const combinedNoSku = combined.replace(sku, ' ');
    const qtyLabel = combinedNoSku.match(/\bqty\.?\s*[:x]?\s*(\d{1,4})\b/i);
    const leadingMultiplier = line.replace(sku, ' ').match(/(?:^|\s)(\d{1,3})\s*x\b/i);
    const quantity = qtyLabel
      ? Number(qtyLabel[1])
      : leadingMultiplier
        ? Number(leadingMultiplier[1])
        : 1;

    // Name: drop the SKU, prices, quantity labels, and leading "N x" multiplier.
    let name = line.replace(sku, ' ');
    for (const m of moneyMatches) name = name.replace(m, ' ');
    name = name
      .replace(/\bqty\.?\s*[:x]?\s*\d+\b/gi, ' ')
      .replace(/(?:^|\s)\d{1,3}\s*x\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!name) name = sku;

    items.push({ rawText: combined, sku, name, quantity: quantity > 0 ? quantity : 1, unitPrice, lineTotal });
  }
  return items;
}

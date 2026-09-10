import type { ParsedLineItem, VendorParser } from '../types.js';
import { findOrderTotal, findPurchaseDate, parseBySku, parseMoney, toLines } from './common.js';

// goBILDA SKUs look like 5203-2402-0027 (three hyphen-separated numeric groups).
const GOBILDA_SKU = /\b\d{4}-\d{4}-\d{3,4}\b/;

// ─────────────────────────── PDF invoice table ───────────────────────────
//
// goBILDA's *emailed order confirmation* stacks one field per line and prints
// the whole SKU on its own line — `parseBySku` handles that. Its *downloadable
// PDF invoice* is a different animal: a table whose long cells wrap across
// lines. The SKU splits after the second hyphen, the name runs to three lines,
// and the quantity leads the row:
//
//   Qty Code/SKU Product Name Price Total     ← column header
//   8 1611-0514-                              ← qty + start of SKU
//   0008                                      ← rest of SKU
//   1611 Series Flanged Ball Bearing (8mm ID  ← name, wrapped
//   x 14mm OD, 5mm Thickness) - 2 Pack
//   $2.99 $23.92                              ← unit + line total → row ends
//   5 5027103001 Wera Tools 3mm ... L-Key $2.99 $14.95   ← or all on one line
//   ...
//   Subtotal $185.55                          ← end of this table
//
// The table can repeat with its own header on a second page. Every occurrence
// is parsed and the items concatenated. Anything outside a header→Subtotal
// span — the "Credit Card ($217.91)" summary line up top, the bill-to address,
// the totals block — is never looked at.

const INVOICE_HEADER = /^qty\s+code\/sku\s+product\s*name\s+price\s+total$/i;
const TABLE_END = /^(sub\s*total|grand\s*total)\b/i;
// A row starts with the quantity, then the SKU: goBILDA's hyphenated 4-4-4
// (often wrapped, so the trailing group may be absent here) or a 9-12 digit
// resale part number.
const ROW_START = /^(\d{1,3})\s+(\d{4}-\d{4}-\d{0,4}|\d{9,12})(?=\s|$)/;
const PRICE_PAIR = /\$?\s?([\d,]+\.\d{2})\s+\$?\s?([\d,]+\.\d{2})\s*$/;
const ANY_MONEY = /\$?\s?([\d,]+\.\d{2})/g;
const SKU_IN_TEXT = /\b\d{4}-\d{4}-\d{3,4}\b|\b\d{9,12}\b/;

/**
 * Join wrapped fragments back together. goBILDA wraps a long word at a hyphen
 * that belongs to the word ("Hex-Plus L-\nKey", "1611-0514-\n0008"), so a
 * fragment ending in "-" continues with no gap; every other break was at a
 * space.
 */
function joinWrapped(fragments: string[]): string {
  return fragments.reduce((acc, part, i) =>
    i === 0 ? part : acc.endsWith('-') ? acc + part : `${acc} ${part}`,
  );
}

function parseInvoiceRecord(record: string[]): ParsedLineItem | null {
  const start = record[0].match(ROW_START);
  if (!start) return null;
  const quantity = Number(start[1]);

  const joined = joinWrapped(record);

  let unitPrice: number | undefined;
  let lineTotal: number | undefined;
  const pair = joined.match(PRICE_PAIR);
  if (pair) {
    unitPrice = parseMoney(pair[1]);
    lineTotal = parseMoney(pair[2]);
  } else {
    const money = [...joined.matchAll(ANY_MONEY)].map((m) => parseMoney(m[1]));
    lineTotal = money.at(-1);
    unitPrice = money.length > 1 ? money.at(-2) : lineTotal;
  }

  const beforePrice = joined.replace(ANY_MONEY, ' ').replace(/\s{2,}/g, ' ').trim();
  const sku = beforePrice.match(SKU_IN_TEXT)?.[0];

  let name = beforePrice
    .replace(new RegExp(`^${start[1]}\\s+`), '')
    .replace(sku ?? '\0', ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!name) name = sku ?? '';
  if (!name) return null;

  return {
    rawText: record.join(' '),
    sku,
    name,
    quantity: quantity > 0 ? quantity : 1,
    unitPrice,
    lineTotal,
  };
}

function parseInvoiceTables(lines: string[]): ParsedLineItem[] {
  const headers = lines.map((l, i) => (INVOICE_HEADER.test(l) ? i : -1)).filter((i) => i >= 0);
  if (headers.length === 0) return [];

  const items: ParsedLineItem[] = [];
  for (const header of headers) {
    let end = lines.findIndex((l, i) => i > header && TABLE_END.test(l));
    if (end === -1) end = lines.length;

    let current: string[] | null = null;
    const records: string[][] = [];
    for (const row of lines.slice(header + 1, end)) {
      if (ROW_START.test(row)) {
        if (current) records.push(current);
        current = [row];
      } else if (current) {
        current.push(row);
      }
    }
    if (current) records.push(current);

    for (const record of records) {
      const item = parseInvoiceRecord(record);
      if (item) items.push(item);
    }
  }
  return items;
}

// ─────────────────────────── stacked email confirmation ───────────────────
//
// goBILDA's order-confirmation email stacks each item, in one of two layouts:
//
//   A (name above the SKU)          B (name below the SKU)
//   7mm Combination Nut Driver      5203-2402-0027
//   7mm Combination Nut Driver      5203 Series Yellow Jacket ...
//   4206-0070-0001                  Qty: 2
//   Brand: goBILDA®                 $43.00
//   $2.99                           $86.00
//   Qty: 5
//   $14.95
//
// `parseBySku` mishandles both: it only knows goBILDA's hyphenated SKU, so the
// 10-digit *resale* SKUs (Wera tools, etc.) aren't anchored and their names
// bleed onto the item above; and it picks a name by "longest line in the
// block", which grabs the *next* item's name, and strips "27 x 44" out of
// "…, 27 x 44 Hole, …". This reads the structure directly.

const STACKED_SKU_LINE = /^(\d{4}-\d{4}-\d{3,4}|\d{6,12})$/;
const STACKED_END = /^(sub\s*total|grand\s*total)\b/i;
const MONEY_ONLY = /^\$?\s?([\d,]+\.\d{2})$/;
const QTY_LINE = /^qty\.?:?\s*(\d+)/i;

/** A line that reads like a product name rather than a price, a SKU, a "Qty:",
 *  a "Brand:" tag, or order metadata. */
function looksLikeName(s: string | undefined): boolean {
  if (!s) return false;
  if (STACKED_SKU_LINE.test(s) || MONEY_ONLY.test(s) || QTY_LINE.test(s)) return false;
  if (STACKED_END.test(s) || /^(brand\s*:|order\s*#|placed on|date\s*:|subject\s*:|from\s*:|to\s*:|shipping|payment|thanks)/i.test(s)) return false;
  return /[a-z]{3}/i.test(s);
}

function parseStackedEmail(lines: string[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const skuMatch = lines[i].match(STACKED_SKU_LINE);
    if (!skuMatch) continue;
    const sku = skuMatch[1];

    // Layout B prints the name right after the SKU; layout A right before it
    // (twice). Prefer the line after when it's a real name.
    const name = looksLikeName(lines[i + 1])
      ? lines[i + 1]
      : looksLikeName(lines[i - 1])
        ? lines[i - 1]
        : sku;

    // Forward: first $ is the unit price, "Qty: N" the quantity, the next $ the
    // line total. Stop at the next SKU line or a totals line.
    let unitPrice: number | undefined;
    let lineTotal: number | undefined;
    let quantity = 1;
    for (let j = i + 1; j < lines.length && j < i + 8; j++) {
      if (STACKED_SKU_LINE.test(lines[j]) || STACKED_END.test(lines[j])) break;
      const qty = lines[j].match(QTY_LINE);
      if (qty) {
        quantity = Number(qty[1]) || 1;
        continue;
      }
      const money = lines[j].match(MONEY_ONLY);
      if (money) {
        if (unitPrice === undefined) unitPrice = parseMoney(money[1]);
        else if (lineTotal === undefined) lineTotal = parseMoney(money[1]);
      }
    }
    if (unitPrice === undefined && lineTotal === undefined) continue; // not a real item

    items.push({
      rawText: `${name} | ${sku}`,
      sku,
      name,
      quantity,
      unitPrice,
      lineTotal: lineTotal ?? unitPrice,
    });
  }

  return items;
}

export const parseGobilda: VendorParser = (text, vendor) => {
  const lines = toLines(text);

  // Three known layouts, most specific first: the PDF invoice's wrapped table,
  // the stacked email confirmation, then parseBySku for a single-line paste or
  // an OCR'd photo.
  let items = parseInvoiceTables(lines);
  if (items.length === 0) items = parseStackedEmail(lines);
  if (items.length === 0) items = parseBySku(lines, GOBILDA_SKU);
  if (items.length === 0) return null;

  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

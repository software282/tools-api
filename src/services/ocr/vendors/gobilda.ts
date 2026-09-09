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

export const parseGobilda: VendorParser = (text, vendor) => {
  const lines = toLines(text);

  // The PDF invoice announces itself with a column header; anything else is the
  // emailed / single-line confirmation that parseBySku already handles.
  const invoiceItems = parseInvoiceTables(lines);
  const items = invoiceItems.length > 0 ? invoiceItems : parseBySku(lines, GOBILDA_SKU);
  if (items.length === 0) return null;

  return {
    vendor,
    items,
    orderTotal: findOrderTotal(lines),
    purchasedAt: findPurchaseDate(text),
  };
};

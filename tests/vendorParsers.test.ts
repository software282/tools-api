import { describe, expect, it } from 'vitest';
import { getVendorParser } from '../src/services/ocr/vendors/index.js';
import { findOrderTotal, findPurchaseDate, toLines } from '../src/services/ocr/vendors/common.js';

const GOBILDA_RECEIPT = `
goBILDA Order Confirmation
Order #1046221
Jan 23, 2026

5203-2402-0027 5203 Series Yellow Jacket Planetary Gear Motor  Qty 2  $43.00  $86.00
3407-0016-0002 Aluminum REX Shaft - 8mm  Qty 4  $8.99  $35.96
Subtotal  $121.96
Shipping  $12.50
Order Total  $134.46
`;

const REV_RECEIPT = `
REV Robotics
Invoice 88213
02/14/2026

REV-31-1425 Through Bore Encoder  Qty 3  $32.00  $96.00
REV-41-1097 15mm Extrusion 420mm  Qty 2  $14.50  $29.00
Subtotal  $125.00
Grand Total  $137.75
`;

describe('goBILDA parser', () => {
  const parsed = getVendorParser('GOBILDA')(GOBILDA_RECEIPT, 'GOBILDA');

  it('extracts both line items and skips shipping/subtotal/total lines', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.items).toHaveLength(2);
  });

  it('reads SKU, name, quantity and prices off a single line', () => {
    const motor = parsed!.items[0];
    expect(motor.sku).toBe('5203-2402-0027');
    expect(motor.name).toBe('5203 Series Yellow Jacket Planetary Gear Motor');
    expect(motor.quantity).toBe(2);
    expect(motor.unitPrice).toBe(43);
    expect(motor.lineTotal).toBe(86);
  });

  it('keeps the SKU out of the item name', () => {
    for (const item of parsed!.items) {
      expect(item.name).not.toContain(item.sku!);
    }
  });

  it('prefers the order total over the subtotal', () => {
    expect(parsed!.orderTotal).toBe(134.46);
  });

  it('reads the purchase date', () => {
    expect(parsed!.purchasedAt).toBeDefined();
    const date = new Date(parsed!.purchasedAt!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(23);
  });
});

// goBILDA's downloadable PDF *invoice* — as opposed to the emailed confirmation
// above. Its table wraps SKUs after the second hyphen and names across up to
// three lines, leads each row with the quantity, and repeats on a second page
// with its own header. This is a trimmed copy of a real one (Order #200131241);
// the full receipt is tests/fixtures/receipts/gobilda-2026-08-pdf-invoice.
const GOBILDA_PDF_INVOICE = `
#200131241
Credit Card ($217.91)
Aug 25th 2026
goBILDA® Invoice for Order #200131241
Order Items
Qty Code/SKU Product Name Price Total
8 1611-0514-
0008
1611 Series Flanged Ball Bearing (8mm ID
x 14mm OD, 5mm Thickness) - 2 Pack
$2.99 $23.92
5 5027103001 Wera Tools 2.5mm Ball-End Hex-Plus L-
Key
$2.49 $12.45
3 4202-0070-
1070
7mm Combination Wrench $1.99 $5.97
Subtotal $44.34
Shipping $11.99
Tax $4.87
Grand total $61.20
Qty Code/SKU Product Name Price Total
6 3422-0125-
0020
2mm Pitch GT2 Pinion Timing Pulley (1/8"
Bore, 20 Tooth)
$5.99 $35.94
Subtotal $44.34
Grand total $61.20
`;

describe('goBILDA PDF invoice table', () => {
  const parsed = getVendorParser('GOBILDA')(GOBILDA_PDF_INVOICE, 'GOBILDA');

  it('parses every row across both pages, and nothing else', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.items).toHaveLength(4);
  });

  it('never treats the "Credit Card ($217.91)" summary line as an item', () => {
    for (const item of parsed!.items) {
      expect(item.name.toLowerCase()).not.toContain('credit card');
      expect(item.lineTotal).not.toBe(217.91);
    }
  });

  it('reassembles a SKU that wrapped after the second hyphen', () => {
    expect(parsed!.items[0].sku).toBe('1611-0514-0008');
    expect(parsed!.items[2].sku).toBe('4202-0070-1070');
  });

  it('takes the quantity from the front of the row', () => {
    expect(parsed!.items.map((i) => i.quantity)).toEqual([8, 5, 3, 6]);
  });

  it('joins a wrapped product name — tight at a hyphen, spaced otherwise', () => {
    expect(parsed!.items[0].name).toBe(
      '1611 Series Flanged Ball Bearing (8mm ID x 14mm OD, 5mm Thickness) - 2 Pack',
    );
    expect(parsed!.items[1].name).toBe('Wera Tools 2.5mm Ball-End Hex-Plus L-Key');
  });

  it('reads unit price and line total from the "$u $t" cell', () => {
    expect(parsed!.items[0].unitPrice).toBe(2.99);
    expect(parsed!.items[0].lineTotal).toBe(23.92);
    expect(parsed!.items[2].lineTotal).toBe(5.97);
  });

  it('reads the "25th" ordinal date and the grand total', () => {
    expect(parsed!.orderTotal).toBe(61.2);
    expect(new Date(parsed!.purchasedAt!).getMonth()).toBe(7); // August
    expect(new Date(parsed!.purchasedAt!).getDate()).toBe(25);
  });
});

// goBILDA's order-confirmation *email*, "layout A": product name (printed
// twice) above the SKU, an optional "Brand:" line, then $unit / Qty / $total.
// Trimmed from a real one (Order #200131241). The 10-digit line is a Wera
// resale SKU — goBILDA sells third-party tools under their own part numbers.
const GOBILDA_EMAIL = `
From: goBILDA® <sales@gobilda.com>
Subject: Your goBILDA® Order Confirmation (#200131241)

goBILDA®
Order #200131241
7mm Combination Nut Driver
7mm Combination Nut Driver
4206-0070-0001
$2.99
Qty: 5
$14.95
Wera Tools 2.5mm Ball-End Hex-Plus L-Key
Wera Tools 2.5mm Ball-End Hex-Plus L-Key
5027103001
$2.49
Qty: 5
$12.45
Clear Polycarbonate Grid Plate (1.5mm Thickness, 27 x 44 Hole, 216 x 352mm)
Clear Polycarbonate Grid Plate (1.5mm Thickness, 27 x 44 Hole, 216 x 352mm)
1117-0216-0352
Brand: goBILDA®
$8.99
Qty: 4
$35.96
Subtotal:
$53.86
Grand total:
$67.86
`;

describe('goBILDA stacked email confirmation', () => {
  const parsed = getVendorParser('GOBILDA')(GOBILDA_EMAIL, 'GOBILDA');

  it('finds every item, including one under a 10-digit resale SKU', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.items.map((i) => i.sku)).toEqual([
      '4206-0070-0001',
      '5027103001',
      '1117-0216-0352',
    ]);
  });

  it('takes each name from directly above its SKU — not the next item down', () => {
    expect(parsed!.items[0].name).toBe('7mm Combination Nut Driver');
    expect(parsed!.items[1].name).toBe('Wera Tools 2.5mm Ball-End Hex-Plus L-Key');
  });

  it('keeps "27 x 44 Hole, 216 x 352mm" intact in the name', () => {
    expect(parsed!.items[2].name).toBe(
      'Clear Polycarbonate Grid Plate (1.5mm Thickness, 27 x 44 Hole, 216 x 352mm)',
    );
  });

  it('reads quantity and both prices from their own lines', () => {
    expect(parsed!.items[0].quantity).toBe(5);
    expect(parsed!.items[0].unitPrice).toBe(2.99);
    expect(parsed!.items[0].lineTotal).toBe(14.95);
  });

  it('reads the grand total even when the label and amount are on separate lines', () => {
    expect(parsed!.orderTotal).toBe(67.86);
  });
});

describe('REV parser', () => {
  const parsed = getVendorParser('REV')(REV_RECEIPT, 'REV');

  it('extracts REV-prefixed SKUs', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.items.map((i) => i.sku)).toEqual(['REV-31-1425', 'REV-41-1097']);
  });

  it('reads quantities and prices', () => {
    expect(parsed!.items[0].quantity).toBe(3);
    expect(parsed!.items[0].unitPrice).toBe(32);
    expect(parsed!.items[1].lineTotal).toBe(29);
  });

  it('prefers "Grand Total" over "Subtotal"', () => {
    expect(parsed!.orderTotal).toBe(137.75);
  });

  it('parses a numeric date', () => {
    const date = new Date(parsed!.purchasedAt!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(1);
    expect(date.getDate()).toBe(14);
  });
});

describe('parser fallback behaviour', () => {
  it('returns null when no vendor SKU is present, so the pipeline falls back to Claude', () => {
    expect(getVendorParser('GOBILDA')('Some unrelated text\nTotal $5.00', 'GOBILDA')).toBeNull();
  });

  it('uses the generic parser for vendors without a tuned one', () => {
    // FERRA has no tuned parser; the generic one keys off prices, not SKUs.
    const parsed = getVendorParser('FERRA')('Motor Mount Bracket  2 x  $6.00  $12.00', 'FERRA');
    expect(parsed).not.toBeNull();
    expect(parsed!.items.length).toBeGreaterThan(0);
  });
});

describe('findOrderTotal', () => {
  it('ignores a subtotal line even when no other total exists', () => {
    expect(findOrderTotal(toLines('Subtotal  $10.00'))).toBeUndefined();
  });

  it('falls back to a bare "Total" label', () => {
    expect(findOrderTotal(toLines('Subtotal $10.00\nTotal $11.25'))).toBe(11.25);
  });
});

describe('findPurchaseDate', () => {
  it('does not mistake a goBILDA SKU for a date', () => {
    expect(findPurchaseDate('5203-2402-0027 Yellow Jacket Motor')).toBeUndefined();
  });

  it('handles two-digit years', () => {
    const iso = findPurchaseDate('Ordered 3/9/26');
    expect(iso).toBeDefined();
    expect(new Date(iso!).getFullYear()).toBe(2026);
  });
});

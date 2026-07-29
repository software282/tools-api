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

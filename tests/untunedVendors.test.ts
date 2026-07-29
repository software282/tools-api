import { describe, expect, it } from 'vitest';
import { getVendorParser } from '../src/services/ocr/vendors/index.js';

/**
 * Five of the eight vendors have no tuned parser, because their SKU formats are
 * not known well enough to pattern-match without guessing. They rely on the
 * generic block parser instead, which needs no SKU at all.
 *
 * That makes these the tests that decide whether the >90% digital accuracy bar is
 * reachable for most of the vendor list — the regression they guard is real: the
 * generic parser previously returned nothing at all for stacked digital layouts,
 * so every digital receipt from these vendors fell through to Claude.
 */

const UNTUNED = ['FERRA', 'MELONBOTICS', 'OFFSET', 'MATA', 'OTHER'] as const;

/** The same order, in both shapes a receipt arrives in. */
const stacked = (vendorName: string) =>
  [
    `${vendorName} Components`,
    'Order Confirmation - Feb 3, 2026',
    `${vendorName} Ultraplanetary Gearbox Kit`,
    'Qty: 1',
    '$54.00',
    '$54.00',
    `${vendorName} 8mm Hex Adapter`,
    'Qty: 4',
    '$6.25',
    '$25.00',
    'Subtotal: $79.00',
    'Order Total: $86.50',
  ].join('\n');

const flat = (vendorName: string) =>
  [
    `${vendorName} Components  Feb 3, 2026`,
    `${vendorName} Ultraplanetary Gearbox Kit  Qty: 1  $54.00  $54.00`,
    `${vendorName} 8mm Hex Adapter  Qty: 4  $6.25  $25.00`,
    'Order Total: $86.50',
  ].join('\n');

describe.each(UNTUNED)('%s (no tuned parser)', (vendor) => {
  const label = vendor === 'OTHER' ? 'Acme' : vendor;

  it('reads a stacked digital confirmation', () => {
    const parsed = getVendorParser(vendor)(stacked(label), vendor);
    expect(parsed).not.toBeNull();
    expect(parsed!.items).toHaveLength(2);
    expect(parsed!.items[0].quantity).toBe(1);
    expect(parsed!.items[1].quantity).toBe(4);
    expect(parsed!.items[1].unitPrice).toBe(6.25);
    expect(parsed!.items[1].lineTotal).toBe(25);
    expect(parsed!.orderTotal).toBe(86.5);
  });

  it('reads the same order from a single-line photo layout', () => {
    const parsed = getVendorParser(vendor)(flat(label), vendor);
    expect(parsed!.items).toHaveLength(2);
    expect(parsed!.items[1].quantity).toBe(4);
    expect(parsed!.items[1].lineTotal).toBe(25);
  });

  it('leaves the quantity out of the item name, which would poison part matching', () => {
    for (const layout of [stacked(label), flat(label)]) {
      const parsed = getVendorParser(vendor)(layout, vendor);
      for (const item of parsed!.items) {
        expect(item.name).not.toMatch(/qty/i);
        expect(item.name).not.toMatch(/\$/);
      }
    }
  });

  it('does not turn headers or totals into line items', () => {
    const parsed = getVendorParser(vendor)(stacked(label), vendor);
    const names = parsed!.items.map((i) => i.name.toLowerCase());
    expect(names.some((n) => n.includes('order confirmation'))).toBe(false);
    expect(names.some((n) => n.includes('subtotal'))).toBe(false);
    expect(names.some((n) => n.includes('total'))).toBe(false);
  });
});

describe('tuned parsers fall back to the generic pass', () => {
  // A goBILDA confirmation with no SKUs shown — the tuned pattern finds nothing,
  // so without composition this would yield nothing and reach Claude.
  const noSkus = [
    'goBILDA Order Confirmation',
    'Yellow Jacket Planetary Gear Motor',
    'Qty: 2',
    '$43.00',
    '$86.00',
    'Order Total: $86.00',
  ].join('\n');

  it('still extracts items when the vendor SKU pattern does not match', () => {
    const parsed = getVendorParser('GOBILDA')(noSkus, 'GOBILDA');
    expect(parsed).not.toBeNull();
    expect(parsed!.items).toHaveLength(1);
    expect(parsed!.items[0].name).toBe('Yellow Jacket Planetary Gear Motor');
    expect(parsed!.items[0].quantity).toBe(2);
    expect(parsed!.items[0].sku).toBeUndefined();
  });

  it('prefers the tuned parser when SKUs are present', () => {
    const withSku = [
      'goBILDA Order Confirmation',
      '5203-2402-0027',
      'Yellow Jacket Planetary Gear Motor',
      'Qty: 2',
      '$43.00',
      '$86.00',
    ].join('\n');
    const parsed = getVendorParser('GOBILDA')(withSku, 'GOBILDA');
    expect(parsed!.items[0].sku).toBe('5203-2402-0027');
  });
});

describe('uxcell item numbers', () => {
  // Pattern is unverified against a real receipt; the contract that matters is
  // that a miss degrades to the generic baseline rather than to nothing.
  it('picks up a uxcell-shaped item number when present', () => {
    const parsed = getVendorParser('UXCELL')(
      ['uxcell Order', 'a19052400ux0362', 'GT2 Timing Belt 200mm', 'Qty: 2', '$7.99', '$15.98'].join(
        '\n',
      ),
      'UXCELL',
    );
    expect(parsed!.items[0].sku).toBe('a19052400ux0362');
    expect(parsed!.items[0].name).toBe('GT2 Timing Belt 200mm');
  });

  it('still parses a uxcell receipt with no recognisable item number', () => {
    const parsed = getVendorParser('UXCELL')(
      ['uxcell Order', 'GT2 Timing Belt 200mm', 'Qty: 2', '$7.99', '$15.98'].join('\n'),
      'UXCELL',
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0].name).toBe('GT2 Timing Belt 200mm');
    expect(parsed!.items[0].quantity).toBe(2);
  });
});

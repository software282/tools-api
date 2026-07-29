import { describe, expect, it } from 'vitest';
import { getVendorParser } from '../src/services/ocr/vendors/index.js';
import {
  htmlToText,
  looksLikeHtml,
  normalizeWhitespace,
  pdfToText,
} from '../src/services/ocr/textExtract.js';
import { makeTextPdf } from './helpers/makePdf.js';

/**
 * Digital receipts are the common case: nearly every FTC order is placed online,
 * so the receipt arrives as an emailed confirmation or a downloaded PDF. Their
 * text is already exact — the work is preserving line structure well enough for
 * the vendor parsers to group each item.
 *
 * These layouts stack SKU, name, quantity and prices on separate lines, which is
 * what real confirmations do and what a photo-oriented parser gets wrong.
 */

const GOBILDA_CONFIRMATION = `
goBILDA
Order Confirmation
Order #1046221
Placed on Jan 23, 2026

5203-2402-0027
5203 Series Yellow Jacket Planetary Gear Motor (19.2:1 Ratio, 312 RPM)
Qty: 2
$43.00
$86.00

3407-0016-0002
Aluminum REX Shaft - 8mm
Qty: 4
$8.99
$35.96

Subtotal: $121.96
Shipping: $12.50
Order Total: $134.46
`;

describe('stacked digital order confirmation', () => {
  const parsed = getVendorParser('GOBILDA')(GOBILDA_CONFIRMATION, 'GOBILDA');

  it('finds every line item despite one field per line', () => {
    expect(parsed).not.toBeNull();
    expect(parsed!.items).toHaveLength(2);
  });

  it('takes the name from the line below the SKU', () => {
    const motor = parsed!.items[0];
    expect(motor.sku).toBe('5203-2402-0027');
    expect(motor.name).toBe(
      '5203 Series Yellow Jacket Planetary Gear Motor (19.2:1 Ratio, 312 RPM)',
    );
  });

  it('reads quantity from a "Qty:" line of its own', () => {
    expect(parsed!.items[0].quantity).toBe(2);
    expect(parsed!.items[1].quantity).toBe(4);
  });

  it('assigns unit price and line total from stacked prices', () => {
    expect(parsed!.items[0].unitPrice).toBe(43);
    expect(parsed!.items[0].lineTotal).toBe(86);
    expect(parsed!.items[1].unitPrice).toBe(8.99);
    expect(parsed!.items[1].lineTotal).toBe(35.96);
  });

  it('does not absorb the totals block into the last item', () => {
    expect(parsed!.items[1].lineTotal).not.toBe(134.46);
    expect(parsed!.orderTotal).toBe(134.46);
  });

  it('still reads the order date', () => {
    const date = new Date(parsed!.purchasedAt!);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(23);
  });
});

describe('REV confirmation with quantity above the price', () => {
  const parsed = getVendorParser('REV')(
    [
      'REV Robotics Order Confirmation',
      '02/14/2026',
      'REV-31-1425',
      'Through Bore Encoder',
      'Quantity 3',
      '$32.00',
      '$96.00',
      'Grand Total: $96.00',
    ].join('\n'),
    'REV',
  );

  it('parses the item', () => {
    expect(parsed!.items).toHaveLength(1);
    expect(parsed!.items[0].sku).toBe('REV-31-1425');
    expect(parsed!.items[0].name).toBe('Through Bore Encoder');
    expect(parsed!.items[0].quantity).toBe(3);
    expect(parsed!.items[0].lineTotal).toBe(96);
  });
});

describe('HTML order confirmation emails', () => {
  const html = `
    <html><body>
      <h1>goBILDA Order Confirmation</h1>
      <p>Placed on Jan 23, 2026</p>
      <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
        <tr>
          <td>5203-2402-0027<br/>5203 Series Yellow Jacket Planetary Gear Motor</td>
          <td>Qty: 2</td>
          <td>$86.00</td>
        </tr>
      </table>
      <p>Order Total: $86.00</p>
      <a href="https://tracking.example.com/xyz">Track your package</a>
    </body></html>`;

  it('is detected as HTML', () => {
    expect(looksLikeHtml(html)).toBe(true);
    expect(looksLikeHtml('goBILDA Order\n5203-2402-0027\nQty: 2')).toBe(false);
  });

  it('converts to text the vendor parser can read', () => {
    const text = htmlToText(html);
    expect(text).toContain('5203-2402-0027');

    const parsed = getVendorParser('GOBILDA')(text, 'GOBILDA');
    expect(parsed).not.toBeNull();
    expect(parsed!.items[0].sku).toBe('5203-2402-0027');
    expect(parsed!.items[0].quantity).toBe(2);
  });

  it('drops link URLs, which otherwise pollute item names', () => {
    expect(htmlToText(html)).not.toContain('tracking.example.com');
  });
});

describe('digital PDF invoices', () => {
  it('reads the text layer and parses it', async () => {
    const pdf = makeTextPdf([
      'goBILDA Order Confirmation',
      'Order #1046221',
      'Jan 23, 2026',
      '5203-2402-0027',
      '5203 Series Yellow Jacket Planetary Gear Motor',
      'Qty: 2',
      '$43.00',
      '$86.00',
      'Order Total: $134.46',
    ]);

    const text = await pdfToText(pdf);
    expect(text).not.toBeNull();
    expect(text).toContain('5203-2402-0027');

    const parsed = getVendorParser('GOBILDA')(text!, 'GOBILDA');
    expect(parsed!.items).toHaveLength(1);
    expect(parsed!.items[0].quantity).toBe(2);
    expect(parsed!.items[0].unitPrice).toBe(43);
    expect(parsed!.items[0].lineTotal).toBe(86);
    expect(parsed!.orderTotal).toBe(134.46);
  });

  it('returns null for a PDF with no text layer, so the caller can ask for an image', async () => {
    // A valid PDF whose only text is whitespace has no usable text layer.
    expect(await pdfToText(makeTextPdf([' ']))).toBeNull();
  });
});

describe('normalizeWhitespace', () => {
  it('drops blank lines and non-breaking spaces without merging fields', () => {
    const input = 'Item Name\n\n\n  $12.00  \n\nQty: 2\n';
    expect(normalizeWhitespace(input)).toBe('Item Name\n$12.00\nQty: 2');
  });
});

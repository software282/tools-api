import type { Vendor } from '@prisma/client';
import type { ParsedReceipt } from './types.js';

const VENDOR_HINTS: Partial<Record<Vendor, string>> = {
  GOBILDA: 'goBILDA. SKUs look like 5203-2402-0027 (three hyphen-separated numeric groups).',
  REV: 'REV Robotics. SKUs look like REV-31-1425.',
  AXON: 'Axon (servos such as Axon MAX, MINI, Micro). Often sold via a distributor.',
  FERRA: 'Ferra Components (FTC parts).',
  MELONBOTICS: 'MelonBotics.',
  OFFSET: 'Offset Robotics.',
  MATA: 'Mata servos.',
  UXCELL: 'uxcell (belts, hardware).',
};

/**
 * The extraction prompt, shared by the text and vision paths so both return the
 * same JSON shape. `source` only changes the opening sentence: a pasted order
 * confirmation is exact text to organise, an image is something to read.
 */
export function buildReceiptPrompt(vendor: Vendor, source: 'text' | 'image'): string {
  const hint = VENDOR_HINTS[vendor] ?? 'an FTC robotics parts vendor';
  const opening =
    source === 'text'
      ? `The text below is a purchase receipt or order confirmation from ${hint}`
      : `This is a purchase receipt or order confirmation from ${hint}`;

  return [
    opening,
    '',
    'Extract every purchased line item. Respond with ONLY a JSON object (no prose, no code fences) of the form:',
    '{',
    '  "orderTotal": number | null,',
    '  "purchasedAt": string | null,   // ISO 8601 date if visible, else null',
    '  "items": [',
    '    { "sku": string | null, "name": string, "quantity": number, "unitPrice": number | null, "lineTotal": number | null }',
    '  ]',
    '}',
    '',
    'Rules: exclude shipping, tax, discounts, and subtotal/total lines from "items". Use the vendor part number for "sku" when present. If quantity is not shown, use 1. Numbers must be plain (no "$" or commas).',
  ].join('\n');
}

/** Extract the first JSON object from a possibly-fenced model response. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Claude response did not contain JSON');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

interface RawClaudeReceipt {
  orderTotal?: number | null;
  purchasedAt?: string | null;
  items?: Array<{
    sku?: string | null;
    name?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    lineTotal?: number | null;
  }>;
}

/** Normalise a model response into a ParsedReceipt, dropping unusable items. */
export function coerceParsedReceipt(parsed: unknown, vendor: Vendor): ParsedReceipt {
  const raw = (parsed ?? {}) as RawClaudeReceipt;

  const items = (raw.items ?? [])
    .filter((item) => item && (item.name ?? '').trim().length > 0)
    .map((item) => ({
      sku: item.sku ?? undefined,
      name: (item.name ?? '').trim(),
      quantity: item.quantity && item.quantity > 0 ? Math.round(item.quantity) : 1,
      unitPrice: item.unitPrice ?? undefined,
      lineTotal: item.lineTotal ?? undefined,
    }));

  return {
    vendor,
    orderTotal: raw.orderTotal ?? undefined,
    purchasedAt: raw.purchasedAt ?? undefined,
    items,
  };
}

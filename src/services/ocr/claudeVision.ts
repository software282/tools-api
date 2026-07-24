import type { Vendor } from '@prisma/client';
import { getClaude, RECEIPT_MODEL } from '../../lib/claude.js';
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

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function buildPrompt(vendor: Vendor): string {
  const hint = VENDOR_HINTS[vendor] ?? 'an FTC robotics parts vendor';
  return [
    `This is a purchase receipt or order confirmation from ${hint}`,
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
function extractJson(text: string): unknown {
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

/**
 * Read a receipt image with Claude vision and return structured line items.
 * `contentType` must be a Claude-supported image type; PDFs/HEIC are rejected
 * (the pipeline handles converting or skipping those).
 */
export async function parseWithClaude(
  buffer: Buffer,
  contentType: string,
  vendor: Vendor,
): Promise<ParsedReceipt> {
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Claude vision does not support content type "${contentType}"`);
  }

  const client = getClaude();
  const response = await client.messages.create({
    model: RECEIPT_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: buffer.toString('base64'),
            },
          },
          { type: 'text', text: buildPrompt(vendor) },
        ],
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  const parsed = extractJson(raw) as RawClaudeReceipt;

  const items = (parsed.items ?? [])
    .filter((i) => i && (i.name ?? '').trim().length > 0)
    .map((i) => ({
      sku: i.sku ?? undefined,
      name: (i.name ?? '').trim(),
      quantity: i.quantity && i.quantity > 0 ? Math.round(i.quantity) : 1,
      unitPrice: i.unitPrice ?? undefined,
      lineTotal: i.lineTotal ?? undefined,
    }));

  return {
    vendor,
    orderTotal: parsed.orderTotal ?? undefined,
    purchasedAt: parsed.purchasedAt ?? undefined,
    items,
  };
}

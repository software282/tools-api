import { z } from 'zod';

export const vendorSchema = z.enum([
  'GOBILDA',
  'REV',
  'AXON',
  'FERRA',
  'MELONBOTICS',
  'OFFSET',
  'MATA',
  'UXCELL',
  'OTHER',
]);

export const receiptStatusSchema = z.enum(['PROCESSING', 'PARSED', 'CONFIRMED', 'FAILED']);
export const ocrMethodSchema = z.enum(['TESSERACT', 'CLAUDE', 'HYBRID']);

const matchedPartSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    sku: z.string().nullable(),
    manufacturer: z.string(),
  })
  .nullable();

export const lineItemSchema = z.object({
  id: z.string(),
  rawText: z.string().nullable(),
  parsedName: z.string(),
  parsedSku: z.string().nullable(),
  quantity: z.number().int(),
  unitPrice: z.number().nullable(),
  lineTotal: z.number().nullable(),
  matchConfidence: z.number(),
  applied: z.boolean(),
  matchedPart: matchedPartSummary,
});

export const receiptSchema = z.object({
  id: z.string(),
  vendor: vendorSchema,
  status: receiptStatusSchema,
  method: ocrMethodSchema.nullable(),
  imageUrl: z.string().nullable(),
  orderTotal: z.number().nullable(),
  purchasedAt: z.string().nullable(),
  createdAt: z.string(),
  lineItems: z.array(lineItemSchema),
});

export const receiptListItemSchema = receiptSchema.omit({ lineItems: true }).extend({
  lineItemCount: z.number().int(),
});

export const updateLineBody = z.object({
  matchedPartId: z.string().nullable().optional(),
  quantity: z.number().int().min(0).optional(),
  parsedName: z.string().min(1).max(200).optional(),
  parsedSku: z.string().max(120).nullable().optional(),
});

export const confirmBody = z.object({
  // If omitted, all matched, not-yet-applied lines are applied.
  lineItemIds: z.array(z.string()).optional(),
});

export const confirmResult = z.object({
  receipt: receiptSchema,
  appliedCount: z.number().int(),
  skipped: z.array(z.object({ lineItemId: z.string(), reason: z.string() })),
});

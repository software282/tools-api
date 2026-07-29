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

export const extractionMethodSchema = z.enum([
  'PASTED_TEXT',
  'PASTED_HTML',
  'PDF_TEXT',
  'TESSERACT',
  'CLAUDE_TEXT',
  'CLAUDE_VISION',
]);

/**
 * Paste an order confirmation. This is the primary way receipts arrive: nearly
 * all FTC orders are placed online, so the text is already exact.
 */
export const textReceiptBody = z.object({
  vendor: vendorSchema,
  /** The pasted confirmation. Plain text or an HTML email body both work. */
  text: z.string().min(20, 'Paste the full order confirmation').max(200_000),
  /**
   * Leave unset to detect HTML automatically, which is almost always right.
   * Set explicitly only to force one reading of ambiguous content.
   */
  format: z.enum(['auto', 'text', 'html']).default('auto'),
});

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
  method: extractionMethodSchema.nullable(),
  /** Storage URL of an uploaded file. Null for pasted text (the common case). */
  fileUrl: z.string().nullable(),
  orderTotal: z.number().nullable(),
  purchasedAt: z.string().nullable(),
  createdAt: z.string(),
  lineItems: z.array(lineItemSchema),
});

export const receiptListItemSchema = receiptSchema.omit({ lineItems: true }).extend({
  lineItemCount: z.number().int(),
});

export const receiptListQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const paginatedReceipts = z.object({
  items: z.array(receiptListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
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

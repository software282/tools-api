import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Prisma, Vendor } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env, supabaseStorageEnabled } from '../../config/env.js';
import {
  createSignedReceiptUrl,
  SIGNED_URL_TTL_SECONDS,
  uploadReceiptFile,
} from '../../lib/supabase.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { visibilityFilter } from '../parts/service.js';
import { runReceiptExtraction } from '../../services/ocr/pipeline.js';
import { looksLikeHtml } from '../../services/ocr/textExtract.js';
import type { ExtractionResult, ReceiptInput } from '../../services/ocr/types.js';
import { matchLineItems } from '../../services/partMatch.js';
import {
  confirmBody,
  confirmResult,
  lineItemSchema,
  paginatedReceipts,
  receiptListQuery,
  receiptSchema,
  signedFileResponse,
  textReceiptBody,
  updateLineBody,
} from './schemas.js';
import { receiptLineInclude, serializeLine, serializeReceipt } from './serialize.js';

const VENDORS: Vendor[] = [
  'GOBILDA',
  'REV',
  'AXON',
  'FERRA',
  'MELONBOTICS',
  'OFFSET',
  'MATA',
  'UXCELL',
  'OTHER',
];

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const PDF_TYPE = 'application/pdf';

const fullInclude = { lineItems: { include: receiptLineInclude } } satisfies Prisma.ReceiptInclude;

/**
 * Intake is the most expensive work the service does: PDF text extraction, OCR,
 * and possibly a Claude call, all synchronous. The global limit is far too loose
 * to protect it — an unmetered loop here burns API spend, not just CPU.
 */
const receiptRateLimit = {
  rateLimit: { max: env.RATE_LIMIT_RECEIPT_MAX, timeWindow: '1 minute' },
};

/**
 * Persist an extraction result against a receipt row and match its line items.
 *
 * Shared by the paste and upload routes: once text has been turned into line
 * items the source no longer matters, so the storage and matching steps are
 * identical. Marks the receipt FAILED and rethrows if anything goes wrong.
 */
async function storeExtraction(params: {
  receiptId: string;
  teamId: string;
  vendor: Vendor;
  extraction: ExtractionResult;
}) {
  const { receiptId, teamId, vendor, extraction } = params;

  const matched = await matchLineItems(extraction.parsed.items, vendor, teamId);

  await prisma.$transaction([
    prisma.receipt.update({
      where: { id: receiptId },
      data: {
        status: 'PARSED',
        method: extraction.method,
        rawText: extraction.rawText,
        parsedJson: {
          textConfidence: extraction.textConfidence ?? null,
          usedClaude: extraction.usedClaude,
          vendor,
        } as Prisma.InputJsonValue,
        orderTotal: extraction.parsed.orderTotal ?? null,
        purchasedAt: extraction.parsed.purchasedAt
          ? new Date(extraction.parsed.purchasedAt)
          : null,
      },
    }),
    ...matched.map((line) =>
      prisma.receiptLineItem.create({
        data: {
          receiptId,
          rawText: line.rawText ?? null,
          parsedName: line.name,
          parsedSku: line.sku ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          lineTotal: line.lineTotal ?? null,
          matchConfidence: line.matchConfidence,
          matchedPartId: line.matchedPartId,
        },
      }),
    ),
  ]);
}

/**
 * Extract, store, and mark the receipt FAILED if anything goes wrong.
 *
 * AppErrors from the pipeline are already worded for the user (for example a
 * scanned PDF that needs to be sent as an image), so they pass through intact.
 * Anything else is reported generically rather than leaking internals.
 */
async function ingest(params: {
  log: FastifyBaseLogger;
  receiptId: string;
  teamId: string;
  vendor: Vendor;
  input: ReceiptInput;
}) {
  try {
    const extraction = await runReceiptExtraction(params.input);
    await storeExtraction({
      receiptId: params.receiptId,
      teamId: params.teamId,
      vendor: params.vendor,
      extraction,
    });
  } catch (err) {
    params.log.error({ err }, 'receipt extraction failed');
    await prisma.receipt.update({
      where: { id: params.receiptId },
      data: { status: 'FAILED' },
    });
    if (err instanceof AppError) throw err;
    throw badRequest('Could not read this receipt.', 'EXTRACTION_FAILED');
  }
}

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      config: receiptRateLimit,
      schema: {
        tags: ['receipts'],
        summary: 'Paste an order confirmation (the usual way to add a receipt)',
        description:
          'Send the text of an order confirmation email or web receipt. Plain text and HTML email bodies both work — HTML is detected automatically. Nothing is deciphered here: the characters are already exact, so no OCR and normally no model call is involved. Returns the parsed receipt with matched parts for review; call /confirm to apply it to inventory.',
        security: [{ bearerAuth: [] }],
        body: textReceiptBody,
        response: { 201: receiptSchema },
      },
    },
    async (req, reply) => {
      const teamId = req.auth!.teamId!;
      const { vendor, text, format } = req.body;

      const treatAsHtml = format === 'html' || (format === 'auto' && looksLikeHtml(text));
      const input: ReceiptInput = treatAsHtml
        ? { kind: 'html', html: text, vendor }
        : { kind: 'text', text, vendor };

      const receipt = await prisma.receipt.create({
        data: {
          teamId,
          uploadedByUserId: req.auth!.sub,
          vendor,
          // Pasted text has no stored file.
          filePath: null,
          status: 'PROCESSING',
        },
      });

      await ingest({ log: req.log, receiptId: receipt.id, teamId, vendor, input });

      const full = await prisma.receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: fullInclude,
      });
      return reply.status(201).send(serializeReceipt(full));
    },
  );

  r.post(
    '/upload',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      config: receiptRateLimit,
      schema: {
        tags: ['receipts'],
        summary: 'Upload a receipt file — a digital PDF invoice, or a photo of a paper receipt',
        description:
          "multipart/form-data with fields `vendor` and `file`. A PDF is read from its text layer, so a downloaded invoice needs no OCR. An image (jpg/png/webp/gif) is OCR'd, falling back to Claude vision only when that is not good enough — this is the physical-receipt path. For an emailed confirmation prefer POST /receipts, which is exact and cheaper.",
        consumes: ['multipart/form-data'],
        security: [{ bearerAuth: [] }],
        response: { 201: receiptSchema },
      },
    },
    async (req, reply) => {
      const teamId = req.auth!.teamId!;

      // Manually parse the multipart body (file + vendor field).
      let vendor: Vendor | null = null;
      let fileBuffer: Buffer | null = null;
      let contentType = '';
      let filename: string | undefined;

      for await (const part of req.parts()) {
        if (part.type === 'file' && part.fieldname === 'file') {
          fileBuffer = await part.toBuffer();
          contentType = part.mimetype;
          filename = part.filename;
        } else if (part.type === 'field' && part.fieldname === 'vendor') {
          const value = String(part.value).toUpperCase();
          if (VENDORS.includes(value as Vendor)) vendor = value as Vendor;
        }
      }

      if (!vendor) throw badRequest('A valid `vendor` field is required', 'INVALID_VENDOR');
      if (!fileBuffer) throw badRequest('A receipt `file` is required', 'NO_FILE');

      const isPdf = contentType === PDF_TYPE;
      if (!isPdf && !IMAGE_TYPES.has(contentType)) {
        throw badRequest(
          `Unsupported file type "${contentType}". Upload a PDF invoice or a jpg/png/webp image.`,
          'UNSUPPORTED_FILE_TYPE',
        );
      }

      // Keep the original for auditing, but never block reading on storage.
      let filePath: string | null = null;
      if (supabaseStorageEnabled) {
        try {
          const uploaded = await uploadReceiptFile({
            teamId,
            buffer: fileBuffer,
            contentType,
            originalName: filename,
          });
          filePath = uploaded.path;
        } catch (err) {
          req.log.warn({ err }, 'receipt file upload failed; continuing with extraction only');
        }
      }

      const receipt = await prisma.receipt.create({
        data: { teamId, uploadedByUserId: req.auth!.sub, vendor, filePath, status: 'PROCESSING' },
      });

      const input: ReceiptInput = isPdf
        ? { kind: 'pdf', buffer: fileBuffer, vendor }
        : { kind: 'image', buffer: fileBuffer, contentType, vendor };

      await ingest({ log: req.log, receiptId: receipt.id, teamId, vendor, input });

      const full = await prisma.receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: fullInclude,
      });
      return reply.status(201).send(serializeReceipt(full));
    },
  );

  r.get(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['receipts'],
        summary: "List your team's uploaded receipts, newest first",
        security: [{ bearerAuth: [] }],
        querystring: receiptListQuery,
        response: { 200: paginatedReceipts },
      },
    },
    async (req) => {
      const { page, pageSize } = req.query;
      const where = { teamId: req.auth!.teamId! };

      const [rows, total] = await Promise.all([
        prisma.receipt.findMany({
          where,
          include: { _count: { select: { lineItems: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.receipt.count({ where }),
      ]);

      return {
        items: rows.map((row) => ({
          id: row.id,
          vendor: row.vendor,
          status: row.status,
          method: row.method,
          hasFile: row.filePath !== null,
          orderTotal: row.orderTotal === null ? null : Number(row.orderTotal),
          purchasedAt: row.purchasedAt ? row.purchasedAt.toISOString() : null,
          createdAt: row.createdAt.toISOString(),
          lineItemCount: row._count.lineItems,
        })),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  r.get(
    '/:id',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['receipts'],
        summary: 'Get a receipt with its parsed line items',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: receiptSchema },
      },
    },
    async (req) => {
      const receipt = await prisma.receipt.findFirst({
        where: { id: req.params.id, teamId: req.auth!.teamId! },
        include: fullInclude,
      });
      if (!receipt) throw notFound('Receipt not found');
      return serializeReceipt(receipt);
    },
  );

  r.get(
    '/:id/file',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['receipts'],
        summary: 'Get a short-lived link to a receipt\'s original file',
        description:
          'The receipts bucket is private, because order confirmations routinely carry a name and shipping address. There is therefore no durable URL to embed: call this when `hasFile` is true and use the returned link, which expires. Returns JSON rather than a redirect so the URL can go straight into an <img> or <a>, which cannot send an Authorization header.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: signedFileResponse },
      },
    },
    async (req) => {
      // Scoped to the caller's team, so access follows current membership
      // rather than whoever happens to hold an old link.
      const receipt = await prisma.receipt.findFirst({
        where: { id: req.params.id, teamId: req.auth!.teamId! },
        select: { filePath: true },
      });
      if (!receipt) throw notFound('Receipt not found');
      if (!receipt.filePath) {
        throw notFound('This receipt has no stored file', 'NO_RECEIPT_FILE');
      }

      try {
        return {
          url: await createSignedReceiptUrl(receipt.filePath),
          expiresIn: SIGNED_URL_TTL_SECONDS,
        };
      } catch (err) {
        req.log.error({ err }, 'failed to sign receipt file URL');
        throw badRequest('Could not produce a link for this file', 'SIGN_FAILED');
      }
    },
  );

  r.patch(
    '/:id/lines/:lineId',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['receipts'],
        summary: 'Correct a parsed line item (fix the matched part, quantity, or name)',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string(), lineId: z.string() }),
        body: updateLineBody,
        response: { 200: lineItemSchema },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      const line = await prisma.receiptLineItem.findFirst({
        where: { id: req.params.lineId, receipt: { id: req.params.id, teamId } },
      });
      if (!line) throw notFound('Line item not found');

      const data: Prisma.ReceiptLineItemUpdateInput = {};
      if (req.body.quantity !== undefined) data.quantity = req.body.quantity;
      if (req.body.parsedName !== undefined) data.parsedName = req.body.parsedName;
      if (req.body.parsedSku !== undefined) data.parsedSku = req.body.parsedSku;

      if (req.body.matchedPartId !== undefined) {
        if (req.body.matchedPartId === null) {
          data.matchedPart = { disconnect: true };
          data.matchConfidence = 0;
        } else {
          // Validate the chosen part is visible to this team.
          const part = await prisma.part.findFirst({
            where: { AND: [{ id: req.body.matchedPartId }, visibilityFilter(teamId)] },
          });
          if (!part) throw badRequest('Chosen part is not available to your team', 'PART_NOT_VISIBLE');
          data.matchedPart = { connect: { id: part.id } };
          data.matchConfidence = 1; // manual match is authoritative
        }
      }

      const updated = await prisma.receiptLineItem.update({
        where: { id: line.id },
        data,
        include: receiptLineInclude,
      });
      return serializeLine(updated);
    },
  );

  r.post(
    '/:id/confirm',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['receipts'],
        summary: 'Apply matched line items to your team inventory',
        description:
          'Adds each matched line item\'s quantity to inventory. Lines without a matched part are skipped and reported. Idempotent per line via the `applied` flag.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: confirmBody,
        response: { 200: confirmResult },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      const receipt = await prisma.receipt.findFirst({
        where: { id: req.params.id, teamId },
        include: fullInclude,
      });
      if (!receipt) throw notFound('Receipt not found');

      const requested = req.body.lineItemIds;
      const skipped: Array<{ lineItemId: string; reason: string }> = [];
      let appliedCount = 0;

      await prisma.$transaction(async (tx) => {
        for (const line of receipt.lineItems) {
          if (requested && !requested.includes(line.id)) continue;
          if (line.applied) {
            skipped.push({ lineItemId: line.id, reason: 'already applied' });
            continue;
          }
          if (!line.matchedPartId) {
            skipped.push({ lineItemId: line.id, reason: 'no matched part' });
            continue;
          }

          await tx.inventoryItem.upsert({
            where: { teamId_partId: { teamId, partId: line.matchedPartId } },
            create: { teamId, partId: line.matchedPartId, quantity: line.quantity },
            update: { quantity: { increment: line.quantity } },
          });
          await tx.receiptLineItem.update({ where: { id: line.id }, data: { applied: true } });
          appliedCount++;
        }

        await tx.receipt.update({ where: { id: receipt.id }, data: { status: 'CONFIRMED' } });
      });

      const full = await prisma.receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: fullInclude,
      });
      return { receipt: serializeReceipt(full), appliedCount, skipped };
    },
  );
};

export default routes;

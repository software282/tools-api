import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Prisma, Vendor } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { supabaseStorageEnabled } from '../../config/env.js';
import { uploadReceiptImage } from '../../lib/supabase.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { visibilityFilter } from '../parts/service.js';
import { runReceiptOcr } from '../../services/ocr/pipeline.js';
import { matchLineItems } from '../../services/partMatch.js';
import {
  confirmBody,
  confirmResult,
  lineItemSchema,
  receiptListItemSchema,
  receiptSchema,
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

const fullInclude = { lineItems: { include: receiptLineInclude } } satisfies Prisma.ReceiptInclude;

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['receipts'],
        summary: 'Upload a receipt image; runs hybrid OCR and matches line items to parts',
        description:
          'multipart/form-data with fields `vendor` (one of the Vendor enum values) and `file` (the receipt image: jpg/png/webp). Returns the parsed receipt with matched parts for review, then call /confirm to apply to inventory.',
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
      if (!fileBuffer) throw badRequest('A receipt image `file` is required', 'NO_FILE');

      // Persist the image if storage is configured (best-effort; OCR still runs otherwise).
      let imageUrl: string | null = null;
      if (supabaseStorageEnabled) {
        try {
          const uploaded = await uploadReceiptImage({
            teamId,
            buffer: fileBuffer,
            contentType,
            originalName: filename,
          });
          imageUrl = uploaded.url;
        } catch (err) {
          req.log.warn({ err }, 'receipt image upload failed; continuing with OCR only');
        }
      }

      const receipt = await prisma.receipt.create({
        data: {
          teamId,
          uploadedByUserId: req.auth!.sub,
          vendor,
          imageUrl,
          status: 'PROCESSING',
        },
      });

      try {
        const ocr = await runReceiptOcr({ buffer: fileBuffer, contentType, vendor });
        const matched = await matchLineItems(ocr.parsed.items, vendor, teamId);

        await prisma.$transaction([
          prisma.receipt.update({
            where: { id: receipt.id },
            data: {
              status: 'PARSED',
              method: ocr.method,
              rawText: ocr.rawText,
              parsedJson: {
                textConfidence: ocr.textConfidence ?? null,
                usedClaude: ocr.usedClaude,
                vendor,
              } as Prisma.InputJsonValue,
              orderTotal: ocr.parsed.orderTotal ?? null,
              purchasedAt: ocr.parsed.purchasedAt ? new Date(ocr.parsed.purchasedAt) : null,
            },
          }),
          ...matched.map((line) =>
            prisma.receiptLineItem.create({
              data: {
                receiptId: receipt.id,
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
      } catch (err) {
        req.log.error({ err }, 'receipt OCR failed');
        await prisma.receipt.update({ where: { id: receipt.id }, data: { status: 'FAILED' } });
        throw badRequest('Failed to read the receipt. Try a clearer image.', 'OCR_FAILED');
      }

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
        summary: "List your team's uploaded receipts",
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(receiptListItemSchema) },
      },
    },
    async (req) => {
      const rows = await prisma.receipt.findMany({
        where: { teamId: req.auth!.teamId! },
        include: { _count: { select: { lineItems: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => ({
        id: row.id,
        vendor: row.vendor,
        status: row.status,
        method: row.method,
        imageUrl: row.imageUrl,
        orderTotal: row.orderTotal === null ? null : Number(row.orderTotal),
        purchasedAt: row.purchasedAt ? row.purchasedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
        lineItemCount: row._count.lineItems,
      }));
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

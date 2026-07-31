import type { Prisma } from '@prisma/client';

const lineInclude = {
  matchedPart: { include: { manufacturer: { select: { name: true } } } },
} satisfies Prisma.ReceiptLineItemInclude;

export type ReceiptWithLines = Prisma.ReceiptGetPayload<{
  include: { lineItems: { include: typeof lineInclude } };
}>;

const dec = (d: Prisma.Decimal | null): number | null => (d === null ? null : Number(d));

export function serializeLine(
  line: Prisma.ReceiptLineItemGetPayload<{ include: typeof lineInclude }>,
) {
  return {
    id: line.id,
    rawText: line.rawText,
    parsedName: line.parsedName,
    parsedSku: line.parsedSku,
    quantity: line.quantity,
    unitPrice: dec(line.unitPrice),
    lineTotal: dec(line.lineTotal),
    matchConfidence: line.matchConfidence,
    applied: line.applied,
    matchedPart: line.matchedPart
      ? {
          id: line.matchedPart.id,
          name: line.matchedPart.name,
          sku: line.matchedPart.sku,
          manufacturer: line.matchedPart.manufacturer.name,
        }
      : null,
  };
}

export function serializeReceipt(receipt: ReceiptWithLines) {
  return {
    id: receipt.id,
    vendor: receipt.vendor,
    status: receipt.status,
    method: receipt.method,
    // Never the path itself: it is an internal storage location, and a signed
    // link is minted per request via GET /receipts/:id/file.
    hasFile: receipt.filePath !== null,
    orderTotal: dec(receipt.orderTotal),
    purchasedAt: receipt.purchasedAt ? receipt.purchasedAt.toISOString() : null,
    createdAt: receipt.createdAt.toISOString(),
    lineItems: receipt.lineItems.map(serializeLine),
  };
}

export const receiptLineInclude = lineInclude;

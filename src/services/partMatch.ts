import type { Prisma, Vendor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { visibilityFilter } from '../modules/parts/service.js';
import type { ParsedLineItem } from './ocr/types.js';
import { AMBIGUITY_MARGIN, NAME_MATCH_FLOOR, pickBestNameMatch, similarity } from './nameMatch.js';
import type { NameCandidate } from './nameMatch.js';

export { AMBIGUITY_MARGIN, NAME_MATCH_FLOOR, pickBestNameMatch, similarity };
export type { NameCandidate };

export interface MatchedLine extends ParsedLineItem {
  matchedPartId: string | null;
  matchConfidence: number; // 0-1
}

/**
 * Match parsed receipt line items to parts visible to the team.
 *  - Exact SKU match wins (confidence 1.0).
 *  - Otherwise the best fuzzy name match within the vendor's manufacturer, but
 *    only when it clears NAME_MATCH_FLOOR *and* beats the runner-up by
 *    AMBIGUITY_MARGIN.
 */
export async function matchLineItems(
  items: ParsedLineItem[],
  vendor: Vendor,
  teamId: string,
): Promise<MatchedLine[]> {
  const visible = visibilityFilter(teamId);

  // Candidate pool: parts from the manufacturer(s) mapped to this vendor.
  const manufacturers = await prisma.manufacturer.findMany({ where: { vendor } });
  const manufacturerIds = manufacturers.map((m) => m.id);

  const candidateWhere: Prisma.PartWhereInput = {
    AND: [visible, manufacturerIds.length ? { manufacturerId: { in: manufacturerIds } } : {}],
  };
  const candidates = await prisma.part.findMany({
    where: candidateWhere,
    select: { id: true, name: true, sku: true },
  });

  const results: MatchedLine[] = [];
  for (const item of items) {
    let matchedPartId: string | null = null;
    let confidence = 0;

    // 1. Exact SKU match (case-insensitive) against visible parts.
    if (item.sku) {
      const skuNorm = item.sku.toLowerCase();
      const exact = candidates.find((c) => c.sku && c.sku.toLowerCase() === skuNorm);
      const exactGlobal =
        exact ??
        (await prisma.part.findFirst({
          where: { AND: [visible, { sku: { equals: item.sku, mode: 'insensitive' } }] },
          select: { id: true, name: true, sku: true },
        }));
      if (exactGlobal) {
        matchedPartId = exactGlobal.id;
        confidence = 1;
      }
    }

    // 2. Fuzzy name match within the vendor's manufacturer candidates.
    if (!matchedPartId) {
      const match = pickBestNameMatch(item.name, candidates);
      if (match) {
        matchedPartId = match.id;
        confidence = match.confidence;
      }
    }

    results.push({ ...item, matchedPartId, matchConfidence: confidence });
  }

  return results;
}

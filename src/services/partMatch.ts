import type { Prisma, Vendor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { visibilityFilter } from '../modules/parts/service.js';
import type { ParsedLineItem } from './ocr/types.js';

export interface MatchedLine extends ParsedLineItem {
  matchedPartId: string | null;
  matchConfidence: number; // 0-1
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((t) => t.length > 1));
}

/** Jaccard similarity of the word sets of two strings (0-1). */
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Match parsed receipt line items to parts visible to the team.
 *  - Exact SKU match wins (confidence 1.0).
 *  - Otherwise fuzzy name match within the vendor's manufacturer (best Jaccard
 *    over ~0.3), falling back to a global name search.
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
      let best: { id: string; score: number } | null = null;
      for (const c of candidates) {
        const score = similarity(item.name, c.name);
        if (!best || score > best.score) best = { id: c.id, score };
      }
      if (best && best.score >= 0.3) {
        matchedPartId = best.id;
        confidence = Number(best.score.toFixed(2));
      }
    }

    results.push({ ...item, matchedPartId, matchConfidence: confidence });
  }

  return results;
}

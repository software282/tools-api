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
export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Minimum Jaccard score before a name match is considered at all. */
export const NAME_MATCH_FLOOR = 0.3;

/**
 * How far ahead of the runner-up the best candidate must be.
 *
 * Vendor part names are frequently near-duplicates that differ only in the spec
 * that matters — two goBILDA Yellow Jacket motors identical but for "19.2:1" vs
 * "26.9:1" score ~0.9 against each other. Picking the higher score in that
 * situation is a coin flip that silently writes the wrong part into inventory,
 * so an ambiguous match is reported as no match and left for the user to resolve
 * via PATCH /receipts/:id/lines/:lineId.
 */
export const AMBIGUITY_MARGIN = 0.05;

export interface NameCandidate {
  id: string;
  name: string;
}

/**
 * Pick the single best name match, or null when there isn't a clear winner.
 *
 * Pure and exported so the ambiguity rule can be tested directly, without a
 * database or a receipt.
 */
export function pickBestNameMatch(
  name: string,
  candidates: NameCandidate[],
): { id: string; confidence: number } | null {
  let best: { id: string; score: number } | null = null;
  let runnerUp = 0;

  for (const candidate of candidates) {
    const score = similarity(name, candidate.name);
    if (!best || score > best.score) {
      runnerUp = best ? best.score : runnerUp;
      best = { id: candidate.id, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  if (!best) return null;
  if (best.score < NAME_MATCH_FLOOR) return null;
  if (best.score - runnerUp < AMBIGUITY_MARGIN) return null;

  return { id: best.id, confidence: Number(best.score.toFixed(2)) };
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

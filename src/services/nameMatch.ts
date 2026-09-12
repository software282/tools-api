/**
 * Pure fuzzy name-matching logic, split out of partMatch.ts so it can be
 * reused (e.g. by prisma/seed.ts's cross-catalog dedup) without pulling in
 * that file's `matchLineItems`, which touches the database (a second
 * PrismaClient instance is exactly the kind of thing a one-off script
 * shouldn't accidentally open against a connection-limited pooler).
 */
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

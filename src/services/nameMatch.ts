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

/** Every standalone number in a string, normalized (so "6.0" and "6" agree). */
function extractNumbers(s: string): string[] {
  return (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(parseFloat(n)));
}

/**
 * Whether two part names carry the exact same multiset of numbers — bore
 * size, tooth count, gear ratio, RPM, length, whatever the spec is.
 *
 * Word-overlap similarity alone cannot tell "...280mm Pitch Length, 140
 * Tooth" from "...184mm Pitch Length, 92 Tooth": every other word is
 * identical, so two genuinely different SKUs (different belt lengths) score
 * as a near-perfect match. `pickBestNameMatch`'s AMBIGUITY_MARGIN guards
 * against picking the *wrong one* among several close candidates, but does
 * nothing when only one such variant happens to be in the candidate pool —
 * there's no ambiguity to detect, just a wrong match. Catalog dedup (unlike
 * interactive receipt-line matching, where a human can correct a bad match)
 * needs this stronger, mandatory second gate before ever treating a name
 * match as a true duplicate rather than a different-spec sibling.
 */
export function sameNumericSpec(a: string, b: string): boolean {
  const na = extractNumbers(a).sort();
  const nb = extractNumbers(b).sort();
  if (na.length !== nb.length) return false;
  return na.every((n, i) => n === nb[i]);
}

// Words that mark a materially different (separately orderable) variant even
// when every number in the name matches — e.g. "Premium N20 Gear Motor
// (10:1 Ratio, 2600 RPM, with Encoder)" vs "...(10:1 Ratio, 2600 RPM)" is a
// real encoder/no-encoder SKU pair, not a naming quirk of the same part.
// Every entry here was found the same way: a real pair from this catalog
// that scored as a near-duplicate on word overlap despite being genuinely
// different SKUs — color (disc wheels, banana plugs), rotation direction
// (servo "Stock" vs "Increased Rotation"), and duty/size class (servo horns,
// servo savers) round out encoder/male/female as the next-largest patterns.
const DISTINGUISHING_QUALIFIERS = [
  'encoder',
  'male',
  'female',
  'stock rotation',
  'increased rotation',
  'black',
  'blue',
  'red',
  'orange',
  'yellow',
  'green',
  'clear',
  'silver',
  'gold',
  'heavy duty',
  'standard duty',
  'super-duty',
  'giant scale',
];

/** Whether two names agree on which of DISTINGUISHING_QUALIFIERS each contains. */
export function sameQualifiers(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return DISTINGUISHING_QUALIFIERS.every((word) => la.includes(word) === lb.includes(word));
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

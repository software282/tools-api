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

// Generic connective words that never distinguish one part from another, so
// they're dropped entirely rather than compared. Deliberately excludes
// articles ("a", "an", "the"): this catalog uses a bare trailing letter as a
// real, distinct model suffix — "Gear Motor Input Board A" vs "...Board B"
// vs "...Board D" are three different boards, not one board named three
// ways — so a stray "a" has to count as a real word, not get discarded as
// an article the way it would in ordinary prose.
const FILLER_WORDS = new Set([
  'with', 'to', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'by',
  'series', 'kit', 'kits', 'pack', 'set',
]);

/**
 * Word-frequency map of a name, skipping filler words and bare numbers.
 * Numbers are excluded here on purpose — `sameNumericSpec` above already
 * owns number comparison (it extracts and sorts every number in the string,
 * order-independent); duplicating that logic here with a different scheme
 * ("does this token look like a whole number") would just be two subtly
 * different definitions of "the same number" fighting each other.
 */
function wordCounts(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const word of normalize(s).split(' ')) {
    if (!word || FILLER_WORDS.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return counts;
}

/**
 * Whether two names agree on every non-filler, non-numeric word *and* its
 * exact count — not just which words are present.
 *
 * The count matters, not just presence: "Female / Female to Male JST
 * Y-Extension" and "Male / Male to Female JST Y-Extension" both contain
 * both words, so a presence-only check ("does each name contain 'male'? does
 * each contain 'female'?") sees them as identical — the actual difference is
 * that one says "Female" twice and "Male" once, the other the reverse
 * (opposite-gender cable ends, i.e. two different, incompatible products).
 * Counting words catches that, along with everything a fixed list of "known
 * distinguishing words" (encoder, color, duty class, rotation direction, ...)
 * caught before, *and* words no fixed list could ever enumerate in advance —
 * a differing proper name ("Whippersnapper Runt Rover™" vs "Junior Runt
 * Rover™", four separately-named kits in this catalog that all scored as a
 * match against one another before this fix) blocks a merge the same way a
 * spec word does, with no need to know in advance that "Whippersnapper" was
 * ever going to show up in a product name.
 */
export function sameQualifiers(a: string, b: string): boolean {
  const ca = wordCounts(a);
  const cb = wordCounts(b);
  if (ca.size !== cb.size) return false;
  for (const [word, count] of ca) if (cb.get(word) !== count) return false;
  return true;
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

import { describe, expect, it } from 'vitest';
import {
  AMBIGUITY_MARGIN,
  NAME_MATCH_FLOOR,
  pickBestNameMatch,
  similarity,
} from '../src/services/partMatch.js';

// Real goBILDA naming: identical but for the gear ratio and RPM, which is exactly
// the pair a word-overlap score cannot tell apart.
const YJ_19 =
  '5203 Series Yellow Jacket Planetary Gear Motor (19.2:1 Ratio, 24mm Length 8mm REX Shaft, 312 RPM)';
const YJ_26 =
  '5203 Series Yellow Jacket Planetary Gear Motor (26.9:1 Ratio, 24mm Length 8mm REX Shaft, 223 RPM)';

describe('similarity', () => {
  it('is 1 for identical strings and ignores case and punctuation', () => {
    expect(similarity('8mm REX Shaft', '8mm rex shaft')).toBe(1);
    expect(similarity('Aluminum REX Shaft - 8mm', 'aluminum rex shaft 8mm')).toBe(1);
  });

  it('is 0 when either side has no usable tokens', () => {
    expect(similarity('', 'anything')).toBe(0);
    expect(similarity('!!! ??', 'anything')).toBe(0);
  });

  it('scores unrelated parts below the match floor', () => {
    expect(similarity('Yellow Jacket Planetary Gear Motor', 'Nylon Spacer 6mm')).toBeLessThan(
      NAME_MATCH_FLOOR,
    );
  });
});

describe('pickBestNameMatch', () => {
  const candidates = [
    { id: 'yj-19', name: YJ_19 },
    { id: 'yj-26', name: YJ_26 },
    { id: 'spacer', name: 'Nylon Spacer 6mm Length 8mm REX Bore' },
  ];

  it('returns null when there are no candidates', () => {
    expect(pickBestNameMatch(YJ_19, [])).toBeNull();
  });

  it('picks the exact match over its near-duplicate sibling', () => {
    const match = pickBestNameMatch(YJ_19, candidates);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('yj-19');
    expect(match!.confidence).toBe(1);
  });

  // The regression this guards: with only a "highest score wins" rule, a receipt
  // line missing the ratio matched whichever motor the database returned first,
  // silently writing the wrong part into inventory at high reported confidence.
  it('refuses to guess between two candidates that score the same', () => {
    const ambiguous = '5203 Series Yellow Jacket Planetary Gear Motor';

    const scores = candidates.map((c) => similarity(ambiguous, c.name));
    const sorted = [...scores].sort((a, b) => b - a);
    expect(sorted[0] - sorted[1]).toBeLessThan(AMBIGUITY_MARGIN);

    expect(pickBestNameMatch(ambiguous, candidates)).toBeNull();
  });

  it('returns null when nothing clears the match floor', () => {
    expect(pickBestNameMatch('Sealed Ball Bearing 1/4in', candidates)).toBeNull();
  });

  it('reports confidence rounded to two decimals', () => {
    const match = pickBestNameMatch('Nylon Spacer 6mm', candidates);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('spacer');
    expect(match!.confidence).toBe(Number(match!.confidence.toFixed(2)));
    expect(match!.confidence).toBeGreaterThanOrEqual(NAME_MATCH_FLOOR);
  });
});

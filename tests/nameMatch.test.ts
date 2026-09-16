import { describe, expect, it } from 'vitest';
import { sameNumericSpec, sameQualifiers } from '../src/services/nameMatch.js';

describe('sameNumericSpec', () => {
  it('rejects real ServoCity/goBILDA catalog names that differ only by spec number', () => {
    // Found via prisma/seed.ts's cross-catalog dedup: these previously scored
    // ~0.7-0.9 on word-overlap similarity alone and were wrongly auto-skipped
    // as duplicates.
    expect(
      sameNumericSpec(
        '2mm Pitch GT2 Timing Belt (6mm Width, 280mm Pitch Length, 140 Tooth)',
        '2mm Pitch GT2 Timing Belt (6mm Width, 184mm Pitch Length, 92 Tooth)',
      ),
    ).toBe(false);
    expect(
      sameNumericSpec(
        'Premium N20 Gear Motor (250:1 Ratio, 110 RPM, with Encoder)',
        'Premium N20 Gear Motor (298:1 Ratio, 90 RPM, with Encoder)',
      ),
    ).toBe(false);
    expect(
      sameNumericSpec(
        'GripForce Gecko™ Wheel (14mm Bore, 72mm Diameter, 15A Durometer)',
        'GripForce Gecko™ Wheel (14mm Bore, 72mm Diameter, 30A Durometer)',
      ),
    ).toBe(false);
  });

  it('accepts identical numbers regardless of order or surrounding words', () => {
    expect(sameNumericSpec('8mm Bore, 24 Tooth Pulley', '24 Tooth, 8mm Bore Pulley')).toBe(true);
    expect(sameNumericSpec('Aluminum Motor Mount', 'Motor Mount (Aluminum)')).toBe(true);
  });

  it('rejects a different count of numbers even if all present numbers match', () => {
    expect(sameNumericSpec('M4 x 0.7mm Nylock Nut', 'M4 x 0.7mm Square Nut - 25 Pack')).toBe(false);
  });
});

describe('sameQualifiers', () => {
  it('rejects encoder/no-encoder variants that share every number', () => {
    // Found alongside the numeric cases above: same numbers on both sides,
    // but "with Encoder" marks a genuinely different, separately-sold SKU.
    expect(
      sameQualifiers(
        'Premium N20 Gear Motor (10:1 Ratio, 2600 RPM, with Encoder)',
        'Premium N20 Gear Motor (10:1 Ratio, 2600 RPM)',
      ),
    ).toBe(false);
    expect(
      sameQualifiers('26 RPM Premium Planetary Gear Motor', '26 RPM Premium Planetary Gear Motor w/Encoder'),
    ).toBe(false);
  });

  it('rejects Male/Female variants', () => {
    expect(sameQualifiers('8mm REX® CV Joint (Male to Female)', '8mm REX® CV Joint (Male to Male)')).toBe(false);
  });

  it('rejects opposite-gender cable ends even though each name contains both words', () => {
    // Found in prisma/data/dedup-report.md: these two matched at confidence
    // 1.0 and got silently merged — a presence-only check ("does this name
    // contain 'female'? does it contain 'male'?") is true for BOTH names on
    // BOTH words here, since each end is mentioned once on each side. Only
    // the *count* of each word reveals they're opposite, incompatible
    // connectors: "Female, Female-to-Male" vs "Male, Male-to-Female".
    expect(
      sameQualifiers(
        '3.0" Female / Female to Male JST Y-Extension',
        '3.0" Male / Male to Female JST Y-Extension',
      ),
    ).toBe(false);
  });

  it('rejects a bare trailing letter that denotes a different model/variant', () => {
    // Also from the dedup report: "Input Board B" and "Input Board D" both
    // silently merged into "Input Board A" at confidence 1.0 — three
    // different boards, not one board with three names. A single trailing
    // letter carries no digits (so sameNumericSpec can't catch it) and isn't
    // a known spec word (so the old fixed qualifier list couldn't either).
    expect(sameQualifiers('Gear Motor Input Board A', 'Gear Motor Input Board B')).toBe(false);
    expect(sameQualifiers('6-32 Hardware Pack A', '6-32 Hardware Pack B')).toBe(false);
  });

  it('rejects differing proper/product names no fixed word list could predict', () => {
    // Four separately-named kits in this catalog — Whippersnapper, Sprout,
    // Bogie, Zip, and Junior Runt Rover — all scored as matches against one
    // another on word overlap alone (dominated by the shared "Runt Rover™"),
    // and all got silently collapsed into "Junior Runt Rover™". No amount of
    // enumerating known qualifier words would have caught this in advance;
    // counting every non-filler word catches it automatically.
    expect(sameQualifiers('Whippersnapper Runt Rover™', 'Junior Runt Rover™')).toBe(false);
    expect(sameQualifiers('Sprout Runt Rover™', 'Junior Runt Rover™')).toBe(false);
  });

  it('accepts names that agree on every qualifier (including having none)', () => {
    expect(sameQualifiers('Aluminum Motor Mount', 'Motor Mount (Aluminum)')).toBe(true);
    expect(sameQualifiers('Motor with Encoder', 'Encoder Motor')).toBe(true);
  });
});

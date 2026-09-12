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

  it('accepts names that agree on every qualifier (including having none)', () => {
    expect(sameQualifiers('Aluminum Motor Mount', 'Motor Mount (Aluminum)')).toBe(true);
    expect(sameQualifiers('Motor with Encoder', 'Encoder Motor')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { isLowStock } from '../src/modules/inventory/routes.js';

/**
 * The low-stock rule is deliberately opt-in: a threshold of 0 means "not
 * tracked". Without that, every part a team has run down to zero — which is most
 * of a large inventory — would show as an alert, and the reorder list would be
 * noise rather than a thing you act on before a competition.
 */
describe('isLowStock', () => {
  it('never flags a part with no threshold set', () => {
    expect(isLowStock(0, 0)).toBe(false);
    expect(isLowStock(100, 0)).toBe(false);
  });

  it('flags stock below the threshold', () => {
    expect(isLowStock(1, 2)).toBe(true);
    expect(isLowStock(0, 1)).toBe(true);
  });

  it('does not flag stock exactly at the threshold', () => {
    // "Keep at least 2" is satisfied by holding 2.
    expect(isLowStock(2, 2)).toBe(false);
  });

  it('does not flag stock above the threshold', () => {
    expect(isLowStock(5, 2)).toBe(false);
  });

  it('treats a negative threshold as untracked rather than always-low', () => {
    expect(isLowStock(0, -1)).toBe(false);
  });
});

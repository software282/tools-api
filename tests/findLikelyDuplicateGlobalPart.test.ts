import { describe, expect, it, vi } from 'vitest';

const findManyMock = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({
  prisma: { part: { findMany: findManyMock } },
}));

const { findLikelyDuplicateGlobalPart } = await import('../src/modules/parts/service.js');

const MFR_ID = 'mfr_gobilda';

describe('findLikelyDuplicateGlobalPart', () => {
  it('returns null when the library has nothing in that manufacturer', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const result = await findLikelyDuplicateGlobalPart({ manufacturerId: MFR_ID, name: 'Bracket' });
    expect(result).toBeNull();
  });

  it('matches an exact SKU even when the name differs entirely', async () => {
    findManyMock.mockResolvedValueOnce([
      { id: 'p1', name: 'Old Listed Name', sku: '5203-2402-0019', status: 'APPROVED' },
    ]);
    const result = await findLikelyDuplicateGlobalPart({
      manufacturerId: MFR_ID,
      name: 'Something Totally Different',
      sku: '5203-2402-0019',
    });
    expect(result).toEqual({ id: 'p1', name: 'Old Listed Name', status: 'APPROVED' });
  });

  it('is case-insensitive on SKU', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 'p1', name: 'x', sku: 'REV-31-1595', status: 'PENDING' }]);
    const result = await findLikelyDuplicateGlobalPart({
      manufacturerId: MFR_ID,
      name: 'unrelated',
      sku: 'rev-31-1595',
    });
    expect(result?.id).toBe('p1');
  });

  it('falls back to a fuzzy name match when no SKU is given', async () => {
    findManyMock.mockResolvedValueOnce([
      { id: 'p1', name: '5203 Series Yellow Jacket Planetary Gear Motor (19.2:1 Ratio)', sku: null, status: 'APPROVED' },
    ]);
    const result = await findLikelyDuplicateGlobalPart({
      manufacturerId: MFR_ID,
      name: '5203 Series Yellow Jacket Planetary Gear Motor (19.2:1 Ratio)',
    });
    expect(result?.id).toBe('p1');
  });

  it('does not flag an unrelated part as a duplicate', async () => {
    findManyMock.mockResolvedValueOnce([{ id: 'p1', name: 'Nylon Spacer 6mm', sku: null, status: 'APPROVED' }]);
    const result = await findLikelyDuplicateGlobalPart({
      manufacturerId: MFR_ID,
      name: 'Yellow Jacket Planetary Gear Motor',
    });
    expect(result).toBeNull();
  });

  it('only searches within the given manufacturer', async () => {
    findManyMock.mockResolvedValueOnce([]);
    await findLikelyDuplicateGlobalPart({ manufacturerId: MFR_ID, name: 'Bracket' });
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ manufacturerId: MFR_ID, scope: 'GLOBAL' }),
      }),
    );
  });
});

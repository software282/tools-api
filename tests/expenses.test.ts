import { describe, expect, it, vi } from 'vitest';

const findManyExpenseEntryMock = vi.fn();
const findManyInventoryItemMock = vi.fn();

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    expenseEntry: { findMany: (...args: unknown[]) => findManyExpenseEntryMock(...args) },
    inventoryItem: { findMany: (...args: unknown[]) => findManyInventoryItemMock(...args) },
  },
}));

const { getTeamExpenses } = await import('../src/modules/expenses/service.js');

const MOTORS = { id: 'cat_motors', name: 'Motors', sort: 10 };
const HARDWARE = { id: 'cat_hardware', name: 'Hardware', sort: 90 };
const GOBILDA = { id: 'mfr_gobilda', name: 'goBILDA', slug: 'gobilda' };

function entry(overrides: Record<string, unknown>) {
  return {
    id: 'e_' + Math.random(),
    quantity: 1,
    unitCost: 10,
    totalCost: 10,
    source: 'RECEIPT',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    part: {
      id: 'part_1',
      name: 'Yellow Jacket Motor',
      sku: '5203-2402-0019',
      manufacturer: GOBILDA,
      category: MOTORS,
    },
    ...overrides,
  };
}

describe('getTeamExpenses', () => {
  it('returns an empty breakdown with no entries', async () => {
    findManyExpenseEntryMock.mockResolvedValueOnce([]);
    findManyInventoryItemMock.mockResolvedValueOnce([]);
    const result = await getTeamExpenses('team_1');
    expect(result).toEqual({ generatedAt: expect.any(String), grandTotal: 0, categories: [] });
  });

  it('sums quantity and cost across multiple purchases of the same part', async () => {
    findManyExpenseEntryMock.mockResolvedValueOnce([
      entry({ quantity: 2, unitCost: 10, totalCost: 20, createdAt: new Date('2026-01-01') }),
      entry({ quantity: 3, unitCost: 12, totalCost: 36, createdAt: new Date('2026-02-01') }),
    ]);
    findManyInventoryItemMock.mockResolvedValueOnce([{ partId: 'part_1', quantity: 4 }]);

    const result = await getTeamExpenses('team_1');
    expect(result.grandTotal).toBe(56);
    expect(result.categories).toHaveLength(1);
    const part = result.categories[0].parts[0];
    expect(part.quantityPurchased).toBe(5);
    expect(part.totalSpent).toBe(56);
    expect(part.averageUnitCost).toBeCloseTo(56 / 5);
    // Entries are processed oldest-first, so "last" reflects the Feb purchase.
    expect(part.lastUnitCost).toBe(12);
    expect(part.lastPurchasedAt).toBe(new Date('2026-02-01').toISOString());
    expect(part.currentQuantityOwned).toBe(4);
    expect(part.allExact).toBe(true);
  });

  it('flags a part as not-all-exact once any entry is estimated or manual', async () => {
    findManyExpenseEntryMock.mockResolvedValueOnce([
      entry({ source: 'RECEIPT' }),
      entry({ source: 'ESTIMATED' }),
    ]);
    findManyInventoryItemMock.mockResolvedValueOnce([]);

    const result = await getTeamExpenses('team_1');
    expect(result.categories[0].parts[0].allExact).toBe(false);
  });

  it('groups separate parts under separate categories, ranked by spend within each', async () => {
    findManyExpenseEntryMock.mockResolvedValueOnce([
      entry({ totalCost: 5, part: { id: 'part_cheap', name: 'Cheap Motor', sku: null, manufacturer: GOBILDA, category: MOTORS } }),
      entry({ totalCost: 50, part: { id: 'part_expensive', name: 'Expensive Motor', sku: null, manufacturer: GOBILDA, category: MOTORS } }),
      entry({ totalCost: 7, part: { id: 'part_screw', name: 'Screw Pack', sku: null, manufacturer: GOBILDA, category: HARDWARE } }),
    ]);
    findManyInventoryItemMock.mockResolvedValueOnce([]);

    const result = await getTeamExpenses('team_1');
    // Category order follows Category.sort (Motors=10 before Hardware=90),
    // not spend — matches the rest of the app's category ordering.
    expect(result.categories.map((c) => c.categoryName)).toEqual(['Motors', 'Hardware']);
    expect(result.categories[0].totalSpent).toBe(55);
    // Within a category, highest spender first.
    expect(result.categories[0].parts.map((p) => p.name)).toEqual(['Expensive Motor', 'Cheap Motor']);
    expect(result.grandTotal).toBe(62);
  });

  it('excludes entries whose part has since been deleted (partId set null)', async () => {
    findManyExpenseEntryMock.mockResolvedValueOnce([{ ...entry({}), part: null }]);
    findManyInventoryItemMock.mockResolvedValueOnce([]);

    const result = await getTeamExpenses('team_1');
    expect(result.categories).toEqual([]);
    expect(result.grandTotal).toBe(0);
  });

  it('queries only this team\'s entries with a resolvable part', async () => {
    findManyExpenseEntryMock.mockResolvedValueOnce([]);
    findManyInventoryItemMock.mockResolvedValueOnce([]);
    await getTeamExpenses('team_42');
    expect(findManyExpenseEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team_42', partId: { not: null } } }),
    );
    expect(findManyInventoryItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team_42' } }),
    );
  });
});

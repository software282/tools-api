import { prisma } from '../../lib/prisma.js';

interface PartAgg {
  partId: string;
  name: string;
  sku: string | null;
  manufacturer: { id: string; name: string; slug: string };
  quantityPurchased: number;
  totalSpent: number;
  lastUnitCost: number | null;
  lastPurchasedAt: string | null;
  allExact: boolean;
}

interface CategoryAgg {
  categoryId: string;
  categoryName: string;
  sort: number;
  parts: Map<string, PartAgg>;
}

/**
 * The team's spending, grouped by category then by part — one row per part
 * ever purchased, categories in the app's normal display order and parts
 * within each ranked by spend. Built straight from ExpenseEntry (see
 * prisma/schema.prisma); this is a live aggregation, not a cached table, so
 * a newly-confirmed receipt or inventory adjustment shows up on the very
 * next call with no separate sync step.
 */
export async function getTeamExpenses(teamId: string) {
  const [entries, inventoryRows] = await Promise.all([
    prisma.expenseEntry.findMany({
      where: { teamId, partId: { not: null } },
      include: {
        part: {
          select: {
            id: true,
            name: true,
            sku: true,
            manufacturer: { select: { id: true, name: true, slug: true } },
            category: { select: { id: true, name: true, sort: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.inventoryItem.findMany({ where: { teamId }, select: { partId: true, quantity: true } }),
  ]);

  const ownedByPartId = new Map(inventoryRows.map((r) => [r.partId, r.quantity]));
  const categories = new Map<string, CategoryAgg>();

  for (const entry of entries) {
    // Excluded, not fabricated: a deleted part's spend history still exists
    // as a row (see the schema comment on ExpenseEntry.part), but with no
    // category to file it under, it can't appear in this grouped view.
    if (!entry.part) continue;
    const { category } = entry.part;

    if (!categories.has(category.id)) {
      categories.set(category.id, {
        categoryId: category.id,
        categoryName: category.name,
        sort: category.sort,
        parts: new Map(),
      });
    }
    const categoryBucket = categories.get(category.id)!;

    if (!categoryBucket.parts.has(entry.part.id)) {
      categoryBucket.parts.set(entry.part.id, {
        partId: entry.part.id,
        name: entry.part.name,
        sku: entry.part.sku,
        manufacturer: entry.part.manufacturer,
        quantityPurchased: 0,
        totalSpent: 0,
        lastUnitCost: null,
        lastPurchasedAt: null,
        allExact: true,
      });
    }
    const partAgg = categoryBucket.parts.get(entry.part.id)!;

    partAgg.quantityPurchased += entry.quantity;
    partAgg.totalSpent += Number(entry.totalCost);
    // Entries are iterated oldest-first, so the last write per part is the
    // most recent purchase — exactly what "last unit cost" should reflect.
    partAgg.lastUnitCost = Number(entry.unitCost);
    partAgg.lastPurchasedAt = entry.createdAt.toISOString();
    if (entry.source !== 'RECEIPT') partAgg.allExact = false;
  }

  const categoryList = [...categories.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((cat) => {
      const parts = [...cat.parts.values()]
        .map((p) => ({
          partId: p.partId,
          name: p.name,
          sku: p.sku,
          manufacturer: p.manufacturer,
          quantityPurchased: p.quantityPurchased,
          currentQuantityOwned: ownedByPartId.get(p.partId) ?? 0,
          totalSpent: p.totalSpent,
          averageUnitCost: p.quantityPurchased > 0 ? p.totalSpent / p.quantityPurchased : 0,
          lastUnitCost: p.lastUnitCost,
          allExact: p.allExact,
          lastPurchasedAt: p.lastPurchasedAt,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent);
      return {
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        totalSpent: parts.reduce((sum, p) => sum + p.totalSpent, 0),
        parts,
      };
    });

  const grandTotal = categoryList.reduce((sum, c) => sum + c.totalSpent, 0);

  return { generatedAt: new Date().toISOString(), grandTotal, categories: categoryList };
}

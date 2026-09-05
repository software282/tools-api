import { z } from 'zod';

export const expensePartRowSchema = z.object({
  partId: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  manufacturer: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  // All-time purchase quantity, from ExpenseEntry — not the same number as
  // currentQuantityOwned below, which can be lower (parts get used) or
  // higher (received before expense tracking existed, or via a part with no
  // known price at the time).
  quantityPurchased: z.number().int(),
  currentQuantityOwned: z.number().int(),
  totalSpent: z.number(),
  averageUnitCost: z.number(),
  lastUnitCost: z.number().nullable(),
  // True if every entry contributing to this row came from an exact receipt
  // price rather than an ESTIMATED fallback — the UI's cue for whether
  // "totalSpent" is a real figure or a rough one.
  allExact: z.boolean(),
  lastPurchasedAt: z.string().nullable(),
});

export const expenseCategorySchema = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  totalSpent: z.number(),
  parts: z.array(expensePartRowSchema),
});

export const expensesResponse = z.object({
  generatedAt: z.string(),
  grandTotal: z.number(),
  categories: z.array(expenseCategorySchema),
});

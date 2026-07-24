import { z } from 'zod';

export const partScopeSchema = z.enum(['GLOBAL', 'TEAM']);
export const partStatusSchema = z.enum(['APPROVED', 'PENDING', 'REJECTED']);

export const partSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  description: z.string().nullable(),
  productUrl: z.string().nullable(),
  purchaseUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  scope: partScopeSchema,
  status: partStatusSchema,
  manufacturer: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  createdByTeamId: z.string().nullable(),
  createdAt: z.string(),
  // Present only when the request is authenticated with a team.
  ownedQuantity: z.number().int().nullable().optional(),
});

export const partSearchQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().optional(), // category slug
  manufacturer: z.string().optional(), // manufacturer slug
  scope: partScopeSchema.optional(),
  ownedOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const paginatedParts = z.object({
  items: z.array(partSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const createPartBody = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  // Item page is required so parts are always purchasable/traceable.
  productUrl: z.string().url(),
  purchaseUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  manufacturerId: z.string(),
  categoryId: z.string(),
  // If true, also queue a copy for the shared global library (admin review).
  submitToLibrary: z.boolean().default(false),
});

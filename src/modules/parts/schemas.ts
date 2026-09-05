import { z } from 'zod';
import { vendorSchema } from '../receipts/schemas.js';

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

const partFields = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  // Optional for a team's own private part — a personal inventory entry
  // shouldn't require hunting down a URL. Required only when requesting the
  // shared library (see submitToLibrary and createPartBody's refinement
  // below), since an approved library part must stay purchasable/traceable.
  productUrl: z.string().url().optional(),
  purchaseUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
  manufacturerId: z.string(),
  categoryId: z.string(),
  // If true, request this part for the shared global library instead of
  // creating it there outright — see the route for what that actually does.
  submitToLibrary: z.boolean().default(false),
});

export const createPartBody = partFields.superRefine((body, ctx) => {
  if (body.submitToLibrary && !body.productUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['productUrl'],
      message: 'A product page URL is required to request this part for the shared library.',
    });
  }
});

/**
 * Edit an existing team-scoped part. Every field is optional; at least one must
 * be present. `submitToLibrary` is deliberately excluded — submitting to the
 * global library is a separate action, not an edit.
 */
export const updatePartBody = partFields
  .omit({ submitToLibrary: true })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

// A part visible enough to compare against — used both to report what an
// existing/pending library entry looks like, and while reviewing a request.
const duplicateCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: partStatusSchema,
});

export const createPartResponse = z.object({
  part: partSchema,
  // False whenever a shared-library request wasn't actually queued — either
  // because none was asked for, or because `duplicateOf` already covers it.
  submittedToLibrary: z.boolean(),
  duplicateOf: duplicateCandidateSchema.nullable(),
});

export const suggestUrlQuery = z.object({
  vendor: vendorSchema,
  sku: z.string().optional(),
  name: z.string().min(1),
});

export const suggestUrlResponse = z.object({
  url: z.string().url().nullable(),
  source: z.enum(['deterministic', 'ai_search', 'none']),
  // The product page's own image, read from its og:image tag — resolved
  // automatically alongside `url` so reviewers never have to hand-find one.
  imageUrl: z.string().url().nullable(),
});

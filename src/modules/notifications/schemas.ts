import { z } from 'zod';

export const notificationKindSchema = z.enum([
  'SUBMISSION_APPROVED',
  'SUBMISSION_REJECTED',
  'PRICE_CORRECTED',
]);

export const notificationSchema = z.object({
  id: z.string(),
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
  // The part it concerns, when it still exists — null once a part is deleted,
  // since the message outlives it.
  partId: z.string().nullable(),
});

export const notificationList = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int(),
});

export const notificationListQuery = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

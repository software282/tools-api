import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { visibilityFilter } from '../parts/service.js';

/**
 * Counts for a home screen, in one call.
 *
 * Exists so a dashboard does not have to fan out to five endpoints and add up
 * the results client-side. Deliberately counts only — lists come from the
 * endpoints that already page and filter properly, so nothing here duplicates
 * `/inventory`, `/receipts`, or `/admin/submissions`.
 */

const teamSummary = z.object({
  /** Parts this team has an inventory row for. */
  trackedParts: z.number().int(),
  /** Sum of every quantity — "you hold 1,240 items". */
  totalUnits: z.number().int(),
  /** Parts below a threshold someone set. The number worth acting on. */
  lowStockCount: z.number().int(),
  /** Parsed but not yet confirmed to inventory. */
  receiptsNeedingReview: z.number().int(),
  /** Could not be read at all — the user has to try again. */
  receiptsFailed: z.number().int(),
  receiptsTotal: z.number().int(),
  /** Custom parts this team created. */
  customParts: z.number().int(),
});

const dashboardResponse = z.object({
  /** Null when the caller belongs to no team (a Seattle Solvers admin). */
  team: teamSummary.nullable(),
  library: z.object({
    /** Parts visible to this caller: approved global plus their own team's. */
    availableParts: z.number().int(),
  }),
  /** Present only for SUPER_ADMIN — drives the review badge. */
  admin: z
    .object({
      pendingSubmissions: z.number().int(),
    })
    .nullable(),
});

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      // requireAuth rather than requireTeam: a SUPER_ADMIN need not belong to a
      // team, and still needs the review queue count.
      preHandler: app.requireAuth,
      schema: {
        tags: ['dashboard'],
        summary: 'Counts for a home screen, in a single call',
        description:
          'Everything a landing page needs without fanning out to several endpoints. `team` is null for a caller with no team; `admin` is null unless the caller is SUPER_ADMIN. Fetch the corresponding lists from /inventory, /receipts, and /admin/submissions.',
        security: [{ bearerAuth: [] }],
        response: { 200: dashboardResponse },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId;
      const isSuperAdmin = req.auth!.role === 'SUPER_ADMIN';

      const [availableParts, pendingSubmissions] = await Promise.all([
        prisma.part.count({ where: visibilityFilter(teamId) }),
        isSuperAdmin
          ? prisma.part.count({ where: { scope: 'GLOBAL', status: 'PENDING' } })
          : Promise.resolve(0),
      ]);

      if (!teamId) {
        return {
          team: null,
          library: { availableParts },
          admin: isSuperAdmin ? { pendingSubmissions } : null,
        };
      }

      const [
        trackedParts,
        unitSum,
        lowStockCount,
        receiptsNeedingReview,
        receiptsFailed,
        receiptsTotal,
        customParts,
      ] = await Promise.all([
        prisma.inventoryItem.count({ where: { teamId } }),
        prisma.inventoryItem.aggregate({ where: { teamId }, _sum: { quantity: true } }),
        prisma.inventoryItem.count({
          where: {
            teamId,
            minQuantity: { gt: 0 },
            quantity: { lt: prisma.inventoryItem.fields.minQuantity },
          },
        }),
        prisma.receipt.count({ where: { teamId, status: 'PARSED' } }),
        prisma.receipt.count({ where: { teamId, status: 'FAILED' } }),
        prisma.receipt.count({ where: { teamId } }),
        prisma.part.count({ where: { scope: 'TEAM', createdByTeamId: teamId } }),
      ]);

      return {
        team: {
          trackedParts,
          totalUnits: unitSum._sum.quantity ?? 0,
          lowStockCount,
          receiptsNeedingReview,
          receiptsFailed,
          receiptsTotal,
          customParts,
        },
        library: { availableParts },
        admin: isSuperAdmin ? { pendingSubmissions } : null,
      };
    },
  );
};

export default routes;

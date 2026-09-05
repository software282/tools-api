import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const submissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  description: z.string().nullable(),
  productUrl: z.string().nullable(),
  purchaseUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  manufacturer: z.object({ id: z.string(), name: z.string() }),
  category: z.object({ id: z.string(), name: z.string() }),
  submittedByTeam: z.object({ id: z.string(), number: z.number().int(), name: z.string() }).nullable(),
});

function serialize(row: {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  productUrl: string | null;
  purchaseUrl: string | null;
  imageUrl: string | null;
  createdAt: Date;
  manufacturer: { id: string; name: string };
  category: { id: string; name: string };
  createdByTeam: { id: string; number: number; name: string } | null;
}) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    productUrl: row.productUrl,
    purchaseUrl: row.purchaseUrl,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt.toISOString(),
    manufacturer: row.manufacturer,
    category: row.category,
    submittedByTeam: row.createdByTeam,
  };
}

const statsSchema = z.object({
  generatedAt: z.string(),
  requests: z.object({
    today: z.number().int(),
    last7Days: z.number().int(),
    // statusCode >= 500 in the last 7 days — a rising count is a much earlier
    // capacity-pressure signal than request volume alone.
    serverErrorsLast7Days: z.number().int(),
  }),
  teams: z.object({
    total: z.number().int(),
    // Distinct teamId across requests in the last 7 days — "how many teams
    // are actually using this," not just how many have ever signed up.
    activeLast7Days: z.number().int(),
    withAnthropicKeyConfigured: z.number().int(),
  }),
  receipts: z.object({
    last7Days: z.number().int(),
    totalAllTime: z.number().int(),
  }),
  topTeamsLast7Days: z.array(
    z.object({
      teamId: z.string(),
      teamNumber: z.number().int().nullable(),
      teamName: z.string().nullable(),
      requestCount: z.number().int(),
    }),
  ),
});

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const adminOnly = { preHandler: [app.requireAuth, app.requireRole('SUPER_ADMIN')] };

  r.get(
    '/stats',
    {
      ...adminOnly,
      schema: {
        tags: ['admin'],
        summary: 'Usage stats — request volume, active teams, receipt throughput',
        description:
          'Backed by RequestLog, one row per API request (see src/server.ts\'s ' +
          "onResponse hook; /health is excluded). Meant for capacity planning as " +
          'more teams come on, not per-second monitoring — query it occasionally, ' +
          "not in a tight poll loop (that would itself show up in next week's numbers).",
        security: [{ bearerAuth: [] }],
        response: { 200: statsSchema },
      },
    },
    async () => {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        requestsToday,
        requestsLast7Days,
        serverErrorsLast7Days,
        totalTeams,
        teamsWithKey,
        receiptsLast7Days,
        receiptsTotal,
        activeTeamRows,
      ] = await Promise.all([
        prisma.requestLog.count({ where: { createdAt: { gte: startOfToday } } }),
        prisma.requestLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.requestLog.count({
          where: { createdAt: { gte: sevenDaysAgo }, statusCode: { gte: 500 } },
        }),
        prisma.team.count(),
        prisma.team.count({ where: { anthropicApiKeyCiphertext: { not: null } } }),
        prisma.receipt.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        prisma.receipt.count(),
        // groupBy, not a raw distinct-count: also doubles as the per-team
        // request counts topTeamsLast7Days ranks below.
        prisma.requestLog.groupBy({
          by: ['teamId'],
          where: { createdAt: { gte: sevenDaysAgo }, teamId: { not: null } },
          _count: { _all: true },
          orderBy: { _count: { teamId: 'desc' } },
        }),
      ]);

      const topRows = activeTeamRows.slice(0, 10);
      const teams = await prisma.team.findMany({
        where: { id: { in: topRows.map((r) => r.teamId!) } },
        select: { id: true, number: true, name: true },
      });
      const teamById = new Map(teams.map((t) => [t.id, t]));

      return {
        generatedAt: now.toISOString(),
        requests: {
          today: requestsToday,
          last7Days: requestsLast7Days,
          serverErrorsLast7Days,
        },
        teams: {
          total: totalTeams,
          activeLast7Days: activeTeamRows.length,
          withAnthropicKeyConfigured: teamsWithKey,
        },
        receipts: { last7Days: receiptsLast7Days, totalAllTime: receiptsTotal },
        topTeamsLast7Days: topRows.map((row) => ({
          teamId: row.teamId!,
          teamNumber: teamById.get(row.teamId!)?.number ?? null,
          teamName: teamById.get(row.teamId!)?.name ?? null,
          requestCount: row._count._all,
        })),
      };
    },
  );

  r.get(
    '/submissions',
    {
      ...adminOnly,
      schema: {
        tags: ['admin'],
        summary: 'List parts submitted for the global library, pending review',
        security: [{ bearerAuth: [] }],
        querystring: z.object({
          status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
        }),
        response: { 200: z.array(submissionSchema) },
      },
    },
    async (req) => {
      const rows = await prisma.part.findMany({
        where: { scope: 'GLOBAL', status: req.query.status },
        include: {
          manufacturer: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          createdByTeam: { select: { id: true, number: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(serialize);
    },
  );

  r.post(
    '/submissions/:id/approve',
    {
      ...adminOnly,
      schema: {
        tags: ['admin'],
        summary: 'Approve a submission — publishes it to the global library for all teams',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: submissionSchema },
      },
    },
    async (req) => {
      const existing = await prisma.part.findFirst({
        where: { id: req.params.id, scope: 'GLOBAL' },
      });
      if (!existing) throw notFound('Submission not found');
      const row = await prisma.part.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED' },
        include: {
          manufacturer: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          createdByTeam: { select: { id: true, number: true, name: true } },
        },
      });
      return serialize(row);
    },
  );

  r.post(
    '/submissions/:id/reject',
    {
      ...adminOnly,
      schema: {
        tags: ['admin'],
        summary: 'Reject a submission',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: submissionSchema },
      },
    },
    async (req) => {
      const existing = await prisma.part.findFirst({
        where: { id: req.params.id, scope: 'GLOBAL' },
      });
      if (!existing) throw notFound('Submission not found');
      const row = await prisma.part.update({
        where: { id: req.params.id },
        data: { status: 'REJECTED' },
        include: {
          manufacturer: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          createdByTeam: { select: { id: true, number: true, name: true } },
        },
      });
      return serialize(row);
    },
  );
};

export default routes;

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

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const adminOnly = { preHandler: [app.requireAuth, app.requireRole('SUPER_ADMIN')] };

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

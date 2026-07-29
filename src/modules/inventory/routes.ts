import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { partSchema } from '../parts/schemas.js';
import { visibilityFilter } from '../parts/service.js';

const inventoryItemSchema = z.object({
  partId: z.string(),
  quantity: z.number().int(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  updatedAt: z.string(),
  part: partSchema,
});

const listQuery = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  // Hide zero-quantity rows (parts a team once tracked but no longer holds).
  includeZero: z.coerce.boolean().default(true),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

const paginatedInventory = z.object({
  items: z.array(inventoryItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

const setQtyBody = z.object({
  quantity: z.number().int().min(0),
  location: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

const adjustBody = z.object({
  delta: z.number().int(),
  location: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

function buildWhere(teamId: string, q: z.infer<typeof listQuery>): Prisma.InventoryItemWhereInput {
  const and: Prisma.InventoryItemWhereInput[] = [{ teamId }];
  if (!q.includeZero) and.push({ quantity: { gt: 0 } });
  if (q.q) {
    and.push({
      part: {
        OR: [
          { name: { contains: q.q, mode: 'insensitive' } },
          { sku: { contains: q.q, mode: 'insensitive' } },
          { manufacturer: { name: { contains: q.q, mode: 'insensitive' } } },
        ],
      },
    });
  }
  if (q.category) and.push({ part: { category: { slug: q.category } } });
  if (q.manufacturer) and.push({ part: { manufacturer: { slug: q.manufacturer } } });
  return { AND: and };
}

const partInclude = {
  manufacturer: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.PartInclude;

function serializeRow(row: {
  partId: string;
  quantity: number;
  location: string | null;
  notes: string | null;
  updatedAt: Date;
  part: Prisma.PartGetPayload<{ include: typeof partInclude }>;
}) {
  const p = row.part;
  return {
    partId: row.partId,
    quantity: row.quantity,
    location: row.location,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
    part: {
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      productUrl: p.productUrl,
      purchaseUrl: p.purchaseUrl,
      imageUrl: p.imageUrl,
      scope: p.scope,
      status: p.status,
      manufacturer: p.manufacturer,
      category: p.category,
      createdByTeamId: p.createdByTeamId,
      createdAt: p.createdAt.toISOString(),
      ownedQuantity: row.quantity,
    },
  };
}

/** Ensure the part exists and is usable by this team (global-approved or own). */
async function assertPartVisible(partId: string, teamId: string) {
  const part = await prisma.part.findFirst({
    where: { AND: [{ id: partId }, visibilityFilter(teamId)] },
    include: partInclude,
  });
  if (!part) throw notFound('Part not found or not available to your team', 'PART_NOT_VISIBLE');
  return part;
}

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['inventory'],
        summary: "The inventory sheet: parts your team tracks and how many you have",
        security: [{ bearerAuth: [] }],
        querystring: listQuery,
        response: { 200: paginatedInventory },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      const { page, pageSize } = req.query;
      const where = buildWhere(teamId, req.query);

      const [rows, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where,
          include: { part: { include: partInclude } },
          orderBy: [{ part: { manufacturer: { name: 'asc' } } }, { part: { name: 'asc' } }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.inventoryItem.count({ where }),
      ]);

      return {
        items: rows.map(serializeRow),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  r.put(
    '/:partId',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['inventory'],
        summary: 'Set the quantity (and optional location/notes) of a part',
        security: [{ bearerAuth: [] }],
        params: z.object({ partId: z.string() }),
        body: setQtyBody,
        response: { 200: inventoryItemSchema },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      await assertPartVisible(req.params.partId, teamId);
      const { quantity, location, notes } = req.body;

      const row = await prisma.inventoryItem.upsert({
        where: { teamId_partId: { teamId, partId: req.params.partId } },
        create: { teamId, partId: req.params.partId, quantity, location, notes },
        update: { quantity, location, notes },
        include: { part: { include: partInclude } },
      });
      return serializeRow(row);
    },
  );

  r.post(
    '/:partId/adjust',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['inventory'],
        summary: 'Adjust a part quantity by a delta (e.g. +5 after a purchase, -1 when used)',
        security: [{ bearerAuth: [] }],
        params: z.object({ partId: z.string() }),
        body: adjustBody,
        response: { 200: inventoryItemSchema },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      await assertPartVisible(req.params.partId, teamId);
      const { delta, location, notes } = req.body;

      const existing = await prisma.inventoryItem.findUnique({
        where: { teamId_partId: { teamId, partId: req.params.partId } },
      });
      const nextQty = Math.max(0, (existing?.quantity ?? 0) + delta);
      if (existing === null && delta < 0) {
        throw badRequest('Cannot decrease a part you do not track yet', 'NO_INVENTORY');
      }

      const row = await prisma.inventoryItem.upsert({
        where: { teamId_partId: { teamId, partId: req.params.partId } },
        create: { teamId, partId: req.params.partId, quantity: nextQty, location, notes },
        update: {
          quantity: nextQty,
          ...(location !== undefined ? { location } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
        include: { part: { include: partInclude } },
      });
      return serializeRow(row);
    },
  );

  r.delete(
    '/:partId',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['inventory'],
        summary: 'Stop tracking a part (removes the row from your inventory sheet)',
        description:
          'Different from setting the quantity to 0: that keeps the part on your sheet with no stock, this removes the row entirely. The part itself is untouched.',
        security: [{ bearerAuth: [] }],
        params: z.object({ partId: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const teamId = req.auth!.teamId!;
      const existing = await prisma.inventoryItem.findUnique({
        where: { teamId_partId: { teamId, partId: req.params.partId } },
        select: { id: true },
      });
      if (!existing) throw notFound('Your team is not tracking that part', 'NO_INVENTORY');

      await prisma.inventoryItem.delete({ where: { id: existing.id } });
      return reply.status(204).send(null);
    },
  );

  r.get(
    '/export.csv',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['inventory'],
        summary: 'Download the team inventory as CSV',
        security: [{ bearerAuth: [] }],
        produces: ['text/csv'],
      },
    },
    async (req, reply) => {
      const teamId = req.auth!.teamId!;
      const rows = await prisma.inventoryItem.findMany({
        where: { teamId },
        include: { part: { include: partInclude } },
        orderBy: [{ part: { manufacturer: { name: 'asc' } } }, { part: { name: 'asc' } }],
      });

      const header = [
        'Manufacturer',
        'Category',
        'Part',
        'SKU',
        'Quantity',
        'Location',
        'Notes',
        'ProductURL',
      ];
      const lines = rows.map((row) => {
        const p = row.part;
        return [
          p.manufacturer.name,
          p.category.name,
          p.name,
          p.sku ?? '',
          String(row.quantity),
          row.location ?? '',
          row.notes ?? '',
          p.productUrl ?? '',
        ]
          .map(csvCell)
          .join(',');
      });
      const csv = [header.join(','), ...lines].join('\r\n');

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="inventory.csv"');
      return csv;
    },
  );
};

/** Quote a CSV cell if it contains a comma, quote, or newline. */
function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default routes;

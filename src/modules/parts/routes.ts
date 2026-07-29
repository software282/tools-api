import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';
import {
  createPartBody,
  paginatedParts,
  partSchema,
  partSearchQuery,
  updatePartBody,
} from './schemas.js';
import { getPartById, searchParts, serializePart } from './service.js';

/** Validate manufacturer/category ids exist, for a clear error instead of an FK violation. */
async function assertCatalogRefs(manufacturerId?: string, categoryId?: string) {
  const [manufacturer, category] = await Promise.all([
    manufacturerId
      ? prisma.manufacturer.findUnique({ where: { id: manufacturerId } })
      : Promise.resolve(true),
    categoryId ? prisma.category.findUnique({ where: { id: categoryId } }) : Promise.resolve(true),
  ]);
  if (!manufacturer) throw badRequest('Unknown manufacturerId', 'INVALID_MANUFACTURER');
  if (!category) throw badRequest('Unknown categoryId', 'INVALID_CATEGORY');
}

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      preHandler: app.optionalAuth,
      schema: {
        tags: ['parts'],
        summary: 'Search the parts library (global + your team\'s custom parts)',
        description:
          'Anonymous callers see the approved global library. Authenticated callers also see their team\'s custom parts and an `ownedQuantity` for each result.',
        security: [{ bearerAuth: [] }],
        querystring: partSearchQuery,
        response: { 200: paginatedParts },
      },
    },
    async (req) => {
      const teamId = req.auth?.teamId ?? null;
      return searchParts(req.query, teamId);
    },
  );

  r.get(
    '/:id',
    {
      preHandler: app.optionalAuth,
      schema: {
        tags: ['parts'],
        summary: 'Get a single part by id',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: partSchema },
      },
    },
    async (req) => {
      const teamId = req.auth?.teamId ?? null;
      const part = await getPartById(req.params.id, teamId);
      if (!part) throw notFound('Part not found');
      return part;
    },
  );

  r.post(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['parts'],
        summary: 'Add a custom part for your team (optionally submit to the global library)',
        description:
          'Creates a part scoped to your team that you can use immediately. If `submitToLibrary` is true, a copy is queued for Seattle Solvers to review and, if approved, publish to every team.',
        security: [{ bearerAuth: [] }],
        body: createPartBody,
        response: { 201: partSchema },
      },
    },
    async (req, reply) => {
      const { submitToLibrary, ...data } = req.body;
      const teamId = req.auth!.teamId!;
      const userId = req.auth!.sub;

      await assertCatalogRefs(data.manufacturerId, data.categoryId);

      const teamPart = await prisma.part.create({
        data: {
          ...data,
          scope: 'TEAM',
          status: 'APPROVED',
          createdByTeamId: teamId,
          createdByUserId: userId,
        },
        include: {
          manufacturer: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          inventoryItems: { where: { teamId }, take: 1 },
        },
      });

      // Queue a global-library copy for admin review.
      if (submitToLibrary) {
        await prisma.part.create({
          data: {
            name: data.name,
            sku: data.sku,
            description: data.description,
            productUrl: data.productUrl,
            purchaseUrl: data.purchaseUrl,
            imageUrl: data.imageUrl,
            manufacturerId: data.manufacturerId,
            categoryId: data.categoryId,
            scope: 'GLOBAL',
            status: 'PENDING',
            createdByTeamId: teamId,
            createdByUserId: userId,
          },
        });
      }

      return reply.status(201).send(serializePart(teamPart, teamId));
    },
  );

  r.patch(
    '/:id',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['parts'],
        summary: "Edit one of your team's custom parts",
        description:
          'Only TEAM-scoped parts your own team created can be edited. Parts in the shared global library are read-only here — submit a correction through an admin instead.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        body: updatePartBody,
        response: { 200: partSchema },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      const existing = await prisma.part.findFirst({
        where: { id: req.params.id, scope: 'TEAM', createdByTeamId: teamId },
        select: { id: true },
      });
      if (!existing) {
        throw notFound(
          "Part not found, or it is not a custom part your team owns",
          'PART_NOT_EDITABLE',
        );
      }

      await assertCatalogRefs(req.body.manufacturerId, req.body.categoryId);

      const updated = await prisma.part.update({
        where: { id: existing.id },
        data: req.body,
        include: {
          manufacturer: { select: { id: true, name: true, slug: true } },
          category: { select: { id: true, name: true, slug: true } },
          inventoryItems: { where: { teamId }, take: 1 },
        },
      });
      return serializePart(updated, teamId);
    },
  );

  r.delete(
    '/:id',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['parts'],
        summary: "Delete one of your team's custom parts",
        description:
          'Refused while your team still holds stock of the part — set its inventory quantity to 0 first, so a delete can never silently discard a count.',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const teamId = req.auth!.teamId!;
      const existing = await prisma.part.findFirst({
        where: { id: req.params.id, scope: 'TEAM', createdByTeamId: teamId },
        select: { id: true },
      });
      if (!existing) {
        throw notFound(
          "Part not found, or it is not a custom part your team owns",
          'PART_NOT_EDITABLE',
        );
      }

      const held = await prisma.inventoryItem.findFirst({
        where: { partId: existing.id, quantity: { gt: 0 } },
        select: { quantity: true },
      });
      if (held) {
        throw badRequest(
          `Still tracking ${held.quantity} of this part. Set the quantity to 0 before deleting.`,
          'PART_IN_USE',
        );
      }

      // Cascades the (zero-quantity) inventory row; receipt line items keep
      // their parsed text and have matchedPartId set to null.
      await prisma.part.delete({ where: { id: existing.id } });
      return reply.status(204).send(null);
    },
  );
};

export default routes;

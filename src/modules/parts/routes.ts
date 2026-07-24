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
} from './schemas.js';
import { getPartById, searchParts, serializePart } from './service.js';

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

      // Validate FK references up front for clear error messages.
      const [manufacturer, category] = await Promise.all([
        prisma.manufacturer.findUnique({ where: { id: data.manufacturerId } }),
        prisma.category.findUnique({ where: { id: data.categoryId } }),
      ]);
      if (!manufacturer) throw badRequest('Unknown manufacturerId', 'INVALID_MANUFACTURER');
      if (!category) throw badRequest('Unknown categoryId', 'INVALID_CATEGORY');

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
};

export default routes;

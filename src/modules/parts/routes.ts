import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { suggestProductUrl } from '../../services/productUrlLookup.js';
import { sendPartSubmissionEmail } from '../../lib/email.js';
import {
  createPartBody,
  createPartResponse,
  paginatedParts,
  partSchema,
  partSearchQuery,
  suggestUrlQuery,
  suggestUrlResponse,
  updatePartBody,
} from './schemas.js';
import { findLikelyDuplicateGlobalPart, getPartById, searchParts, serializePart } from './service.js';

/**
 * `suggest-url` can trigger a Claude web-search call, same cost class as
 * receipt intake — rate-limited the same way rather than left on the global
 * limit.
 */
const suggestUrlRateLimit = {
  rateLimit: { max: env.RATE_LIMIT_RECEIPT_MAX, timeWindow: '1 minute' },
};

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

  r.get(
    '/suggest-url',
    {
      preHandler: app.requireAuth,
      config: suggestUrlRateLimit,
      schema: {
        tags: ['parts'],
        summary: 'Best-effort product page URL and image for a part not yet in the library',
        description:
          'Deterministic for vendors with a known SKU-to-URL formula (currently REV); ' +
          "otherwise a web-search-grounded guess from Claude, billed to your team's own " +
          'Anthropic key (see PATCH /teams/current), or null if your team has not set one ' +
          "or Claude was not confident. Once a product URL is known, its page's own " +
          "og:image is read automatically — reviewers never hand-paste an image URL. " +
          'Always a suggestion to review, never a verified link.',
        security: [{ bearerAuth: [] }],
        querystring: suggestUrlQuery,
        response: { 200: suggestUrlResponse },
      },
    },
    async (req) => suggestProductUrl({ ...req.query, teamId: req.auth?.teamId ?? null }),
  );

  r.post(
    '/',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['parts'],
        summary: 'Add a custom part for your team, optionally requesting it for the shared library',
        description:
          'Always creates a part scoped to your team, usable immediately — a personal ' +
          "inventory entry never needs more than a name, manufacturer, and category, so " +
          "nothing here blocks on that. `submitToLibrary` additionally *requests* the " +
          'part for the shared global library instead of adding it there outright: it ' +
          "requires a product URL (every approved library part must stay traceable), " +
          'and is skipped rather than queued when `duplicateOf` already reports a ' +
          'matching or pending part — this is the guard against duplicate and junk ' +
          "submissions piling up in Seattle Solvers' review queue. A real request still " +
          'needs SUPER_ADMIN approval (GET/POST /admin/submissions) before it reaches ' +
          'every team.',
        security: [{ bearerAuth: [] }],
        body: createPartBody,
        response: { 201: createPartResponse },
      },
    },
    async (req, reply) => {
      const { submitToLibrary, unitCost, ...data } = req.body;
      const teamId = req.auth!.teamId!;
      const userId = req.auth!.sub;

      await assertCatalogRefs(data.manufacturerId, data.categoryId);

      // A request for the shared library is skipped (not queued) when
      // something matching or already-pending exists — the team's own part
      // below is created either way, so this never blocks personal use.
      const duplicateOf = submitToLibrary
        ? await findLikelyDuplicateGlobalPart({
            manufacturerId: data.manufacturerId,
            name: data.name,
            sku: data.sku,
          })
        : null;

      const teamPart = await prisma.part.create({
        data: {
          ...data,
          lastKnownPrice: unitCost,
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

      const submittedToLibrary = submitToLibrary && !duplicateOf;
      if (submittedToLibrary) {
        await prisma.part.create({
          data: {
            name: data.name,
            sku: data.sku,
            description: data.description,
            productUrl: data.productUrl,
            purchaseUrl: data.purchaseUrl,
            imageUrl: data.imageUrl,
            lastKnownPrice: unitCost,
            manufacturerId: data.manufacturerId,
            categoryId: data.categoryId,
            scope: 'GLOBAL',
            status: 'PENDING',
            createdByTeamId: teamId,
            createdByUserId: userId,
          },
        });

        // Best-effort: staff still see the request in GET /admin/submissions
        // either way, so a failed/unconfigured send is never fatal here.
        try {
          const team = await prisma.team.findUnique({
            where: { id: teamId },
            select: { number: true, name: true },
          });
          if (team) {
            await sendPartSubmissionEmail({
              teamNumber: team.number,
              teamName: team.name,
              partName: data.name,
            });
          }
        } catch (err) {
          req.log.warn({ err }, 'part-submission notification email failed to send');
        }
      }

      return reply.status(201).send({
        part: serializePart(teamPart, teamId),
        submittedToLibrary,
        duplicateOf,
      });
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

      const { unitCost, ...rest } = req.body;
      const updated = await prisma.part.update({
        where: { id: existing.id },
        data: { ...rest, ...(unitCost !== undefined ? { lastKnownPrice: unitCost } : {}) },
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

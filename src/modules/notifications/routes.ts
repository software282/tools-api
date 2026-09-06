import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { notificationList, notificationListQuery, notificationSchema } from './schemas.js';

function serialize(row: {
  id: string;
  kind: 'SUBMISSION_APPROVED' | 'SUBMISSION_REJECTED' | 'PRICE_CORRECTED';
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  partId: string | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
    partId: row.partId,
  };
}

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const teamOnly = { preHandler: [app.requireAuth, app.requireTeam] };

  r.get(
    '/',
    {
      ...teamOnly,
      schema: {
        tags: ['notifications'],
        summary: "Your team's notifications, newest first",
        description:
          'How a team hears about things decided elsewhere on someone else\'s schedule — ' +
          'chiefly the outcome of a shared-library submission, including when Seattle ' +
          'Solvers corrected the price before approving it. In-app only; this service ' +
          'sends no email.',
        security: [{ bearerAuth: [] }],
        querystring: notificationListQuery,
        response: { 200: notificationList },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      const [rows, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where: { teamId, ...(req.query.unreadOnly ? { readAt: null } : {}) },
          orderBy: { createdAt: 'desc' },
          take: req.query.limit,
        }),
        prisma.notification.count({ where: { teamId, readAt: null } }),
      ]);
      return { items: rows.map(serialize), unreadCount };
    },
  );

  r.post(
    '/:id/read',
    {
      ...teamOnly,
      schema: {
        tags: ['notifications'],
        summary: 'Mark one notification as read',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string() }),
        response: { 200: notificationSchema },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;
      // Scoped to the caller's own team, so an id from another team 404s
      // rather than being quietly readable.
      const existing = await prisma.notification.findFirst({
        where: { id: req.params.id, teamId },
        select: { id: true, readAt: true },
      });
      if (!existing) throw notFound('Notification not found');

      const row = existing.readAt
        ? await prisma.notification.findUniqueOrThrow({ where: { id: existing.id } })
        : await prisma.notification.update({
            where: { id: existing.id },
            data: { readAt: new Date() },
          });
      return serialize(row);
    },
  );

  r.post(
    '/read-all',
    {
      ...teamOnly,
      schema: {
        tags: ['notifications'],
        summary: 'Mark every unread notification as read',
        security: [{ bearerAuth: [] }],
        response: { 200: z.object({ markedRead: z.number().int() }) },
      },
    },
    async (req) => {
      const result = await prisma.notification.updateMany({
        where: { teamId: req.auth!.teamId!, readAt: null },
        data: { readAt: new Date() },
      });
      return { markedRead: result.count };
    },
  );
};

export default routes;

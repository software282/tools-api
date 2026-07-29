import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { makeInviteCode } from '../../lib/inviteCode.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { publicTeamSchema, roleSchema } from '../auth/schemas.js';

const memberSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});

const teamDetailSchema = publicTeamSchema.extend({
  memberCount: z.number().int(),
});

const updateTeamBody = z.object({
  name: z.string().min(1).max(120),
});

// Team admins can only move members between MEMBER and TEAM_ADMIN. Granting
// SUPER_ADMIN is a Seattle Solvers staff action, not a team-level one.
const updateMemberBody = z.object({
  role: z.enum(['MEMBER', 'TEAM_ADMIN']),
});

const joinBody = z.object({
  inviteCode: z.string().min(4).max(40),
});

function serializeMember(user: {
  id: string;
  email: string;
  displayName: string;
  role: z.infer<typeof roleSchema>;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Look up a user who must be a member of the caller's team, and who must not be
 * the caller themselves.
 *
 * Blocking self-targeting is what makes the "last admin" case safe: an admin can
 * never demote or remove themselves, so at least one admin always remains.
 */
async function findManageableMember(teamId: string, actorId: string, targetId: string) {
  if (targetId === actorId) {
    throw badRequest('You cannot change your own membership', 'CANNOT_TARGET_SELF');
  }
  const target = await prisma.user.findFirst({ where: { id: targetId, teamId } });
  if (!target) throw notFound('No such member on your team', 'MEMBER_NOT_FOUND');
  if (target.role === 'SUPER_ADMIN') {
    throw forbidden('Cannot modify a Seattle Solvers admin', 'CANNOT_MODIFY_SUPER_ADMIN');
  }
  return target;
}

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/current',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['teams'],
        summary: 'Get your own team, including its invite code and member count',
        security: [{ bearerAuth: [] }],
        response: { 200: teamDetailSchema },
      },
    },
    async (req) => {
      const team = await prisma.team.findUnique({
        where: { id: req.auth!.teamId! },
        include: { _count: { select: { users: true } } },
      });
      if (!team) throw notFound('Team not found');
      return {
        id: team.id,
        number: team.number,
        name: team.name,
        inviteCode: team.inviteCode,
        memberCount: team._count.users,
      };
    },
  );

  r.patch(
    '/current',
    {
      preHandler: app.requireTeamAdmin,
      schema: {
        tags: ['teams'],
        summary: 'Rename your team',
        description:
          'The FTC team number is immutable — it identifies the team and is referenced by submitted parts.',
        security: [{ bearerAuth: [] }],
        body: updateTeamBody,
        response: { 200: publicTeamSchema },
      },
    },
    async (req) => {
      const team = await prisma.team.update({
        where: { id: req.auth!.teamId! },
        data: { name: req.body.name },
      });
      return {
        id: team.id,
        number: team.number,
        name: team.name,
        inviteCode: team.inviteCode,
      };
    },
  );

  r.get(
    '/members',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['teams'],
        summary: 'List the members of your team',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(memberSchema) },
      },
    },
    async (req) => {
      const users = await prisma.user.findMany({
        where: { teamId: req.auth!.teamId! },
        orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
      });
      return users.map(serializeMember);
    },
  );

  r.patch(
    '/members/:userId',
    {
      preHandler: app.requireTeamAdmin,
      schema: {
        tags: ['teams'],
        summary: "Promote or demote a member of your team",
        description:
          'Takes effect immediately — the target does not need to log out and back in.',
        security: [{ bearerAuth: [] }],
        params: z.object({ userId: z.string() }),
        body: updateMemberBody,
        response: { 200: memberSchema },
      },
    },
    async (req) => {
      const target = await findManageableMember(
        req.auth!.teamId!,
        req.auth!.sub,
        req.params.userId,
      );
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { role: req.body.role },
      });
      return serializeMember(updated);
    },
  );

  r.delete(
    '/members/:userId',
    {
      preHandler: app.requireTeamAdmin,
      schema: {
        tags: ['teams'],
        summary: 'Remove a member from your team',
        description:
          "Keeps their account but detaches it from the team, so their receipts and submitted parts retain their author. They can join another team (or yours again) with an invite code via POST /teams/join. Access is revoked immediately.",
        security: [{ bearerAuth: [] }],
        params: z.object({ userId: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (req, reply) => {
      const target = await findManageableMember(
        req.auth!.teamId!,
        req.auth!.sub,
        req.params.userId,
      );
      await prisma.user.update({
        where: { id: target.id },
        data: { teamId: null, role: 'MEMBER' },
      });
      return reply.status(204).send(null);
    },
  );

  r.post(
    '/join',
    {
      preHandler: app.requireAuth,
      // Invite codes are 8 unambiguous characters — guessable if unmetered.
      config: { rateLimit: { max: env.RATE_LIMIT_AUTH_MAX, timeWindow: '1 minute' } },
      schema: {
        tags: ['teams'],
        summary: 'Join a team with an invite code, using your existing account',
        description:
          'For accounts that do not currently belong to a team. To sign up and join in one step, use POST /auth/join instead. Leave your current team first if you have one.',
        security: [{ bearerAuth: [] }],
        body: joinBody,
        response: { 200: publicTeamSchema },
      },
    },
    async (req) => {
      // Read membership from the database, not the token: someone who was just
      // removed from a team still carries the old teamId until their JWT expires,
      // and rejecting them here would leave them unable to join anywhere.
      const self = await prisma.user.findUnique({
        where: { id: req.auth!.sub },
        select: { teamId: true },
      });
      if (!self) throw notFound('Account no longer exists', 'ACCOUNT_GONE');
      if (self.teamId) {
        throw badRequest('You already belong to a team', 'ALREADY_ON_TEAM');
      }

      const team = await prisma.team.findUnique({
        where: { inviteCode: req.body.inviteCode.toUpperCase() },
      });
      if (!team) throw notFound('No team found for that invite code', 'INVALID_INVITE');

      await prisma.user.update({
        where: { id: req.auth!.sub },
        data: { teamId: team.id },
      });
      return {
        id: team.id,
        number: team.number,
        name: team.name,
        inviteCode: team.inviteCode,
      };
    },
  );

  r.post(
    '/invite-code/rotate',
    {
      preHandler: app.requireTeamAdmin,
      schema: {
        tags: ['teams'],
        summary: 'Issue a new invite code, invalidating the old one',
        description:
          'Use after someone leaves, or if the code was shared more widely than intended.',
        security: [{ bearerAuth: [] }],
        response: { 200: publicTeamSchema },
      },
    },
    async (req) => {
      const teamId = req.auth!.teamId!;

      // Retry on the rare unique collision, same as team creation.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const team = await prisma.team.update({
            where: { id: teamId },
            data: { inviteCode: makeInviteCode() },
          });
          return {
            id: team.id,
            number: team.number,
            name: team.name,
            inviteCode: team.inviteCode,
          };
        } catch (err) {
          if (attempt === 4) throw err;
        }
      }
      throw badRequest('Could not issue a new invite code, please retry', 'ROTATE_FAILED');
    },
  );
};

export default routes;

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { hashPassword, signToken, verifyPassword } from '../../lib/auth.js';
import { makeInviteCode } from '../../lib/inviteCode.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import {
  authResultSchema,
  changePasswordBody,
  createTeamBody,
  joinTeamBody,
  loginBody,
  meResponse,
  publicTeamSchema,
} from './schemas.js';
import type { Team, User } from '@prisma/client';

function toPublicTeam(team: Team) {
  return { id: team.id, number: team.number, name: team.name, inviteCode: team.inviteCode };
}

function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    teamId: user.teamId,
  };
}

/**
 * Credential endpoints get a much tighter per-IP budget than the global one:
 * these are the routes where an attacker guesses (passwords, invite codes)
 * rather than merely reads.
 */
const credentialRateLimit = {
  rateLimit: { max: env.RATE_LIMIT_AUTH_MAX, timeWindow: '1 minute' },
};

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/teams',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Create a new team and its first (admin) member',
        body: createTeamBody,
        response: { 201: authResultSchema },
      },
    },
    async (req, reply) => {
      const { teamNumber, teamName, displayName, email, password } = req.body;

      const [existingTeam, existingUser] = await Promise.all([
        prisma.team.findUnique({ where: { number: teamNumber } }),
        prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
      ]);
      if (existingTeam) throw conflict(`Team ${teamNumber} already exists`, 'TEAM_EXISTS');
      if (existingUser) throw conflict('An account with that email already exists', 'EMAIL_EXISTS');

      const passwordHash = await hashPassword(password);

      // Retry invite-code generation on the rare unique collision.
      let team: Team | null = null;
      for (let attempt = 0; attempt < 5 && !team; attempt++) {
        try {
          team = await prisma.team.create({
            data: { number: teamNumber, name: teamName, inviteCode: makeInviteCode() },
          });
        } catch (err) {
          if (attempt === 4) throw err;
        }
      }
      if (!team) throw conflict('Could not create team, please retry', 'TEAM_CREATE_FAILED');

      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          displayName,
          role: 'TEAM_ADMIN',
          teamId: team.id,
        },
      });

      const token = signToken({
        sub: user.id,
        role: user.role,
        teamId: user.teamId,
        tv: user.tokenVersion,
      });
      return reply.status(201).send({ token, user: toPublicUser(user), team: toPublicTeam(team) });
    },
  );

  r.post(
    '/join',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Join an existing team using its invite code',
        body: joinTeamBody,
        response: { 201: authResultSchema },
      },
    },
    async (req, reply) => {
      const { inviteCode, displayName, email, password } = req.body;

      const team = await prisma.team.findUnique({
        where: { inviteCode: inviteCode.toUpperCase() },
      });
      if (!team) throw notFound('No team found for that invite code', 'INVALID_INVITE');

      const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (existingUser) throw conflict('An account with that email already exists', 'EMAIL_EXISTS');

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash, displayName, role: 'MEMBER', teamId: team.id },
      });

      const token = signToken({
        sub: user.id,
        role: user.role,
        teamId: user.teamId,
        tv: user.tokenVersion,
      });
      return reply.status(201).send({ token, user: toPublicUser(user), team: toPublicTeam(team) });
    },
  );

  r.post(
    '/login',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Log in with email and password',
        body: loginBody,
        response: { 200: authResultSchema },
      },
    },
    async (req) => {
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { team: true },
      });
      if (!user) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');

      const token = signToken({
        sub: user.id,
        role: user.role,
        teamId: user.teamId,
        tv: user.tokenVersion,
      });
      return {
        token,
        user: toPublicUser(user),
        team: user.team ? toPublicTeam(user.team) : null,
      };
    },
  );

  r.get(
    '/me',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Get the current user and their team',
        security: [{ bearerAuth: [] }],
        response: { 200: meResponse },
      },
    },
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.auth!.sub },
        include: { team: true },
      });
      if (!user) throw unauthorized();
      return { user: toPublicUser(user), team: user.team ? toPublicTeam(user.team) : null };
    },
  );

  // Lets a logged-in member look up their team's invite code to share it.
  r.get(
    '/invite-code',
    {
      preHandler: [app.requireAuth, app.requireTeam],
      schema: {
        tags: ['auth'],
        summary: "Get the current team's invite code",
        security: [{ bearerAuth: [] }],
        response: { 200: publicTeamSchema },
      },
    },
    async (req) => {
      const team = await prisma.team.findUnique({ where: { id: req.auth!.teamId! } });
      if (!team) throw notFound('Team not found');
      return toPublicTeam(team);
    },
  );

  r.patch(
    '/password',
    {
      preHandler: app.requireAuth,
      // Guessing `currentPassword` is an attack too.
      config: credentialRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Change your own password',
        description:
          'Requires the current password. Every existing session is revoked, including the token used to make this call — log in again afterwards to get a fresh one.',
        security: [{ bearerAuth: [] }],
        body: changePasswordBody,
        response: { 200: authResultSchema },
      },
    },
    async (req) => {
      const user = await prisma.user.findUnique({
        where: { id: req.auth!.sub },
        include: { team: true },
      });
      if (!user) throw unauthorized();

      const ok = await verifyPassword(req.body.currentPassword, user.passwordHash);
      if (!ok) throw unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');

      // Bumping tokenVersion invalidates every token issued so far, so hand back
      // a freshly-signed one to avoid logging the caller out of their own client.
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(req.body.newPassword),
          tokenVersion: { increment: 1 },
        },
      });

      return {
        token: signToken({
          sub: updated.id,
          role: updated.role,
          teamId: updated.teamId,
          tv: updated.tokenVersion,
        }),
        user: toPublicUser(updated),
        team: user.team ? toPublicTeam(user.team) : null,
      };
    },
  );
};

export default routes;

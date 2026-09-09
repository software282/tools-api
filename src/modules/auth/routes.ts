import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { hashPassword, signToken, verifyPassword } from '../../lib/auth.js';
import { makeInviteCode } from '../../lib/inviteCode.js';
import { serializePublicTeam as toPublicTeam } from '../../lib/serializeTeam.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import {
  authResultSchema,
  changePasswordBody,
  createTeamBody,
  createTeamResponse,
  joinTeamBody,
  loginBody,
  meResponse,
  publicTeamSchema,
  updateProfileBody,
} from './schemas.js';
import type { Team, User } from '@prisma/client';

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
        summary: "Create a new team and get its one-time invite code",
        description:
          'Creates only the Team — no login account, no token. Every person, including ' +
          'whoever calls this, gets their own account the same way everyone else does: ' +
          'POST /auth/join with the returned inviteCode. The first person to join a new ' +
          'team becomes TEAM_ADMIN automatically; everyone after that joins as MEMBER. ' +
          'There is no other way to see this invite code afterward (rotating it requires ' +
          'already being a team admin, which requires already having an account) — the ' +
          'caller MUST show `warning` and have the user save the code before leaving ' +
          'the page.',
        body: createTeamBody,
        response: { 201: createTeamResponse },
      },
    },
    async (req, reply) => {
      const { teamNumber, teamName } = req.body;

      const existingTeam = await prisma.team.findUnique({ where: { number: teamNumber } });
      if (existingTeam) throw conflict(`Team ${teamNumber} already exists`, 'TEAM_EXISTS');

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

      return reply.status(201).send({
        team: toPublicTeam(team),
        warning:
          `Write down this invite code now: ${team.inviteCode}. It will not be shown ` +
          "again, and there is no account or password for this team to log into — " +
          'every member, including you, must join with it via POST /auth/join.',
      });
    },
  );

  r.post(
    '/join',
    {
      config: credentialRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Join an existing team using its invite code',
        description:
          'The usual way to get an account: teams have no login of their own, so this is ' +
          'how every member — including whoever created the team — signs up. The first ' +
          'person to join a brand-new team (0 existing members) becomes TEAM_ADMIN ' +
          'automatically; everyone after that joins as MEMBER.',
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
      // Nobody logs into "the team" — the first person to actually join becomes
      // the admin, and everyone after that is a regular member.
      const memberCount = await prisma.user.count({ where: { teamId: team.id } });
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          displayName,
          role: memberCount === 0 ? 'TEAM_ADMIN' : 'MEMBER',
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

  r.patch(
    '/profile',
    {
      preHandler: app.requireAuth,
      schema: {
        tags: ['auth'],
        summary: 'Update your own display name',
        description:
          'The name shown next to receipts you upload and next to your entry in the team member list. Changes take effect immediately; no re-login needed.',
        security: [{ bearerAuth: [] }],
        body: updateProfileBody,
        response: { 200: meResponse },
      },
    },
    async (req) => {
      const user = await prisma.user.update({
        where: { id: req.auth!.sub },
        data: { displayName: req.body.displayName },
        include: { team: true },
      });
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

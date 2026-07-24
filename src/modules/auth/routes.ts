import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { customAlphabet } from 'nanoid';
import { prisma } from '../../lib/prisma.js';
import { hashPassword, signToken, verifyPassword } from '../../lib/auth.js';
import { conflict, notFound, unauthorized } from '../../lib/errors.js';
import {
  authResultSchema,
  createTeamBody,
  joinTeamBody,
  loginBody,
  meResponse,
  publicTeamSchema,
} from './schemas.js';
import type { Team, User } from '@prisma/client';

// Unambiguous invite codes (no 0/O/1/I/L).
const makeInviteCode = customAlphabet('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 8);

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

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/teams',
    {
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

      const token = signToken({ sub: user.id, role: user.role, teamId: user.teamId });
      return reply.status(201).send({ token, user: toPublicUser(user), team: toPublicTeam(team) });
    },
  );

  r.post(
    '/join',
    {
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

      const token = signToken({ sub: user.id, role: user.role, teamId: user.teamId });
      return reply.status(201).send({ token, user: toPublicUser(user), team: toPublicTeam(team) });
    },
  );

  r.post(
    '/login',
    {
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

      const token = signToken({ sub: user.id, role: user.role, teamId: user.teamId });
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
};

export default routes;

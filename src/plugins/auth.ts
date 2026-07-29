import fp from 'fastify-plugin';
// Only FastifyRequest is imported: inside the `declare module 'fastify'` block
// below, type names resolve against fastify's own scope, so FastifyReply needs
// no import there (and importing it would be an unused local).
import type { FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { verifyToken, type JwtPayload } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: JwtPayload;
  }
  interface FastifyInstance {
    /**
     * preHandler: require a valid, non-revoked JWT whose user still exists.
     * Populates `request.auth` with database-fresh role/team values.
     */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler factory: require the caller to have one of `roles` (checked against the database). */
    requireRole: (
      ...roles: Role[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: require the caller to belong to a team (checked against the database). */
    requireTeam: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: require TEAM_ADMIN (of their own team) or SUPER_ADMIN. */
    requireTeamAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: populate `request.auth` if a valid token is present, else no-op. */
    optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function readBearer(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

async function authenticate(req: FastifyRequest): Promise<JwtPayload> {
  if (req.auth) return req.auth;
  const token = readBearer(req);
  if (!token) throw unauthorized();
  try {
    req.auth = verifyToken(token);
    return req.auth;
  } catch {
    throw unauthorized('Invalid or expired token', 'INVALID_TOKEN');
  }
}

/**
 * Authenticate, then reconcile the token against the database.
 *
 * Tokens live for JWT_EXPIRES_IN (7d by default) and carry a snapshot of the
 * user's role, team, and token version. Verifying the signature alone is not
 * enough:
 *  - `role`/`teamId` are re-read so demoting or removing a member takes effect
 *    immediately, rather than whenever their token happens to expire (otherwise
 *    a removed member keeps team access for up to a week).
 *  - `tokenVersion` is compared so a password change can invalidate every
 *    session that already exists.
 *
 * One primary-key lookup per authenticated request is a cheap price for both.
 */
async function authenticateFresh(req: FastifyRequest): Promise<JwtPayload> {
  const auth = await authenticate(req);
  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { role: true, teamId: true, tokenVersion: true },
  });
  if (!user) throw unauthorized('Account no longer exists', 'ACCOUNT_GONE');
  if (user.tokenVersion !== auth.tv) {
    throw unauthorized('Session has been revoked, please log in again', 'TOKEN_REVOKED');
  }
  req.auth = {
    sub: auth.sub,
    role: user.role,
    teamId: user.teamId,
    tv: user.tokenVersion,
  };
  return req.auth;
}

export default fp(async (app) => {
  app.decorate('requireAuth', async (req: FastifyRequest) => {
    await authenticateFresh(req);
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (req: FastifyRequest) => {
      const auth = await authenticateFresh(req);
      if (!roles.includes(auth.role)) {
        throw forbidden('You do not have permission to perform this action');
      }
    };
  });

  app.decorate('requireTeam', async (req: FastifyRequest) => {
    const auth = await authenticateFresh(req);
    if (!auth.teamId) {
      throw forbidden('You must belong to a team to do this', 'NO_TEAM');
    }
  });

  app.decorate('requireTeamAdmin', async (req: FastifyRequest) => {
    const auth = await authenticateFresh(req);
    if (!auth.teamId) {
      throw forbidden('You must belong to a team to do this', 'NO_TEAM');
    }
    if (auth.role !== 'TEAM_ADMIN' && auth.role !== 'SUPER_ADMIN') {
      throw forbidden('Only a team admin can do this', 'NOT_TEAM_ADMIN');
    }
  });

  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    if (!readBearer(req)) return;
    try {
      // Reconcile against the database as well: a stale teamId here would show
      // the caller another team's `ownedQuantity` on every part.
      await authenticateFresh(req);
    } catch {
      // Any problem with the token means "treat as anonymous", not "fail".
      req.auth = undefined;
    }
  });
});

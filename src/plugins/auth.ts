import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import { verifyToken, type JwtPayload } from '../lib/auth.js';
import { forbidden, unauthorized } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: JwtPayload;
  }
  interface FastifyInstance {
    /** preHandler: require a valid JWT; populates `request.auth`. */
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler factory: require the caller to have one of `roles`. */
    requireRole: (
      ...roles: Role[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: require the caller to belong to a team (populates auth first). */
    requireTeam: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
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

export default fp(async (app) => {
  app.decorate('requireAuth', async (req: FastifyRequest) => {
    await authenticate(req);
  });

  app.decorate('requireRole', (...roles: Role[]) => {
    return async (req: FastifyRequest) => {
      const auth = await authenticate(req);
      if (!roles.includes(auth.role)) {
        throw forbidden('You do not have permission to perform this action');
      }
    };
  });

  app.decorate('requireTeam', async (req: FastifyRequest) => {
    const auth = await authenticate(req);
    if (!auth.teamId) {
      throw forbidden('You must belong to a team to do this', 'NO_TEAM');
    }
  });

  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    const token = readBearer(req);
    if (!token) return;
    try {
      req.auth = verifyToken(token);
    } catch {
      // Ignore invalid tokens for optional auth; treat as anonymous.
    }
  });
});

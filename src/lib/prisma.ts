import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Single shared PrismaClient. In dev, `tsx watch` reloads modules on change;
 * caching the client on `globalThis` prevents exhausting the DB connection pool
 * with a new client per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

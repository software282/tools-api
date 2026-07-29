import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Replaces the deprecated `prisma` key in package.json, which Prisma 7 removes.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});

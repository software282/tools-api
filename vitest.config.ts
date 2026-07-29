import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Set before dotenv loads .env (which does not override existing values), so
    // buildServer picks the silent-logger branch.
    env: { NODE_ENV: 'test' },
    // Route tests build a Fastify instance; keep them off each other's ports by
    // never listening (app.inject only) and running files sequentially.
    fileParallelism: false,
  },
});

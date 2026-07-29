import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import { env } from '../src/config/env.js';

/**
 * Own app instance: rate-limit counters live on the server, so hammering a route
 * here would otherwise use up the budget other suites rely on.
 */
describe('rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = () =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever' },
    });

  it('limits credential endpoints and keeps the standard error envelope', async () => {
    // Spend the whole credential budget. These fail for other reasons (no
    // database) but still consume the allowance, which is the point.
    for (let i = 0; i < env.RATE_LIMIT_AUTH_MAX; i++) {
      const res = await login();
      expect(res.statusCode).not.toBe(429);
    }

    const limited = await login();
    expect(limited.statusCode).toBe(429);

    // The regression this guards: the plugin's response goes through
    // setErrorHandler, which flattened a plain object into a generic
    // INTERNAL_ERROR and lost the code.
    expect(limited.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.stringContaining('Too many requests') },
    });
  });

  it('keeps a separate budget per route, so a hot login does not lock out reads', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

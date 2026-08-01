import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

/**
 * Contract-level checks that need no database.
 *
 * Everything here resolves before a handler touches Postgres — schema validation
 * runs at preValidation, and missing/!invalid tokens are rejected before the user
 * lookup. That makes these the parts of the contract the frontend can rely on
 * even while Supabase is unprovisioned. Anything requiring real rows is out of
 * scope for this file by design.
 */
describe('API contract', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a health check', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('publishes the OpenAPI document without a database', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);

    const spec = res.json();
    expect(spec.openapi).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(20);
    // Spot-check the routes a UI cannot be built without.
    expect(spec.paths['/api/v1/auth/login']).toBeDefined();
    expect(spec.paths['/api/v1/teams/members']).toBeDefined();
    // Both receipt entry points: pasting is the common case, upload the fallback.
    expect(spec.paths['/api/v1/receipts'].post).toBeDefined();
    expect(spec.paths['/api/v1/receipts/upload'].post).toBeDefined();
    // One call for a home screen, so a dashboard need not fan out.
    expect(spec.paths['/api/v1/dashboard'].get).toBeDefined();
  });

  // The receipts bucket is private, because order confirmations carry a name and
  // shipping address. The contract must therefore never hand back a URL a caller
  // could keep: `hasFile` plus a signed-link endpoint replaces it.
  it('exposes no durable file URL, only a signed-link endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/openapi.json' });
    const spec = res.json();

    expect(JSON.stringify(spec)).not.toContain('fileUrl');
    expect(JSON.stringify(spec)).toContain('hasFile');
    expect(spec.paths['/api/v1/receipts/{id}/file'].get).toBeDefined();
  });

  describe('error envelope', () => {
    it('uses { error: { code, message } } for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) },
      });
    });

    it('uses the same envelope for validation failures', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'not-an-email' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('uses the same envelope for auth failures', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/inventory' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('authentication', () => {
    // Body-schema validation runs at preValidation, ahead of the auth preHandler,
    // so routes with a required body need a *valid* payload here — otherwise they
    // 400 on the schema and never reach the check being tested.
    const protectedRoutes: Array<[string, string, object | undefined]> = [
      ['GET', '/api/v1/inventory', undefined],
      ['GET', '/api/v1/receipts', undefined],
      ['GET', '/api/v1/receipts/some-id/file', undefined],
      ['GET', '/api/v1/teams/members', undefined],
      ['GET', '/api/v1/teams/current', undefined],
      ['GET', '/api/v1/auth/me', undefined],
      ['GET', '/api/v1/dashboard', undefined],
      ['GET', '/api/v1/admin/submissions', undefined],
      ['DELETE', '/api/v1/parts/some-id', undefined],
      ['DELETE', '/api/v1/inventory/some-id', undefined],
      ['DELETE', '/api/v1/teams/members/some-id', undefined],
      ['POST', '/api/v1/teams/invite-code/rotate', undefined],
      [
        'POST',
        '/api/v1/parts',
        {
          name: 'Custom Bracket',
          productUrl: 'https://example.com/bracket',
          manufacturerId: 'm1',
          categoryId: 'c1',
        },
      ],
      ['PATCH', '/api/v1/parts/some-id', { name: 'Renamed Bracket' }],
      ['PATCH', '/api/v1/teams/current', { name: 'Seattle Solvers' }],
      ['PATCH', '/api/v1/teams/members/some-id', { role: 'TEAM_ADMIN' }],
      ['POST', '/api/v1/teams/join', { inviteCode: 'ABCD2345' }],
      ['PATCH', '/api/v1/auth/password', { currentPassword: 'a', newPassword: 'long-enough-pw' }],
      [
        'POST',
        '/api/v1/receipts',
        { vendor: 'GOBILDA', text: 'goBILDA order confirmation 5203-2402-0027 $86.00' },
      ],
    ];

    it.each(protectedRoutes)('rejects %s %s without a token', async (method, url, payload) => {
      const res = await app.inject({ method: method as 'GET', url, payload });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBeDefined();
    });

    it('rejects a malformed token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer not-a-real-jwt' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_TOKEN');
    });

    it('ignores a non-bearer authorization scheme', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('public routes', () => {
    it('allows anonymous part search (it will fail on the database, not on auth)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/parts' });
      expect(res.statusCode).not.toBe(401);
    });

    it('treats a trailing slash as the same route', async () => {
      const withSlash = await app.inject({ method: 'GET', url: '/api/v1/parts/' });
      const without = await app.inject({ method: 'GET', url: '/api/v1/parts' });
      expect(withSlash.statusCode).toBe(without.statusCode);
    });
  });

  describe('request validation', () => {
    it('rejects a part with no productUrl', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/parts',
        headers: { authorization: 'Bearer not-a-real-jwt' },
        payload: { name: 'Bracket', manufacturerId: 'm1', categoryId: 'c1' },
      });
      // Validation runs before auth, so the schema error surfaces first.
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty part update', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/parts/some-id',
        headers: { authorization: 'Bearer not-a-real-jwt' },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a too-short password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/teams',
        payload: {
          teamNumber: 12345,
          teamName: 'Seattle Solvers',
          displayName: 'George',
          email: 'george@example.com',
          password: 'short',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a pasted receipt that is too short to be a real confirmation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/receipts',
        headers: { authorization: 'Bearer not-a-real-jwt' },
        payload: { vendor: 'GOBILDA', text: 'too short' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an unknown vendor on a pasted receipt', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/receipts',
        headers: { authorization: 'Bearer not-a-real-jwt' },
        payload: {
          vendor: 'NOT_A_VENDOR',
          text: 'goBILDA order confirmation 5203-2402-0027 $86.00',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a non-numeric team number', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/teams',
        payload: {
          teamNumber: 'not-a-number',
          teamName: 'Seattle Solvers',
          displayName: 'George',
          email: 'george@example.com',
          password: 'a-long-enough-password',
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('security headers', () => {
    it('sets helmet headers on responses', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });
});

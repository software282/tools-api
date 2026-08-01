import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { corsOrigins, env } from './config/env.js';
import { AppError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';

import authRoutes from './modules/auth/routes.js';
import catalogRoutes from './modules/catalog/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import partsRoutes from './modules/parts/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import receiptRoutes from './modules/receipts/routes.js';
import teamRoutes from './modules/teams/routes.js';
import adminRoutes from './modules/admin/routes.js';

export async function buildServer() {
  const app = Fastify({
    // Collection routes are registered as '/' under a prefix, so the generated
    // OpenAPI paths carry a trailing slash. Treat both forms as equivalent so a
    // client calling /api/v1/parts never 404s.
    routerOptions: { ignoreTrailingSlash: true },
    // Silent under test: these suites deliberately exercise failure paths, and
    // logging each one buries the actual results.
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.NODE_ENV === 'development' ? 'info' : 'warn',
            transport:
              env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
          },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod as the validation + serialization engine.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // No CSP: the only HTML this service serves is the dev-only Swagger UI, and a
  // restrictive policy breaks its inline bootstrap for no security gain on JSON.
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, { origin: corsOrigins });
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB receipt images
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Return an AppError rather than a plain body: the plugin routes this through
    // setErrorHandler, which would otherwise flatten a plain object into a
    // generic INTERNAL_ERROR and lose the code. Going through AppError keeps 429s
    // in the same `{ error: { code, message } }` envelope as every other failure.
    errorResponseBuilder: (_req, context) =>
      new AppError(
        429,
        'RATE_LIMITED',
        `Too many requests. Try again in ${Math.ceil(context.ttl / 1000)}s.`,
      ),
  });

  // OpenAPI docs — the contract the future frontend consumes.
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Seattle Solvers Tools API',
        description:
          'FTC parts inventory, search, and receipt reading for tools.seattlesolvers.',
        version: '0.1.0',
      },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  // The machine-readable contract is always available; this is what the frontend
  // consumes, and what `npm run openapi` writes to disk.
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  // The browsable UI is development-only, and @fastify/swagger-ui is a
  // devDependency: it pulls in @fastify/static, which has an unpatched
  // path-traversal advisory (GHSA-83w8-p2f5-377r) with no fix available. Keeping
  // it out of `dependencies` means the vulnerable code is not installed in
  // production at all, rather than merely left unrouted.
  if (env.NODE_ENV !== 'production') {
    try {
      const { default: swaggerUi } = await import('@fastify/swagger-ui');
      await app.register(swaggerUi, { routePrefix: '/docs' });
    } catch {
      // Absent in a production-only install. The spec is still at /openapi.json.
      app.log.warn('@fastify/swagger-ui not installed; skipping /docs');
    }
  }

  await app.register(authPlugin);

  // Consistent error shape for the frontend.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          issues: error.issues,
        },
      });
    }
    // Fastify's own validation errors carry a `validation` array.
    if ((error as { validation?: unknown }).validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          issues: (error as { validation?: unknown }).validation,
        },
      });
    }
    request.log.error(error);
    return reply
      .status(error.statusCode ?? 500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
  });

  // Fastify's built-in 404 does not go through setErrorHandler, so without this
  // an unknown route is the one response that breaks the error envelope.
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    }),
  );

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Feature modules, all under /api/v1.
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(catalogRoutes);
      await api.register(dashboardRoutes, { prefix: '/dashboard' });
      await api.register(partsRoutes, { prefix: '/parts' });
      await api.register(inventoryRoutes, { prefix: '/inventory' });
      await api.register(receiptRoutes, { prefix: '/receipts' });
      await api.register(teamRoutes, { prefix: '/teams' });
      await api.register(adminRoutes, { prefix: '/admin' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only listen when this file is the process entrypoint. Importing it (tests, the
// OpenAPI export script) must build the app without binding a port.
const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entrypoint === import.meta.url) {
  main();
}

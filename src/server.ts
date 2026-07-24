import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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
import partsRoutes from './modules/parts/routes.js';
import inventoryRoutes from './modules/inventory/routes.js';
import receiptRoutes from './modules/receipts/routes.js';
import adminRoutes from './modules/admin/routes.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
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

  await app.register(cors, { origin: corsOrigins });
  await app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB receipt images
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
  await app.register(swaggerUi, { routePrefix: '/docs' });

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

  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  // Feature modules, all under /api/v1.
  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(catalogRoutes);
      await api.register(partsRoutes, { prefix: '/parts' });
      await api.register(inventoryRoutes, { prefix: '/inventory' });
      await api.register(receiptRoutes, { prefix: '/receipts' });
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

// Only start the server when run directly (not when imported by tests).
main();

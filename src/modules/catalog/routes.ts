import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  sort: z.number().int(),
});

const manufacturerSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  websiteUrl: z.string().nullable(),
  vendor: z.string().nullable(),
});

const routes = async (app: FastifyInstance) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/categories',
    {
      schema: {
        tags: ['catalog'],
        summary: 'List all part categories',
        response: { 200: z.array(categorySchema) },
      },
    },
    async () => prisma.category.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
  );

  r.get(
    '/manufacturers',
    {
      schema: {
        tags: ['catalog'],
        summary: 'List all manufacturers',
        response: { 200: z.array(manufacturerSchema) },
      },
    },
    async () => prisma.manufacturer.findMany({ orderBy: { name: 'asc' } }),
  );
};

export default routes;

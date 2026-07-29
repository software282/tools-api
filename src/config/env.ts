import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralized, validated environment configuration.
 * Import `env` anywhere instead of reading `process.env` directly so that a
 * missing/invalid variable fails fast at boot with a clear message.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('*'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_RECEIPTS_BUCKET: z.string().default('receipts'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_RECEIPT_MODEL: z.string().default('claude-opus-5'),

  OCR_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(100).default(70),

  // Requests per minute per IP. The auth limit is deliberately much lower:
  // /auth/login is the one endpoint where guessing is the attack.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
  // Receipt intake is the costliest work in the service — PDF parsing, OCR, and
  // potentially a Claude call per request. Generous for a team reconciling an
  // order, far below what it takes to run up a bill.
  RATE_LIMIT_RECEIPT_MAX: z.coerce.number().int().positive().default(30),

  SUPER_ADMIN_EMAIL: z.string().email().default('software@seattlesolvers.com'),
  // Deliberately no default and no length rule here: the API never reads this,
  // only `npm run seed` does, and a strength check at boot would stop the server
  // from starting over a value it doesn't use. prisma/seed.ts enforces the
  // minimum length at the point where the account is actually created.
  SUPER_ADMIN_PASSWORD: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins =
  env.CORS_ORIGINS === '*'
    ? true
    : env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);

/** Whether the Claude receipt-vision fallback is configured and usable. */
export const claudeEnabled = Boolean(env.ANTHROPIC_API_KEY);

/** Whether Supabase Storage is configured (needed to persist receipt images). */
export const supabaseStorageEnabled = Boolean(
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
);

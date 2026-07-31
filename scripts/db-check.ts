/**
 * Preflight check for the Supabase setup. Run with `npm run db:check`.
 *
 * Exists because the raw failures here are opaque: Prisma reports P1000/P1001 for
 * everything from a typo'd password to an IPv6-only host your network cannot
 * reach, and Supabase Storage fails silently until the first receipt upload. This
 * turns each into a specific thing to go fix.
 *
 * Read-only — it never writes to the database.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

type Status = 'ok' | 'warn' | 'fail';
const results: Array<{ status: Status; label: string; detail?: string }> = [];

const record = (status: Status, label: string, detail?: string) =>
  results.push({ status, label, detail });

function checkEnv(): boolean {
  const url = process.env.DATABASE_URL;
  const direct = process.env.DIRECT_URL;

  if (!url) {
    record('fail', 'DATABASE_URL is not set', 'Copy .env.example to .env and fill it in.');
    return false;
  }

  // The placeholder that ships in .env.example, and the most common "I forgot".
  if (/@localhost|@127\.0\.0\.1/.test(url)) {
    record(
      'fail',
      'DATABASE_URL still points at localhost',
      'This is the placeholder value. Paste your Supabase connection string from ' +
        'Project → Connect. Prefer the pooler host (…pooler.supabase.com) over ' +
        'db.<ref>.supabase.co, which is IPv6-only without the IPv4 add-on.',
    );
    return false;
  }

  if (looksLikePlaceholder(url) || /PASSWORD@/.test(url)) {
    record('fail', 'DATABASE_URL still contains template placeholders', 'Substitute the real values.');
    return false;
  }

  record('ok', 'DATABASE_URL is set');

  // Transaction-mode pooling needs pgbouncer=true, or Prisma's prepared
  // statements break in ways that look like random query failures later.
  if (url.includes(':6543') && !url.includes('pgbouncer=true')) {
    record(
      'warn',
      'Port 6543 (transaction pooler) without pgbouncer=true',
      'Append ?pgbouncer=true&connection_limit=1 or queries may fail intermittently.',
    );
  }

  if (!direct) {
    record(
      'warn',
      'DIRECT_URL is not set',
      'Migrations run through DATABASE_URL, which fails on a transaction pooler. ' +
        'Set DIRECT_URL to the session pooler (port 5432) or the direct connection.',
    );
  } else if (direct.includes(':6543')) {
    record(
      'warn',
      'DIRECT_URL points at the transaction pooler (6543)',
      'Migrations need a session connection. Use port 5432.',
    );
  } else {
    record('ok', 'DIRECT_URL is set');
  }

  return true;
}

async function checkDatabase() {
  const prisma = new PrismaClient({ log: [] });
  try {
    await prisma.$queryRaw`SELECT 1`;
    record('ok', 'Database connection succeeded');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('P1000') || /authentication failed/i.test(message)) {
      record('fail', 'Database rejected the credentials', 'Check the password in the connection string.');
    } else if (message.includes('P1001') || /reach database server/i.test(message)) {
      record(
        'fail',
        'Could not reach the database host',
        'Usually IPv6: db.<ref>.supabase.co has no IPv4 address unless you add it. ' +
          'Use the pooler host (…pooler.supabase.com) instead.',
      );
    } else {
      record('fail', 'Database connection failed', message.split('\n')[0]);
    }
    await prisma.$disconnect().catch(() => {});
    return;
  }

  // Schema applied? A missing table means migrate has not run.
  try {
    const teams = await prisma.team.count();
    record('ok', `Schema is applied (${teams} team${teams === 1 ? '' : 's'})`);

    const [categories, manufacturers, parts, admins] = await Promise.all([
      prisma.category.count(),
      prisma.manufacturer.count(),
      prisma.part.count(),
      prisma.user.count({ where: { role: 'SUPER_ADMIN' } }),
    ]);

    if (categories === 0 && manufacturers === 0 && parts === 0) {
      record('warn', 'Database is empty', 'Run `npm run seed`.');
    } else {
      record(
        'ok',
        `Seed data present (${categories} categories, ${manufacturers} manufacturers, ${parts} parts)`,
      );
    }

    if (admins === 0) {
      record(
        'warn',
        'No SUPER_ADMIN exists',
        'Nobody can review part submissions. Set SUPER_ADMIN_PASSWORD (12+ chars) and run `npm run seed`.',
      );
    } else {
      record('ok', `SUPER_ADMIN exists (${admins})`);
    }
  } catch {
    record('fail', 'Schema is not applied', 'Run `npx prisma migrate dev --name init`.');
  }

  await prisma.$disconnect().catch(() => {});
}

/**
 * Catch values that were never filled in.
 *
 * Deliberately broad: template files use all of these words, and a half-edited
 * `.env` is far more common than a subtly wrong one. Reporting a placeholder is
 * much clearer than the network error it would otherwise become.
 */
function looksLikePlaceholder(value: string): boolean {
  return /example\.|project[-_]?ref|your[-_]|replace|change[-_]?me|placeholder|xxx|<.*>|\[.*\]/i.test(
    value,
  );
}

async function checkStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_RECEIPTS_BUCKET ?? 'receipts';

  if (!url || !key) {
    record(
      'warn',
      'Supabase Storage is not configured',
      'Receipts still parse, but uploaded files will not be kept. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
    return;
  }

  if (looksLikePlaceholder(url)) {
    record(
      'fail',
      'SUPABASE_URL is still a placeholder',
      'Copy the Project URL from Supabase → Settings → API.',
    );
    return;
  }

  // Both the legacy JWT keys (eyJ…) and the newer sb_secret_… format are valid.
  if (!/^(eyJ|sb_secret_)/.test(key) || key.length < 20) {
    record(
      'fail',
      'SUPABASE_SERVICE_ROLE_KEY does not look like a real key',
      'Copy the service_role (secret) key from Supabase → Settings → API. It is not the anon key.',
    );
    return;
  }

  const anon = process.env.SUPABASE_ANON_KEY ?? '';
  if (anon && !/^(eyJ|sb_publishable_)/.test(anon)) {
    record(
      'warn',
      'SUPABASE_ANON_KEY does not look like a real key',
      'Unused by this API today, but worth fixing before a frontend needs it.',
    );
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      record('fail', 'Could not list storage buckets', `${error.message} — is the service-role key right?`);
      return;
    }

    if (data?.some((b) => b.name === bucket)) {
      record('ok', `Storage bucket "${bucket}" exists`);
    } else {
      record(
        'fail',
        `Storage bucket "${bucket}" does not exist`,
        `Create it in Supabase → Storage, or point SUPABASE_RECEIPTS_BUCKET at an existing bucket. ` +
          `Found: ${data?.map((b) => b.name).join(', ') || 'none'}`,
      );
    }
  } catch (err) {
    record('fail', 'Storage check failed', err instanceof Error ? err.message : String(err));
  }
}

const ICON: Record<Status, string> = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' };

async function main() {
  console.log('\nChecking Supabase setup...\n');

  if (checkEnv()) {
    await checkDatabase();
    await checkStorage();
  }

  for (const { status, label, detail } of results) {
    console.log(`  [${ICON[status]}] ${label}`);
    if (detail) console.log(`         ${detail}`);
  }

  const failures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;

  console.log(
    `\n${failures} failing, ${warnings} warning${warnings === 1 ? '' : 's'}, ` +
      `${results.filter((r) => r.status === 'ok').length} ok\n`,
  );

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Writes the OpenAPI document to `openapi.json` without starting a server.
 *
 * This is the contract handed to the frontend: it needs no database and no
 * running process, so a UI can be designed against the API before Supabase is
 * provisioned. Run with `npm run openapi`.
 */
import { writeFile } from 'node:fs/promises';
import { buildServer } from '../src/server.js';

const OUTPUT = 'openapi.json';

async function main() {
  const app = await buildServer();
  // Routes are registered asynchronously; swagger() only sees them once the
  // plugin tree has finished booting.
  await app.ready();

  const spec = app.swagger();
  await writeFile(OUTPUT, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  await app.close();

  const paths = Object.keys((spec as { paths?: Record<string, unknown> }).paths ?? {});
  process.stdout.write(`Wrote ${OUTPUT} (${paths.length} paths)\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err instanceof Error ? err.stack : err)}\n`);
  process.exit(1);
});

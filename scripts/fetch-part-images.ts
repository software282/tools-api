/**
 * Fills in `Part.imageUrl` by reading the `og:image` tag from each part's own
 * product page. Run with `npm run images`.
 *
 * A parts catalogue is mostly pictures, and the seed data ships product URLs but
 * no images. Rather than hand-collecting 47 of them, this reads the image each
 * vendor already publishes for that exact product.
 *
 * Deliberately polite: one request at a time with a delay, since these are other
 * people's servers and this is a tool that sends them business. It is also
 * idempotent — parts that already have an image are skipped, so a re-run only
 * fills gaps.
 *
 * Note this stores the vendor's CDN URL rather than copying the file. Images stay
 * current if a vendor updates them, at the cost of breaking if one reorganises
 * their store. Re-run this to repair that; `--force` re-fetches everything.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DELAY_MS = 400;
const TIMEOUT_MS = 20000;
const force = process.argv.includes('--force');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull og:image out of a product page, tolerating either attribute order. */
function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

async function main() {
  // A placeholder counts as still-missing: re-running should try to upgrade it
  // to a real product image, not skip it as already done.
  const stillNeedsOne = {
    OR: [{ imageUrl: null }, { imageUrl: { startsWith: 'data:' } }],
  };

  const parts = await prisma.part.findMany({
    where: { productUrl: { not: null }, ...(force ? {} : stillNeedsOne) },
    select: { id: true, name: true, productUrl: true, manufacturer: { select: { slug: true } } },
    orderBy: { name: 'asc' },
  });

  if (parts.length === 0) {
    console.log('Every part already has a real image. Use --force to re-fetch.');
    return;
  }

  console.log(`Fetching images for ${parts.length} part(s)...\n`);
  let found = 0;
  const failures: Array<{ name: string; reason: string }> = [];

  for (const part of parts) {
    try {
      const res = await fetch(part.productUrl!, {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; seattlesolvers-tools/0.1)' },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        failures.push({ name: part.name, reason: 'HTTP ' + res.status });
      } else {
        const image = extractOgImage(await res.text());
        if (!image) {
          failures.push({ name: part.name, reason: 'no og:image tag' });
        } else {
          await prisma.part.update({ where: { id: part.id }, data: { imageUrl: image } });
          found++;
          console.log(`  ok    ${part.manufacturer.slug.padEnd(15)} ${part.name.slice(0, 52)}`);
        }
      }
    } catch (err) {
      failures.push({ name: part.name, reason: err instanceof Error ? err.message : String(err) });
    }
    await sleep(DELAY_MS);
  }

  if (failures.length > 0) {
    console.log('\nCould not resolve an image for:');
    for (const f of failures) console.log(`  --    ${f.name.slice(0, 52)}  (${f.reason})`);
  }

  const total = await prisma.part.count();
  const real = await prisma.part.count({
    where: { imageUrl: { not: null }, NOT: { imageUrl: { startsWith: 'data:' } } },
  });
  const placeholders = await prisma.part.count({ where: { imageUrl: { startsWith: 'data:' } } });
  console.log(
    `\n${found} fetched this run. ${real}/${total} parts have a real image` +
      (placeholders ? `, ${placeholders} on the placeholder.` : '.'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Backfills `Part.lastKnownPrice` for GLOBAL catalog parts by reading each
 * product page's own price meta tags.
 *
 * Only GLOBAL parts are touched: per the pricing model, the shared library
 * carries one canonical price everyone sees, while a team's own custom parts
 * keep whatever price that team set. Only parts with no price yet are
 * fetched, so this is cheap to re-run and resumes where it left off — which
 * matters, because at goBILDA's published 10s crawl-delay for bots a full
 * pass is roughly 4-5 hours.
 *
 * Writes each price the moment it's found rather than batching at the end:
 * a long crawl will get interrupted eventually, and partial results are
 * immediately useful.
 *
 *   npx tsx scripts/scrape-prices.ts            # fill in missing prices
 *   npx tsx scripts/scrape-prices.ts --force    # re-fetch even priced parts
 *   npx tsx scripts/scrape-prices.ts --limit=20 # short trial run
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const REQUEST_DELAY_MS = 10_000;
const TIMEOUT_MS = 30_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; SeattleSolversToolsBot/1.0; +https://tools.seattlesolvers.com; software@seattlesolvers.com)';

const force = process.argv.includes('--force');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pull a unit price out of a product page.
 *
 * Ordered most- to least-trustworthy. The og/product and schema.org meta
 * tags are machine-readable contracts meant for exactly this, so they beat
 * scraping a rendered "$54.99" out of the markup — which on these stores can
 * just as easily be a shipping threshold, a related product, or a sale
 * banner.
 */
export function extractPrice(html: string): number | null {
  const patterns = [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([\d.]+)["']/i,
    /<meta[^>]+content=["']([\d.]+)["'][^>]+property=["']product:price:amount["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([\d.]+)["']/i,
    /"price"\s*:\s*"([\d.]+)"/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const value = Number(m[1]);
      // A zero or absurd figure means the page didn't really carry a price
      // (out-of-stock placeholders render as 0.00) — treat it as unknown
      // rather than writing a wrong number into everyone's expense totals.
      if (Number.isFinite(value) && value > 0 && value < 100_000) return value;
    }
  }
  return null;
}

async function fetchPage(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt < 3) {
      await sleep(REQUEST_DELAY_MS);
      return fetchPage(url, attempt + 1);
    }
    console.error(`  ! giving up: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  const parts = await prisma.part.findMany({
    where: {
      scope: 'GLOBAL',
      productUrl: { not: null },
      ...(force ? {} : { lastKnownPrice: null }),
    },
    select: { id: true, name: true, sku: true, productUrl: true },
    orderBy: { name: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`${parts.length} part(s) to price. ~${((parts.length * REQUEST_DELAY_MS) / 3_600_000).toFixed(1)}h at a ${REQUEST_DELAY_MS / 1000}s crawl delay.\n`);

  let found = 0;
  let missing = 0;

  for (const [i, part] of parts.entries()) {
    const html = await fetchPage(part.productUrl!);
    const price = html ? extractPrice(html) : null;

    if (price !== null) {
      await prisma.part.update({ where: { id: part.id }, data: { lastKnownPrice: price } });
      found++;
      console.log(`[${i + 1}/${parts.length}] $${price.toFixed(2)}  ${part.sku ?? '—'}  ${part.name.slice(0, 60)}`);
    } else {
      missing++;
      console.log(`[${i + 1}/${parts.length}] no price   ${part.sku ?? '—'}  ${part.name.slice(0, 60)}`);
    }

    if (i < parts.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nDone. ${found} priced, ${missing} without a usable price.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

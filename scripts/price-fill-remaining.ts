/**
 * Last-resort pricing for the catalog rows that neither pricing pass could
 * reach: goBILDA "landing" pages that list sub-categories rather than product
 * cards (e.g. /spacers/, /brackets/, /servo-hubs/), and a few Amazon listings
 * that bot-block. These rows stand for a family or are nav cross-links, not a
 * single SKU, so there is no one true price to fetch.
 *
 * Fallback: the MEDIAN lastKnownPrice of the parts already priced in the same
 * category — i.e. "what a typical part in this category costs". Purely a
 * fallback-of-a-fallback for GET /expenses; a real receipt always overrides it.
 *
 *   npx tsx scripts/price-fill-remaining.ts --dry
 *   npx tsx scripts/price-fill-remaining.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const dry = process.argv.includes('--dry');

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const remaining = await prisma.part.findMany({
    where: { scope: 'GLOBAL', productUrl: { not: null }, lastKnownPrice: null },
    select: { id: true, name: true, categoryId: true, category: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });

  console.log(`${remaining.length} still unpriced${dry ? ' — DRY RUN' : ''}\n`);

  // category median from the already-priced GLOBAL parts
  const priced = await prisma.part.findMany({
    where: { scope: 'GLOBAL', lastKnownPrice: { not: null } },
    select: { categoryId: true, lastKnownPrice: true },
  });
  const byCat = new Map<string, number[]>();
  for (const p of priced) {
    const arr = byCat.get(p.categoryId) ?? [];
    arr.push(Number(p.lastKnownPrice));
    byCat.set(p.categoryId, arr);
  }

  let done = 0;
  for (const part of remaining) {
    const pool = byCat.get(part.categoryId) ?? [];
    if (pool.length < 3) {
      console.log(`  SKIP  ${part.name} — only ${pool.length} priced in ${part.category.name}`);
      continue;
    }
    const price = round2(median(pool));
    if (!dry) {
      await prisma.part.update({ where: { id: part.id }, data: { lastKnownPrice: price } });
    }
    done++;
    console.log(
      `  $${price.toFixed(2).padStart(8)}  (${part.category.name} median, n=${pool.length})  ${part.name.slice(0, 55)}`,
    );
  }

  console.log(`\n${dry ? 'Would fill' : 'Filled'} ${done}/${remaining.length}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

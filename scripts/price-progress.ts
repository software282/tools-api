/**
 * Progress of the price backfill, read from the database rather than a log
 * file — the scrape can be stopped and resumed (and its log path changes each
 * time), but the count of priced parts is the same fact either way.
 *
 *   npx tsx scripts/price-progress.ts
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const total = await prisma.part.count({ where: { scope: 'GLOBAL', productUrl: { not: null } } });
const priced = await prisma.part.count({
  where: { scope: 'GLOBAL', productUrl: { not: null }, lastKnownPrice: { not: null } },
});
const remaining = total - priced;

console.log(
  `${((priced / total) * 100).toFixed(1)}% — ${priced}/${total} priced, ${remaining} to go, ~${((remaining * 10) / 3600).toFixed(1)}h left`,
);

await prisma.$disconnect();

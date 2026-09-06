/**
 * Creates expense entries for stock a team already holds but never had priced.
 *
 * Expense rows are normally written at the moment a quantity goes up. Anything
 * acquired before that part had a `lastKnownPrice` — which, before the price
 * scrape, was every one of the 1,726 catalogue parts — produced no row and
 * never will, because the increase already happened. Without this, a team
 * finishes the price backfill and still sees an empty expenses dashboard
 * despite owning priced stock.
 *
 * Idempotent by construction: it compares what the ledger already accounts for
 * against what the team actually holds and only fills the gap, so running it
 * twice is a no-op and it can safely run again after future price scrapes.
 *
 * Entries are ESTIMATED, never RECEIPT — the price is today's catalogue price,
 * not what the team actually paid at the time, and the dashboard's
 * `allExact: false` flag should keep saying so.
 *
 *   npx tsx scripts/backfill-inventory-expenses.ts --dry-run   # preview only
 *   npx tsx scripts/backfill-inventory-expenses.ts             # write
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const rows = await prisma.inventoryItem.findMany({
    where: { quantity: { gt: 0 }, part: { lastKnownPrice: { not: null } } },
    include: {
      part: { select: { id: true, name: true, lastKnownPrice: true } },
      team: { select: { number: true } },
    },
  });

  console.log(`${rows.length} inventory row(s) with stock and a known price.${dryRun ? '  [DRY RUN]' : ''}\n`);

  let created = 0;
  let skipped = 0;
  let totalValue = 0;

  for (const row of rows) {
    // What the ledger already accounts for, so a part bought through a
    // receipt isn't counted a second time here.
    const recorded = await prisma.expenseEntry.aggregate({
      where: { teamId: row.teamId, partId: row.partId },
      _sum: { quantity: true },
    });
    const alreadyRecorded = recorded._sum.quantity ?? 0;
    const gap = row.quantity - alreadyRecorded;

    if (gap <= 0) {
      skipped++;
      continue;
    }

    const unitCost = Number(row.part.lastKnownPrice);
    const totalCost = unitCost * gap;
    totalValue += totalCost;

    console.log(
      ` #${row.team.number} | +${gap} @ $${unitCost.toFixed(2)} = $${totalCost.toFixed(2)} | ${row.part.name.slice(0, 50)}`,
    );

    if (!dryRun) {
      await prisma.expenseEntry.create({
        data: {
          teamId: row.teamId,
          partId: row.partId,
          quantity: gap,
          unitCost,
          totalCost,
          source: 'ESTIMATED',
        },
      });
    }
    created++;
  }

  console.log(
    `\n${dryRun ? 'Would create' : 'Created'} ${created} entr${created === 1 ? 'y' : 'ies'} worth $${totalValue.toFixed(2)}. ` +
      `${skipped} row(s) already fully accounted for.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

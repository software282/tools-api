import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Vendor } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { standardParts, type SeedPart } from './data.js';
import { pickBestNameMatch, sameNumericSpec, sameQualifiers, type NameCandidate } from '../src/services/nameMatch.js';

const prisma = new PrismaClient();
const dataDir = path.dirname(fileURLToPath(import.meta.url));

// Fixed category list (slug is the stable key the API filters on).
const CATEGORIES: Array<{ slug: string; name: string; sort: number }> = [
  { slug: 'motors', name: 'Motors', sort: 10 },
  { slug: 'servos', name: 'Servos', sort: 20 },
  { slug: 'electronics', name: 'Electronics', sort: 30 },
  { slug: 'motion', name: 'Motion', sort: 40 },
  { slug: 'wheels', name: 'Wheels', sort: 50 },
  { slug: 'shafts', name: 'Shafts', sort: 60 },
  { slug: 'shaft-attachments', name: 'Shaft Attachments', sort: 70 },
  { slug: 'belts', name: 'Belts', sort: 80 },
  { slug: 'structure', name: 'Structure', sort: 85 },
  { slug: 'hardware', name: 'Hardware', sort: 90 },
  { slug: 'tools', name: 'Tools', sort: 95 },
  { slug: 'kits', name: 'Kits & Bundles', sort: 97 },
  { slug: 'misc', name: 'Misc', sort: 100 },
];

/** Shape written by scripts/scrape-gobilda.ts and the manually-compiled REV Duo list. */
interface ScrapedPart {
  sku: string | null;
  name: string;
  productUrl: string;
  imageUrl: string | null;
  ourCategory: string;
}

/** Loads a scraped-catalog JSON file if present; missing files just contribute nothing. */
function loadScrapedParts(fileName: string, manufacturerSlug: string): SeedPart[] {
  const filePath = path.join(dataDir, 'data', fileName);
  let raw: ScrapedPart[];
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(`  ! ${fileName} not found — skipping (see scripts/scrape-gobilda.ts)`);
    return [];
  }
  return raw.map((p) => ({
    manufacturerSlug,
    name: p.name,
    sku: p.sku,
    category: p.ourCategory,
    productUrl: p.productUrl,
    imageUrl: p.imageUrl ?? undefined,
  }));
}

// Manufacturers and their mapping to the receipt Vendor enum.
const MANUFACTURERS: Array<{
  slug: string;
  name: string;
  websiteUrl: string;
  vendor: Vendor;
}> = [
  // Merged with ServoCity (same parent company, heavy catalog overlap) into
  // one manufacturer/brand entry — see HANDOFF.md. Slug and `vendor` stay
  // 'gobilda'/'GOBILDA' on purpose: this upserts the existing row in place
  // rather than creating a new one, so every Part/InventoryItem/ExpenseEntry
  // FK pointing at it is untouched, and existing goBILDA-format receipt
  // parsing (keyed on the Vendor enum, not this name) keeps working as-is.
  { slug: 'gobilda', name: 'ServoCity/GoBilda', websiteUrl: 'https://www.gobilda.com', vendor: 'GOBILDA' },
  { slug: 'rev', name: 'REV Robotics', websiteUrl: 'https://www.revrobotics.com', vendor: 'REV' },
  { slug: 'axon', name: 'Axon Robotics', websiteUrl: 'https://axon-robotics.com', vendor: 'AXON' },
  { slug: 'ferra', name: 'Ferra Components', websiteUrl: 'https://ferracomponents.com', vendor: 'FERRA' },
  { slug: 'melonbotics', name: 'MelonBotics', websiteUrl: 'https://www.melonbotics.com', vendor: 'MELONBOTICS' },
  { slug: 'offsetrobotics', name: 'Offset Robotics', websiteUrl: 'https://www.offsetrobotics.com', vendor: 'OFFSET' },
  { slug: 'mata', name: 'MATA Robotics', websiteUrl: 'https://www.matarobotics.net', vendor: 'MATA' },
  { slug: 'uxcell', name: 'uxcell', websiteUrl: 'https://www.uxcell.com', vendor: 'UXCELL' },
];

async function seedCategories() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, sort: c.sort },
    });
  }
  console.log(`  categories: ${CATEGORIES.length}`);
}

async function seedManufacturers() {
  for (const m of MANUFACTURERS) {
    await prisma.manufacturer.upsert({
      where: { slug: m.slug },
      create: m,
      update: { name: m.name, websiteUrl: m.websiteUrl, vendor: m.vendor },
    });
  }
  console.log(`  manufacturers: ${MANUFACTURERS.length}`);
}

async function seedSuperAdmin() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? 'software@seattlesolvers.com').toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Re-seed: only ensure the role. Never touch an existing admin's password.
    await prisma.user.update({ where: { email }, data: { role: 'SUPER_ADMIN' } });
    console.log(`  super admin: ${email} (already existed, role ensured)`);
    return;
  }

  // First seed: refuse to create the account that can approve parts for every
  // team unless a real password was supplied. A default here would ship a known
  // credential to production.
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD must be set to at least 12 characters to create the ' +
        `super admin account (${email}). Set it in .env and re-run the seed.`,
    );
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      displayName: 'Seattle Solvers Admin',
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`  super admin: ${email} (created)`);
}

// Chunk size for createMany — keeps each round trip well under the pooler's
// statement-size limits while still cutting thousands of inserts down to a
// handful of queries.
const CREATE_BATCH_SIZE = 250;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Seeds the catalog. Deliberately two strategies, not one, because the two
 * data sources have very different sizes and idempotency needs:
 *  - `standardParts` (~50 hand-curated entries) get a per-row find-then-
 *    upsert, since their description/image text is edited over time and a
 *    re-run should pick up those edits.
 *  - The scraped goBILDA/REV catalogs (~1,700 entries) are create-only: a
 *    single findMany builds an in-memory "already seeded" set, then new rows
 *    go in via chunked `createMany`. A per-row findFirst+create loop over
 *    that many rows is what disconnected mid-run against Supabase's pooler
 *    the first time this ran — bulk inserts also just do the same job in a
 *    few queries instead of ~3,400.
 */
async function seedParts() {
  const categories = await prisma.category.findMany();
  const manufacturers = await prisma.manufacturer.findMany();
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const mfrBySlug = new Map(manufacturers.map((m) => [m.slug, m.id]));

  function resolve(part: SeedPart) {
    const manufacturerId = mfrBySlug.get(part.manufacturerSlug);
    const categoryId = catBySlug.get(part.category);
    if (!manufacturerId) {
      console.warn(`  ! skipping "${part.name}" — unknown manufacturer ${part.manufacturerSlug}`);
      return null;
    }
    if (!categoryId) {
      console.warn(`  ! skipping "${part.name}" — unknown category ${part.category}`);
      return null;
    }
    return {
      name: part.name,
      sku: part.sku ?? null,
      description: part.description ?? null,
      productUrl: part.productUrl,
      purchaseUrl: part.purchaseUrl ?? part.productUrl,
      imageUrl: part.imageUrl ?? null,
      manufacturerId,
      categoryId,
      scope: 'GLOBAL' as const,
      status: 'APPROVED' as const,
    };
  }

  // --- Curated list: small, so a per-row upsert (with edits applying on
  // re-run) is cheap enough. ---
  let curatedCreated = 0;
  let curatedUpdated = 0;
  for (const part of standardParts as SeedPart[]) {
    const data = resolve(part);
    if (!data) continue;

    const existing = await prisma.part.findFirst({
      where: {
        manufacturerId: data.manufacturerId,
        scope: 'GLOBAL',
        ...(data.sku ? { sku: data.sku } : { name: data.name }),
      },
    });
    if (existing) {
      await prisma.part.update({ where: { id: existing.id }, data });
      curatedUpdated++;
    } else {
      await prisma.part.create({ data });
      curatedCreated++;
    }
  }
  console.log(`  curated parts: ${curatedCreated} created, ${curatedUpdated} updated`);

  // --- Scraped catalogs: bulk create-only. ---
  const scraped = [
    ...loadScrapedParts('gobilda-parts.json', 'gobilda'),
    ...loadScrapedParts('rev-duo-parts.json', 'rev'),
    ...loadScrapedParts('servocity-parts.json', 'gobilda'),
  ];

  const existingGlobal = await prisma.part.findMany({
    where: { scope: 'GLOBAL', manufacturerId: { in: [...mfrBySlug.values()] } },
    select: { id: true, manufacturerId: true, sku: true, name: true, imageUrl: true },
  });
  const existingKeys = new Set(existingGlobal.map((p) => `${p.manufacturerId}::${p.sku ?? p.name}`));

  // Fuzzy cross-catalog dedup (goBILDA/ServoCity merged into one manufacturer
  // — see HANDOFF.md): an exact key match above already caught literal
  // SKU/name collisions; this catches the same physical part listed under a
  // *different* SKU/name on each site, using the same fuzzy-match logic
  // (src/services/nameMatch.ts) findLikelyDuplicateGlobalPart already uses
  // for this exact purpose elsewhere. Auto-skip + log, per George: the
  // scraped duplicate is never created, its imageUrl backfills the
  // surviving row if that row didn't have one, and every skip is written to
  // prisma/data/dedup-report.md so a wrong match is easy to spot and reverse.
  const candidatesByManufacturer = new Map<string, NameCandidate[]>();
  const imageByCandidateId = new Map<string, string | null>();
  for (const p of existingGlobal) {
    if (!candidatesByManufacturer.has(p.manufacturerId)) candidatesByManufacturer.set(p.manufacturerId, []);
    candidatesByManufacturer.get(p.manufacturerId)!.push({ id: p.id, name: p.name });
    imageByCandidateId.set(p.id, p.imageUrl);
  }

  interface DedupSkip {
    scrapedName: string;
    scrapedSku: string | null;
    matchedId: string;
    matchedName: string;
    confidence: number;
    backfilledImage: boolean;
  }
  const dedupSkips: DedupSkip[] = [];
  const imageBackfills = new Map<string, string>(); // existing part id -> imageUrl to set

  const toCreate = [];
  for (const part of scraped) {
    const data = resolve(part);
    if (!data) continue;
    const key = `${data.manufacturerId}::${data.sku ?? data.name}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key); // guards against duplicate SKUs within the scraped set itself

    const candidates = candidatesByManufacturer.get(data.manufacturerId) ?? [];
    const nameMatch = pickBestNameMatch(data.name, candidates);
    // A name match alone isn't enough — see sameNumericSpec's own comment:
    // "280mm Pitch Length, 140 Tooth" vs "184mm Pitch Length, 92 Tooth" score
    // as near-identical by word overlap despite being different SKUs. Both
    // gates must agree before this counts as a real duplicate.
    const match =
      nameMatch &&
      sameNumericSpec(data.name, candidates.find((c) => c.id === nameMatch.id)!.name) &&
      sameQualifiers(data.name, candidates.find((c) => c.id === nameMatch.id)!.name)
        ? nameMatch
        : null;
    if (match) {
      // Only a match against a real, already-persisted row is backfillable —
      // `match.id` may instead be a same-batch scraped part that hasn't been
      // created yet (see the toCreate-registration comment below), and
      // there's no row to update() in that case.
      const matchesRealRow = imageByCandidateId.has(match.id);
      const backfillImage = matchesRealRow && !imageByCandidateId.get(match.id) && Boolean(data.imageUrl);
      if (backfillImage) imageBackfills.set(match.id, data.imageUrl!);
      dedupSkips.push({
        scrapedName: data.name,
        scrapedSku: data.sku,
        matchedId: match.id,
        matchedName: candidates.find((c) => c.id === match.id)!.name,
        confidence: match.confidence,
        backfilledImage: backfillImage,
      });
      continue;
    }

    // Register as a candidate too, so a second near-duplicate later in this
    // same scraped batch (not just against what was already in the DB) also
    // gets caught, rather than only checking against pre-existing rows.
    if (!candidatesByManufacturer.has(data.manufacturerId)) candidatesByManufacturer.set(data.manufacturerId, []);
    candidatesByManufacturer.get(data.manufacturerId)!.push({ id: key, name: data.name });
    toCreate.push(data);
  }

  for (const batch of chunk(toCreate, CREATE_BATCH_SIZE)) {
    await prisma.part.createMany({ data: batch });
  }
  for (const [partId, imageUrl] of imageBackfills) {
    await prisma.part.update({ where: { id: partId }, data: { imageUrl } });
  }
  console.log(
    `  scraped parts: ${toCreate.length} created, ${scraped.length - toCreate.length - dedupSkips.length} already present, ` +
      `${dedupSkips.length} skipped as likely duplicates (${imageBackfills.size} backfilled an image) (${scraped.length} in data set)`,
  );

  if (dedupSkips.length) {
    const lines = [
      '# Dedup report',
      '',
      `Generated ${new Date().toISOString()} by \`npm run seed\`.`,
      '',
      '| scraped name | scraped sku | matched existing part | confidence | image backfilled? |',
      '| --- | --- | --- | --- | --- |',
      ...dedupSkips.map(
        (s) =>
          `| ${s.scrapedName} | ${s.scrapedSku ?? ''} | ${s.matchedName} (\`${s.matchedId}\`) | ${s.confidence} | ${s.backfilledImage ? 'yes' : 'no'} |`,
      ),
      '',
    ];
    writeFileSync(path.join(dataDir, 'data', 'dedup-report.md'), lines.join('\n'));
    console.log(`  dedup report: prisma/data/dedup-report.md (${dedupSkips.length} skips)`);
  }
}

async function main() {
  console.log('Seeding Seattle Solvers Tools API…');
  await seedCategories();
  await seedManufacturers();
  await seedSuperAdmin();
  await seedParts();
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

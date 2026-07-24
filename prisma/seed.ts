import 'dotenv/config';
import { PrismaClient, type Vendor } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { standardParts, type SeedPart } from './data.js';

const prisma = new PrismaClient();

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
  { slug: 'hardware', name: 'Hardware', sort: 90 },
  { slug: 'misc', name: 'Misc', sort: 100 },
];

// Manufacturers and their mapping to the receipt Vendor enum.
const MANUFACTURERS: Array<{
  slug: string;
  name: string;
  websiteUrl: string;
  vendor: Vendor;
}> = [
  { slug: 'gobilda', name: 'goBILDA', websiteUrl: 'https://www.gobilda.com', vendor: 'GOBILDA' },
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
  const password = process.env.SUPER_ADMIN_PASSWORD ?? 'change-me';
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, displayName: 'Seattle Solvers Admin', role: 'SUPER_ADMIN' },
    // Don't clobber an existing admin's password on re-seed; just ensure the role.
    update: { role: 'SUPER_ADMIN' },
  });
  console.log(`  super admin: ${email}`);
}

async function seedParts() {
  const categories = await prisma.category.findMany();
  const manufacturers = await prisma.manufacturer.findMany();
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const mfrBySlug = new Map(manufacturers.map((m) => [m.slug, m.id]));

  let created = 0;
  let updated = 0;

  for (const part of standardParts as SeedPart[]) {
    const manufacturerId = mfrBySlug.get(part.manufacturerSlug);
    const categoryId = catBySlug.get(part.category);
    if (!manufacturerId) {
      console.warn(`  ! skipping "${part.name}" — unknown manufacturer ${part.manufacturerSlug}`);
      continue;
    }
    if (!categoryId) {
      console.warn(`  ! skipping "${part.name}" — unknown category ${part.category}`);
      continue;
    }

    // Idempotent key: SKU within manufacturer when present, else name.
    const existing = await prisma.part.findFirst({
      where: {
        manufacturerId,
        scope: 'GLOBAL',
        ...(part.sku ? { sku: part.sku } : { name: part.name }),
      },
    });

    const data = {
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

    if (existing) {
      await prisma.part.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.part.create({ data });
      created++;
    }
  }
  console.log(`  parts: ${created} created, ${updated} updated (${standardParts.length} in data set)`);
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

/**
 * Crawls goBILDA's public catalog and writes every SKU it finds to
 * prisma/data/gobilda-parts.json, in SeedPart shape (see prisma/data.ts).
 *
 * goBILDA's robots.txt names Claude-Web/ClaudeBot/anthropic-ai explicitly and
 * sets `Crawl-delay: 10` for that bot group; REQUEST_DELAY_MS honors that for
 * every request this script makes, not just ones matching those user-agents
 * literally. Product/category pages are not disallowed.
 *
 * Structure discovered by hand (see conversation): the top-level category
 * pages (e.g. /motors) list either real product cards
 * (`data-card-type="product"`, one per SKU, with a real detail-page href,
 * data-sku, title, and image) or category cards
 * (`data-card-type="category"`, linking to a "family" page like
 * /yellow-jacket-planetary-gear-motors that itself lists product cards).
 * This crawls breadth-first from a fixed list of top-level category slugs
 * (scraped from the site's own nav) until only product cards remain.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crawlCatalog } from './lib/catalogCrawl.js';

const BASE_URL = 'https://www.gobilda.com';
const MAX_DEPTH = 4;

// Every non-utility link from goBILDA's global nav (present on every page),
// captured 2026-09-03. Utility/marketing pages (education, support, policies,
// merch, distributors, etc.) are excluded — they carry no parts.
//
// Gap-fill (2026-09-11, see scripts/discover-categories.ts /
// prisma/data/category-audit.md): the 2026-09-03 list was hand-transcribed
// from the site's nav and missed several real categories entirely — most
// notably `timing-belts-pulleys`, which is almost certainly the bulk of
// goBILDA's pulley SKUs (the sibling `round-belts-pulleys` was already here,
// this one just never got copied down). Marked inline below.
const TOP_CATEGORIES: Array<{ slug: string; ourCategory: string }> = [
  // Motors / servos
  { slug: 'motors', ourCategory: 'motors' },
  { slug: 'servos', ourCategory: 'servos' },
  { slug: 'linear-servos-1', ourCategory: 'servos' },
  { slug: 'linear-servos', ourCategory: 'servos' }, // gap-fill: distinct URL from linear-servos-1
  { slug: 'see-also-motors-1', ourCategory: 'motors' },
  { slug: 'see-also-servos-1', ourCategory: 'servos' },
  // Wheels
  { slug: 'wheels-tires', ourCategory: 'wheels' },
  { slug: 'tracks', ourCategory: 'wheels' },
  { slug: 'intake-wheels', ourCategory: 'wheels' }, // gap-fill
  // Motion
  { slug: 'gears', ourCategory: 'motion' },
  { slug: 'sprockets-chain', ourCategory: 'motion' },
  { slug: 'cable-pulleys', ourCategory: 'motion' },
  { slug: 'bearings', ourCategory: 'motion' },
  { slug: 'lead-screws', ourCategory: 'motion' },
  { slug: 'linear-motion-guides', ourCategory: 'motion' },
  { slug: 'linear-slides', ourCategory: 'motion' },
  { slug: 'linear-motion-kits', ourCategory: 'motion' },
  { slug: 'linkages-threaded-rods', ourCategory: 'motion' },
  { slug: 'm4-ball-linkages-2', ourCategory: 'motion' },
  { slug: 'm4-threaded-rods-2', ourCategory: 'motion' },
  { slug: 'odometry', ourCategory: 'motion' },
  { slug: 'motion-bundles', ourCategory: 'motion' },
  { slug: 'control-arms', ourCategory: 'motion' }, // gap-fill
  // Belts
  { slug: 'round-belts-pulleys', ourCategory: 'belts' },
  { slug: 'timing-belts-pulleys', ourCategory: 'belts' }, // gap-fill: the "missing pulleys"
  // Shafts / shaft attachments
  { slug: 'shafting-tubing', ourCategory: 'shafts' },
  { slug: 'shafting-tubing-1', ourCategory: 'shafts' },
  { slug: 'shaft-spacers-shims', ourCategory: 'shaft-attachments' },
  { slug: 'shaft-spacers-shims-1', ourCategory: 'shaft-attachments' },
  { slug: 'collars', ourCategory: 'shaft-attachments' },
  { slug: 'collars-1', ourCategory: 'shaft-attachments' },
  { slug: 'couplers', ourCategory: 'shaft-attachments' },
  { slug: 'hubs', ourCategory: 'shaft-attachments' },
  { slug: 'cv-universal-joints', ourCategory: 'shaft-attachments' }, // gap-fill
  // Structure
  { slug: 'channel', ourCategory: 'structure' },
  { slug: 'beams', ourCategory: 'structure' },
  { slug: 'baseplates', ourCategory: 'structure' },
  { slug: 'grid-plates', ourCategory: 'structure' },
  { slug: 'brackets', ourCategory: 'structure' },
  { slug: 'mounts', ourCategory: 'structure' },
  { slug: 'clamping-mounts', ourCategory: 'structure' },
  { slug: 'hinges', ourCategory: 'structure' },
  { slug: 'hinges-1', ourCategory: 'structure' },
  { slug: 'hinges-2', ourCategory: 'structure' },
  { slug: 'threaded-plates', ourCategory: 'structure' },
  { slug: 'threaded-plates-1', ourCategory: 'structure' },
  { slug: 'pattern-plates', ourCategory: 'structure' },
  { slug: 'pattern-adaptors', ourCategory: 'structure' },
  { slug: 'pattern-spacers', ourCategory: 'structure' },
  { slug: 'hole-reducers', ourCategory: 'structure' },
  { slug: 'standoffs-spacers', ourCategory: 'structure' },
  { slug: 'standoffs-spacers-1', ourCategory: 'structure' },
  { slug: 'standoffs-spacers-3', ourCategory: 'structure' },
  { slug: 'structure-bundles', ourCategory: 'structure' },
  { slug: 'shocks', ourCategory: 'structure' },
  { slug: 'springs', ourCategory: 'structure' },
  { slug: 'gorail', ourCategory: 'structure' }, // gap-fill
  // Electronics
  { slug: 'batteries', ourCategory: 'electronics' },
  { slug: 'motor-controllers-1', ourCategory: 'electronics' },
  { slug: 'power-distribution-boards', ourCategory: 'electronics' },
  { slug: 'voltage-regulators-becs', ourCategory: 'electronics' },
  { slug: 'switches', ourCategory: 'electronics' },
  { slug: 'lights', ourCategory: 'electronics' },
  { slug: 'transmitters-receivers', ourCategory: 'electronics' },
  { slug: 'servo-programmers-1', ourCategory: 'electronics' },
  { slug: 'signal-mixers', ourCategory: 'electronics' },
  { slug: 'wire-management-1', ourCategory: 'electronics' },
  { slug: 'wiring', ourCategory: 'electronics' },
  { slug: 'cable', ourCategory: 'electronics' },
  { slug: 'control-bundles', ourCategory: 'electronics' },
  { slug: 'sensors', ourCategory: 'electronics' }, // gap-fill
  { slug: 'cameras', ourCategory: 'electronics' }, // gap-fill
  { slug: 'fuses', ourCategory: 'electronics' }, // gap-fill
  // Hardware
  { slug: 'screws', ourCategory: 'hardware' },
  { slug: 'washers', ourCategory: 'hardware' },
  { slug: 'magnets', ourCategory: 'hardware' },
  { slug: 'lubricants', ourCategory: 'hardware' },
  { slug: 'thread-locker', ourCategory: 'hardware' },
  { slug: 'rubber-feet', ourCategory: 'hardware' },
  { slug: 'grommets', ourCategory: 'hardware' },
  { slug: 'ptfe-tubing', ourCategory: 'hardware' },
  { slug: 'nuts', ourCategory: 'hardware' }, // gap-fill
  { slug: 'wire-management', ourCategory: 'hardware' }, // gap-fill (distinct from wire-management-1 above)
  { slug: 'hardware-bundles', ourCategory: 'hardware' },
  // Tools
  { slug: 'tools', ourCategory: 'tools' },
  // Kits / bundles
  { slug: 'pan-kits', ourCategory: 'kits' },
  { slug: 'chassis-kits', ourCategory: 'kits' },
  { slug: 'ftc-kits', ourCategory: 'kits' },
  { slug: 'bundles', ourCategory: 'kits' },
];

async function main() {
  const outDir = path.resolve(import.meta.dirname, '../prisma/data');
  const outFile = path.join(outDir, 'gobilda-parts.json');

  // Checkpoint to a local temp path, not prisma/data directly: this repo can
  // live inside a OneDrive-synced folder, and a burst of rapid rewrites to
  // the same cloud-synced file (several small categories checkpointing
  // within seconds of each other) has been observed to lose a race with
  // OneDrive's sync engine — the process finishes and logs the true final
  // count, but the file on disk silently reverts to an earlier, smaller
  // snapshot with no error. One single write to the real path at the end
  // avoids that failure mode.
  const checkpointFile = path.join(tmpdir(), 'seattle-solvers-scrape-gobilda-checkpoint.json');

  const parts = await crawlCatalog({
    baseUrl: BASE_URL,
    topCategories: TOP_CATEGORIES,
    maxDepth: MAX_DEPTH,
    onCheckpoint: (parts) => writeFileSync(checkpointFile, JSON.stringify([...parts.values()], null, 2)),
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify([...parts.values()], null, 2));
  console.log(`\nDone. ${parts.size} unique SKUs written to prisma/data/gobilda-parts.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

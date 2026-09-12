/**
 * Crawls ServoCity's public catalog and writes every SKU it finds to
 * prisma/data/servocity-parts.json, in SeedPart shape (see prisma/data.ts).
 * Same crawl (`crawlCatalog` in ./lib/catalogCrawl.ts) as
 * scrape-gobilda.ts — ServoCity runs the identical BigCommerce
 * theme/markup (confirmed by hand: same `navPages-action` top nav, same
 * `data-card-type` card attributes, same `Crawl-delay: 10` robots.txt
 * policy for AI bots) — only the base URL and category list differ.
 *
 * TOP_CATEGORIES here was built from scripts/discover-categories.ts's
 * output (prisma/data/category-audit.md / category-audit-servocity.json):
 * slugs shared with goBILDA reuse goBILDA's `ourCategory` mapping from
 * scrape-gobilda.ts (e.g. `motors`, `gears`, `collars`); slugs unique to
 * ServoCity's own nav (e.g. `extrusion`, `block-mounts`,
 * `linear-motion-for-t-slot-extrusion`) were mapped by hand from their
 * sibling categories on the same top-nav page. See HANDOFF.md.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crawlCatalog } from './lib/catalogCrawl.js';

const BASE_URL = 'https://www.servocity.com';
const MAX_DEPTH = 4;

const TOP_CATEGORIES: Array<{ slug: string; ourCategory: string }> = [
  // Motors / servos
  { slug: 'motors', ourCategory: 'motors' },
  { slug: 'servos', ourCategory: 'servos' },
  // Wheels
  { slug: 'wheels-tires', ourCategory: 'wheels' },
  { slug: 'tracks', ourCategory: 'wheels' },
  { slug: 'intake-wheels', ourCategory: 'wheels' },
  // Motion
  { slug: 'gears', ourCategory: 'motion' },
  { slug: 'sprockets-chain', ourCategory: 'motion' },
  { slug: 'cable-pulleys', ourCategory: 'motion' },
  { slug: 'bearings', ourCategory: 'motion' },
  { slug: 'lead-screws', ourCategory: 'motion' },
  { slug: 'linear-slides', ourCategory: 'motion' },
  { slug: 'linear-motion-kits', ourCategory: 'motion' },
  { slug: 'linkages-threaded-rods', ourCategory: 'motion' },
  { slug: 'odometry', ourCategory: 'motion' },
  { slug: 'motion-bundles', ourCategory: 'motion' },
  { slug: 'control-arms', ourCategory: 'motion' },
  { slug: 'linear-motion-for-t-slot-extrusion', ourCategory: 'motion' },
  { slug: 'linear-motion-for-channel', ourCategory: 'motion' },
  { slug: 'linear-motion-for-v-guide', ourCategory: 'motion' },
  { slug: 'linear-bearings', ourCategory: 'motion' },
  // Belts
  { slug: 'timing-belts-pulleys', ourCategory: 'belts' },
  { slug: 'o-ring-belts-pulleys', ourCategory: 'belts' },
  // Shafts / shaft attachments
  { slug: 'shafting', ourCategory: 'shafts' },
  { slug: 'shaft-spacers-shims', ourCategory: 'shaft-attachments' },
  { slug: 'collars', ourCategory: 'shaft-attachments' },
  { slug: 'couplers', ourCategory: 'shaft-attachments' },
  { slug: 'hubs', ourCategory: 'shaft-attachments' },
  { slug: 'cv-universal-joints', ourCategory: 'shaft-attachments' },
  // Structure
  { slug: 'channel', ourCategory: 'structure' },
  { slug: 'beams', ourCategory: 'structure' },
  { slug: 'grid-plates', ourCategory: 'structure' },
  { slug: 'brackets', ourCategory: 'structure' },
  { slug: 'clamping-mounts', ourCategory: 'structure' },
  { slug: 'hinges', ourCategory: 'structure' },
  { slug: 'pattern-plates', ourCategory: 'structure' },
  { slug: 'pattern-spacers', ourCategory: 'structure' },
  { slug: 'hole-reducers', ourCategory: 'structure' },
  { slug: 'standoffs-spacers', ourCategory: 'structure' },
  { slug: 'structure-bundles', ourCategory: 'structure' },
  { slug: 'shocks', ourCategory: 'structure' },
  { slug: 'springs', ourCategory: 'structure' },
  { slug: 'extrusion', ourCategory: 'structure' },
  { slug: 'tubing', ourCategory: 'structure' },
  { slug: 'block-mounts', ourCategory: 'structure' },
  { slug: 'pattern-mounts', ourCategory: 'structure' },
  { slug: 'motor-mounts', ourCategory: 'structure' },
  { slug: 'servos-accessories', ourCategory: 'structure' },
  { slug: 'linear-actuator-mounts', ourCategory: 'structure' },
  { slug: 'round-baseplates', ourCategory: 'structure' },
  { slug: 'adaptors', ourCategory: 'structure' },
  { slug: 'screw-plates', ourCategory: 'structure' },
  // Electronics
  { slug: 'batteries', ourCategory: 'electronics' },
  { slug: 'power-distribution-boards', ourCategory: 'electronics' },
  { slug: 'voltage-regulators-becs', ourCategory: 'electronics' },
  { slug: 'lights', ourCategory: 'electronics' },
  { slug: 'transmitters-receivers', ourCategory: 'electronics' },
  { slug: 'signal-mixers', ourCategory: 'electronics' },
  { slug: 'wiring', ourCategory: 'electronics' },
  { slug: 'control-bundles', ourCategory: 'electronics' },
  { slug: 'sensors', ourCategory: 'electronics' },
  { slug: 'cameras', ourCategory: 'electronics' },
  { slug: 'fuses', ourCategory: 'electronics' },
  { slug: 'joysticks-potentiometers', ourCategory: 'electronics' },
  { slug: 'switches-relays', ourCategory: 'electronics' },
  { slug: 'battery-trays-mounts', ourCategory: 'electronics' },
  { slug: 'battery-chargers', ourCategory: 'electronics' },
  { slug: 'battery-testers', ourCategory: 'electronics' },
  { slug: 'power-supplies', ourCategory: 'electronics' },
  { slug: 'microcontrollers', ourCategory: 'electronics' },
  { slug: 'mounts-for-electronics', ourCategory: 'electronics' },
  // Hardware
  { slug: 'screws', ourCategory: 'hardware' },
  { slug: 'washers', ourCategory: 'hardware' },
  { slug: 'magnets', ourCategory: 'hardware' },
  { slug: 'lubricants', ourCategory: 'hardware' },
  { slug: 'thread-locker', ourCategory: 'hardware' },
  { slug: 'rubber-feet', ourCategory: 'hardware' },
  { slug: 'grommets', ourCategory: 'hardware' },
  { slug: 'ptfe-tubing', ourCategory: 'hardware' },
  { slug: 'hardware-bundles', ourCategory: 'hardware' },
  { slug: 'nuts', ourCategory: 'hardware' },
  { slug: 'retaining-rings', ourCategory: 'hardware' },
  { slug: 'synthetic-cable', ourCategory: 'hardware' },
  { slug: 'rubber-edging', ourCategory: 'hardware' },
  { slug: 'abs-sheets', ourCategory: 'hardware' },
  { slug: 'rubber-tubing-cord', ourCategory: 'hardware' },
  { slug: 'cinch-straps', ourCategory: 'hardware' },
  { slug: 'debris-shields', ourCategory: 'hardware' },
  // Tools
  { slug: 'tools', ourCategory: 'tools' },
  // Kits / bundles
  { slug: 'ftc-kits', ourCategory: 'kits' },
  { slug: 'robot-chassis-kits', ourCategory: 'kits' },
  { slug: 'gripper-kits', ourCategory: 'kits' },
  { slug: 'pan-tilt-kits', ourCategory: 'kits' },
];

async function main() {
  const outDir = path.resolve(import.meta.dirname, '../prisma/data');
  const outFile = path.join(outDir, 'servocity-parts.json');

  // Checkpoint to a local temp path, not prisma/data directly: this repo can
  // live inside a OneDrive-synced folder, and a burst of rapid rewrites to
  // the same cloud-synced file (several small categories checkpointing
  // within seconds of each other) has been observed to lose a race with
  // OneDrive's sync engine — the process finishes and logs the true final
  // count, but the file on disk silently reverts to an earlier, smaller
  // snapshot with no error. One single write to the real path at the end
  // avoids that failure mode.
  const checkpointFile = path.join(tmpdir(), 'seattle-solvers-scrape-servocity-checkpoint.json');

  const parts = await crawlCatalog({
    baseUrl: BASE_URL,
    topCategories: TOP_CATEGORIES,
    maxDepth: MAX_DEPTH,
    onCheckpoint: (parts) => writeFileSync(checkpointFile, JSON.stringify([...parts.values()], null, 2)),
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify([...parts.values()], null, 2));
  console.log(`\nDone. ${parts.size} unique SKUs written to prisma/data/servocity-parts.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

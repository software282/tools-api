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
import path from 'node:path';

const REQUEST_DELAY_MS = 10_000;
const MAX_DEPTH = 4;
const USER_AGENT =
  'Mozilla/5.0 (compatible; SeattleSolversToolsBot/1.0; +https://tools.seattlesolvers.com; software@seattlesolvers.com)';

// Every non-utility link from goBILDA's global nav (present on every page),
// captured 2026-09-03. Utility/marketing pages (education, support, policies,
// merch, distributors, etc.) are excluded — they carry no parts.
const TOP_CATEGORIES: Array<{ slug: string; ourCategory: string }> = [
  // Motors / servos
  { slug: 'motors', ourCategory: 'motors' },
  { slug: 'servos', ourCategory: 'servos' },
  { slug: 'linear-servos-1', ourCategory: 'servos' },
  { slug: 'see-also-motors-1', ourCategory: 'motors' },
  { slug: 'see-also-servos-1', ourCategory: 'servos' },
  // Wheels
  { slug: 'wheels-tires', ourCategory: 'wheels' },
  { slug: 'tracks', ourCategory: 'wheels' },
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
  // Belts
  { slug: 'round-belts-pulleys', ourCategory: 'belts' },
  // Shafts / shaft attachments
  { slug: 'shafting-tubing', ourCategory: 'shafts' },
  { slug: 'shafting-tubing-1', ourCategory: 'shafts' },
  { slug: 'shaft-spacers-shims', ourCategory: 'shaft-attachments' },
  { slug: 'shaft-spacers-shims-1', ourCategory: 'shaft-attachments' },
  { slug: 'collars', ourCategory: 'shaft-attachments' },
  { slug: 'collars-1', ourCategory: 'shaft-attachments' },
  { slug: 'couplers', ourCategory: 'shaft-attachments' },
  { slug: 'hubs', ourCategory: 'shaft-attachments' },
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
  // Tools
  { slug: 'tools', ourCategory: 'tools' },
  // Kits / bundles
  { slug: 'pan-kits', ourCategory: 'kits' },
  { slug: 'chassis-kits', ourCategory: 'kits' },
  { slug: 'ftc-kits', ourCategory: 'kits' },
  { slug: 'bundles', ourCategory: 'kits' },
];

interface RawPart {
  sku: string;
  name: string;
  productUrl: string;
  imageUrl: string | null;
  ourCategory: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt < 3) {
      console.warn(`  retrying ${url} (attempt ${attempt + 1}) after error: ${(err as Error).message}`);
      await sleep(REQUEST_DELAY_MS);
      return fetchPage(url, attempt + 1);
    }
    console.error(`  giving up on ${url}: ${(err as Error).message}`);
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseAttrs(tagAttrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagAttrString))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/** Extract every `<a ...>...</a>` "card" block (non-nested in this markup). */
function extractCards(html: string): Array<{ attrs: Record<string, string>; body: string }> {
  const cards: Array<{ attrs: Record<string, string>; body: string }> = [];
  const re = /<a\s+([^>]*data-card-type="[^"]+"[^>]*)>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    cards.push({ attrs: parseAttrs(m[1]), body: m[2] });
  }
  return cards;
}

function firstImageSrc(body: string): string | null {
  // Prefer the non-loading.svg data-src (BigCommerce lazyload), else plain src.
  const dataSrc = body.match(/data-src="([^"]+)"/);
  if (dataSrc && !dataSrc[1].includes('loading.svg')) return dataSrc[1];
  const src = body.match(/\bsrc="([^"]+)"/);
  if (src && !src[1].includes('loading.svg')) return src[1];
  return dataSrc ? dataSrc[1] : null;
}

async function crawlCategory(
  rawUrl: string,
  ourCategory: string,
  depth: number,
  visited: Set<string>,
  out: Map<string, RawPart>,
): Promise<void> {
  // Category cards sometimes link with a relative path and/or a page-section
  // anchor (e.g. "/foo/#conversion-kits") — normalize so both resolve to the
  // same page and the visited-set actually dedupes it.
  const url = new URL(rawUrl, 'https://www.gobilda.com').toString().split('#')[0];
  if (visited.has(url) || depth > MAX_DEPTH) return;
  visited.add(url);

  console.log(`${'  '.repeat(depth)}fetching (${ourCategory}) ${url}`);
  const html = await fetchPage(url);
  await sleep(REQUEST_DELAY_MS);
  if (!html) return;

  const cards = extractCards(html);
  const subCategories: string[] = [];

  for (const { attrs, body } of cards) {
    if (attrs['data-card-type'] === 'product') {
      const sku = attrs['data-sku']?.trim();
      const href = attrs['href'];
      const title = attrs['title'] ? decodeEntities(attrs['title']) : null;
      if (!sku || !href || !title) continue;
      if (!out.has(sku)) {
        out.set(sku, {
          sku,
          name: title,
          productUrl: href,
          imageUrl: firstImageSrc(body),
          ourCategory,
        });
      }
    } else if (attrs['data-card-type'] === 'category' && attrs['href']) {
      subCategories.push(attrs['href']);
    }
  }

  console.log(
    `${'  '.repeat(depth)}  -> ${cards.length} cards, ${subCategories.length} sub-categories, ${out.size} total SKUs so far`,
  );

  for (const subUrl of subCategories) {
    await crawlCategory(subUrl, ourCategory, depth + 1, visited, out);
  }
}

async function main() {
  const visited = new Set<string>();
  const parts = new Map<string, RawPart>();

  for (const { slug, ourCategory } of TOP_CATEGORIES) {
    await crawlCategory(`https://www.gobilda.com/${slug}`, ourCategory, 0, visited, parts);

    // Checkpoint after every top-level category so a crash doesn't lose progress.
    const outDir = path.resolve(import.meta.dirname, '../prisma/data');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      path.join(outDir, 'gobilda-parts.json'),
      JSON.stringify([...parts.values()], null, 2),
    );
  }

  console.log(`\nDone. ${parts.size} unique SKUs written to prisma/data/gobilda-parts.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Read-only: crawls the real category tree of goBILDA and ServoCity (same
 * BigCommerce theme, same 5 top-level nav pages: structure, motion,
 * electronics, hardware, kits — "merch" is excluded, it carries no parts)
 * and writes prisma/data/category-audit.md — a diff against
 * scrape-gobilda.ts's hand-maintained TOP_CATEGORIES list for goBILDA, and a
 * full leaf list for ServoCity (which has no existing scraper yet).
 *
 * Never writes to the database and never creates/updates a Part — this is
 * the Phase 1 audit step described in the approved plan, feeding Phase 3
 * (goBILDA gap-fill) and Phase 4 (ServoCity import).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fetchPage, extractCards, sleep, REQUEST_DELAY_MS } from './lib/catalogCrawl.js';

const MAX_DEPTH = 3;

const SITES = [
  { host: 'https://www.gobilda.com', label: 'goBILDA' },
  { host: 'https://www.servocity.com', label: 'ServoCity' },
];

const TOP_NAV_SLUGS = ['structure', 'motion', 'electronics', 'hardware', 'kits'];

interface CategoryNode {
  slug: string;
  title: string;
  url: string;
  parentSlug: string | null;
  topNav: string;
  isLeaf: boolean; // true once a page shows only product cards, no more category cards
}

function slugFromUrl(url: string): string {
  const { pathname } = new URL(url);
  return pathname.replace(/^\/|\/$/g, '');
}

async function crawl(
  host: string,
  rawUrl: string,
  topNav: string,
  parentSlug: string | null,
  depth: number,
  visited: Set<string>,
  out: Map<string, CategoryNode>,
): Promise<void> {
  const url = new URL(rawUrl, host).toString().split('#')[0];
  if (visited.has(url) || depth > MAX_DEPTH) return;
  visited.add(url);

  console.log(`${'  '.repeat(depth)}fetching ${url}`);
  const html = await fetchPage(url);
  await sleep(REQUEST_DELAY_MS);
  if (!html) return;

  const cards = extractCards(html);
  const categoryCards = cards.filter((c) => c.attrs['data-card-type'] === 'category');
  const hasProducts = cards.some((c) => c.attrs['data-card-type'] === 'product');

  for (const { attrs } of categoryCards) {
    const href = attrs['href'];
    if (!href) continue;
    const childUrl = new URL(href, host).toString().split('#')[0];
    const slug = slugFromUrl(childUrl);
    if (!out.has(slug)) {
      out.set(slug, {
        slug,
        title: attrs['title'] ?? slug,
        url: childUrl,
        parentSlug,
        topNav,
        isLeaf: false,
      });
    }
  }

  // A page with no category cards (only products, or empty) is a leaf.
  if (categoryCards.length === 0) {
    const self = out.get(slugFromUrl(url));
    if (self) self.isLeaf = true;
    else if (hasProducts) {
      // Top-level nav pages themselves aren't in `out` (they're crawl roots,
      // not discovered via a card) — nothing to mark, just informational.
    }
  }

  for (const { attrs } of categoryCards) {
    const href = attrs['href'];
    if (!href) continue;
    await crawl(host, href, topNav, slugFromUrl(new URL(href, host).toString()), depth + 1, visited, out);
  }
}

async function main() {
  const report: string[] = ['# Category audit', '', `Generated ${new Date().toISOString()}`, ''];

  for (const { host, label } of SITES) {
    console.log(`\n=== ${label} (${host}) ===`);
    const visited = new Set<string>();
    const nodes = new Map<string, CategoryNode>();

    for (const slug of TOP_NAV_SLUGS) {
      await crawl(host, `${host}/${slug}`, slug, null, 0, visited, nodes);
    }

    report.push(`## ${label}`, '');
    report.push('| slug | title | top nav | leaf? |', '| --- | --- | --- | --- |');
    for (const n of [...nodes.values()].sort((a, b) => a.topNav.localeCompare(b.topNav) || a.slug.localeCompare(b.slug))) {
      report.push(`| \`${n.slug}\` | ${n.title} | ${n.topNav} | ${n.isLeaf ? 'yes' : 'no'} |`);
    }
    report.push('', `Total category pages found: ${nodes.size}`, '');

    const outDir = path.resolve(import.meta.dirname, '../prisma/data');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, `category-audit-${label.toLowerCase()}.json`), JSON.stringify([...nodes.values()], null, 2));
  }

  const outDir = path.resolve(import.meta.dirname, '../prisma/data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'category-audit.md'), report.join('\n'));
  console.log('\nDone. See prisma/data/category-audit.md');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

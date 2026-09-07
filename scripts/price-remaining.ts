/**
 * Second-pass pricing for the catalog parts that `scrape-prices.ts` left with
 * no `lastKnownPrice` — the ~90 rows whose `productUrl` points at something
 * other than a plain single-product page:
 *
 *   - goBILDA "family" / category pages (e.g. /8mm-lead-screws/, and the
 *     "SEE ALSO: …" nav rows) — no product meta tag, but the page lists a set
 *     of variant cards each with a price. We take the MEDIAN of those as a
 *     fallback estimate. It is explicitly an approximation: the row stands for
 *     a family, not one SKU, and GET /expenses only ever uses lastKnownPrice
 *     as a last-resort fallback anyway.
 *   - Axon (Shopify) — price is in the JSON-LD `offers`.
 *   - Offset Robotics (WooCommerce) — JSON-LD `offers`, else the
 *     `woocommerce-Price-amount` markup.
 *   - REV — a handful of stored URLs 404; fall back to REV's own search.
 *   - Amazon — best-effort; usually bot-blocked, left null if so.
 *
 * Writes each price as it goes (resumable, same as the first pass).
 *
 *   npx tsx scripts/price-remaining.ts          # do it
 *   npx tsx scripts/price-remaining.ts --dry    # print what it would write
 *   npx tsx scripts/price-remaining.ts --limit=10
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { extractPrice } from './scrape-prices.js';

const dry = process.argv.includes('--dry');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

const SLOW_HOSTS = /(?:^|\.)(?:gobilda|revrobotics)\.com$/i; // BigCommerce — 10s crawl delay
const TIMEOUT_MS = 30_000;
const UA =
  'Mozilla/5.0 (compatible; SeattleSolversToolsBot/1.0; +https://tools.seattlesolvers.com; software@seattlesolvers.com)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

async function fetchPage(url: string, attempt = 1): Promise<{ status: number; html: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, html: await res.text() };
  } catch (err) {
    if (attempt < 3) {
      await sleep(5_000);
      return fetchPage(url, attempt + 1);
    }
    console.error(`  ! fetch failed: ${(err as Error).message}`);
    return null;
  }
}

/** Every BigCommerce category-card price on the page (excludes banners/thresholds). */
function bigCommerceCardPrices(html: string): number[] {
  const out: number[] = [];
  for (const m of html.matchAll(
    /data-product-price-without-tax[^>]*>\s*\$?\s*([\d,]+\.\d{2})/gi,
  )) {
    const v = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(v) && v > 0 && v < 100_000) out.push(v);
  }
  return out;
}

function jsonLdOfferPrice(html: string): number | null {
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      const offers = (node as Record<string, unknown>)?.offers as Record<string, unknown> | undefined;
      if (!offers) continue;
      const raw =
        (offers.lowPrice as string) ??
        (offers.price as string) ??
        (offers.highPrice as string) ??
        (Array.isArray(offers) ? (offers[0] as Record<string, unknown>)?.price : undefined);
      const v = Number(raw);
      if (Number.isFinite(v) && v > 0) return v;
    }
  }
  return null;
}

function wooPrice(html: string): number | null {
  const ld = jsonLdOfferPrice(html);
  if (ld) return ld;
  const m =
    html.match(/woocommerce-Price-amount[^>]*>[\s\S]*?([\d,]+\.\d{2})/i) ??
    html.match(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?/i);
  const v = m ? Number(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(v) && v > 0 ? v : null;
}

function amazonPrice(html: string): number | null {
  const m =
    html.match(/"priceAmount"\s*:\s*(\d+(?:\.\d+)?)/i) ??
    html.match(/id="priceblock_ourprice"[^>]*>\s*\$?([\d,]+\.\d{2})/i) ??
    html.match(/class="a-price-whole">([\d,]+)<\/span><span[^>]*class="a-price-fraction">(\d{2})/i);
  if (!m) return null;
  const v = m[2] && !m[0].includes('priceAmount') && !m[0].includes('ourprice')
    ? Number(`${m[1].replace(/,/g, '')}.${m[2]}`)
    : Number(m[1].replace(/,/g, ''));
  return Number.isFinite(v) && v > 0 ? v : null;
}

type Priced = { price: number; how: string } | { price: null; how: string };

async function priceOne(url: string, sku: string | null): Promise<Priced> {
  const host = new URL(url).host;

  // goBILDA / REV — BigCommerce. Try a real single-product price first, then
  // fall back to the median of the family page's variant cards.
  if (/gobilda\.com$/i.test(host)) {
    const page = await fetchPage(url);
    if (!page) return { price: null, how: 'fetch failed' };
    const single = extractPrice(page.html);
    if (single != null) return { price: single, how: 'product meta' };
    const cards = bigCommerceCardPrices(page.html);
    if (cards.length) return { price: round2(median(cards)), how: `family median of ${cards.length}` };
    return { price: null, how: `no cards (HTTP ${page.status})` };
  }

  if (/revrobotics\.com$/i.test(host)) {
    const page = await fetchPage(url);
    if (page && page.status === 200) {
      const single = extractPrice(page.html);
      if (single != null) return { price: single, how: 'product meta' };
    }
    // stored URL 404s or carried no price — try REV's search by SKU
    const q = sku ?? url.split('/').filter(Boolean).pop() ?? '';
    const search = await fetchPage(
      `https://www.revrobotics.com/search.php?search_query=${encodeURIComponent(q)}`,
    );
    if (search) {
      const cards = bigCommerceCardPrices(search.html);
      if (cards.length) return { price: cards[0], how: `search "${q}"` };
    }
    return { price: null, how: 'not found via search' };
  }

  if (/axon-robotics\.com$/i.test(host)) {
    const page = await fetchPage(url);
    if (!page) return { price: null, how: 'fetch failed' };
    const v = jsonLdOfferPrice(page.html);
    return v != null ? { price: v, how: 'shopify json-ld' } : { price: null, how: 'no json-ld offer' };
  }

  if (/offsetrobotics\.com$/i.test(host)) {
    const page = await fetchPage(url);
    if (!page) return { price: null, how: 'fetch failed' };
    const v = wooPrice(page.html);
    return v != null ? { price: v, how: 'woocommerce' } : { price: null, how: 'no woo price' };
  }

  if (/amazon\.com$/i.test(host)) {
    const page = await fetchPage(url);
    if (!page) return { price: null, how: 'fetch failed' };
    const v = amazonPrice(page.html);
    return v != null ? { price: v, how: 'amazon' } : { price: null, how: `blocked/no price (HTTP ${page.status})` };
  }

  // Anything else — one more go with the generic extractor.
  const page = await fetchPage(url);
  const v = page ? extractPrice(page.html) : null;
  return v != null ? { price: v, how: 'generic meta' } : { price: null, how: 'unhandled host' };
}

async function main() {
  const parts = await prisma.part.findMany({
    where: { scope: 'GLOBAL', productUrl: { not: null }, lastKnownPrice: null },
    select: { id: true, name: true, sku: true, productUrl: true },
    orderBy: { name: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`${parts.length} unpriced part(s)${dry ? ' — DRY RUN' : ''}\n`);
  let found = 0;
  const stillNull: string[] = [];

  for (const [i, part] of parts.entries()) {
    const slow = SLOW_HOSTS.test(new URL(part.productUrl!).host);
    const res = await priceOne(part.productUrl!, part.sku);
    const tag = `[${i + 1}/${parts.length}]`;

    if (res.price != null) {
      if (!dry) {
        await prisma.part.update({ where: { id: part.id }, data: { lastKnownPrice: res.price } });
      }
      found++;
      console.log(`${tag} $${res.price.toFixed(2).padStart(8)}  (${res.how})  ${part.name.slice(0, 55)}`);
    } else {
      stillNull.push(`${part.name}  — ${res.how}  [${part.productUrl}]`);
      console.log(`${tag} ${'—'.padStart(9)}  (${res.how})  ${part.name.slice(0, 55)}`);
    }

    if (i < parts.length - 1) await sleep(slow ? 10_000 : 4_000);
  }

  console.log(`\n${dry ? 'Would price' : 'Priced'} ${found}/${parts.length}. Still null: ${stillNull.length}`);
  for (const s of stillNull) console.log(`  · ${s}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

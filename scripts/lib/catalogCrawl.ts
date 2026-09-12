/**
 * Shared fetch/parse helpers for crawling goBILDA's and ServoCity's public
 * catalogs — both run the identical BigCommerce theme (same
 * `data-card-type="product"/"category"` card markup, same
 * `Crawl-delay: 10` policy for AI bots in robots.txt, confirmed by hand
 * against both sites' /sitemap.php and a live /motion fetch). Factored out
 * of scripts/scrape-gobilda.ts so scripts/discover-categories.ts and
 * scripts/scrape-servocity.ts don't reimplement it.
 */
export const REQUEST_DELAY_MS = 10_000;
// A hung TCP connection with no server-side response otherwise blocks this
// fetch forever — there's no OS-level default here worth relying on. Found
// the hard way: an unresponsive ServoCity request stalled an entire
// overnight scrape with no error, no retry, and no progress for ~10 hours.
const REQUEST_TIMEOUT_MS = 30_000;
export const USER_AGENT =
  'Mozilla/5.0 (compatible; SeattleSolversToolsBot/1.0; +https://tools.seattlesolvers.com; software@seattlesolvers.com)';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPage(url: string, attempt = 1): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
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

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
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

export function parseAttrs(tagAttrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagAttrString))) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/** Extract every `<a ...>...</a>` "card" block (non-nested in this markup). */
export function extractCards(html: string): Array<{ attrs: Record<string, string>; body: string }> {
  const cards: Array<{ attrs: Record<string, string>; body: string }> = [];
  const re = /<a\s+([^>]*data-card-type="[^"]+"[^>]*)>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    cards.push({ attrs: parseAttrs(m[1]), body: m[2] });
  }
  return cards;
}

export function firstImageSrc(body: string): string | null {
  // Prefer the non-loading.svg data-src (BigCommerce lazyload), else plain src.
  const dataSrc = body.match(/data-src="([^"]+)"/);
  if (dataSrc && !dataSrc[1].includes('loading.svg')) return dataSrc[1];
  const src = body.match(/\bsrc="([^"]+)"/);
  if (src && !src[1].includes('loading.svg')) return src[1];
  return dataSrc ? dataSrc[1] : null;
}

export interface RawPart {
  sku: string;
  name: string;
  productUrl: string;
  imageUrl: string | null;
  ourCategory: string;
}

/**
 * Breadth-first crawl of one BigCommerce catalog (goBILDA and ServoCity both
 * run this exact theme/markup) from a fixed list of top-level category
 * slugs, down through `data-card-type="category"` cards until only product
 * cards remain. Shared by scripts/scrape-gobilda.ts and
 * scripts/scrape-servocity.ts — same site platform, same crawl-delay policy,
 * only the base URL and TOP_CATEGORIES list differ per site.
 */
export async function crawlCatalog(opts: {
  baseUrl: string;
  topCategories: Array<{ slug: string; ourCategory: string }>;
  maxDepth: number;
  onCheckpoint?: (parts: Map<string, RawPart>) => void;
}): Promise<Map<string, RawPart>> {
  const visited = new Set<string>();
  const parts = new Map<string, RawPart>();

  async function crawlCategory(rawUrl: string, ourCategory: string, depth: number): Promise<void> {
    // Category cards sometimes link with a relative path and/or a
    // page-section anchor (e.g. "/foo/#conversion-kits") — normalize so both
    // resolve to the same page and the visited-set actually dedupes it.
    const url = new URL(rawUrl, opts.baseUrl).toString().split('#')[0];
    if (visited.has(url) || depth > opts.maxDepth) return;
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
        const rawHref = attrs['href'];
        const title = attrs['title'] ? decodeEntities(attrs['title']) : null;
        if (!sku || !rawHref || !title) continue;
        // Product cards sometimes carry a bare path and/or an
        // entity-encoded query (`/x/?sku&#x3D;3216`); absolutise it the same
        // way category hrefs are handled above.
        let productUrl: string;
        try {
          productUrl = new URL(decodeEntities(rawHref), opts.baseUrl).toString();
        } catch {
          productUrl = rawHref;
        }
        if (!parts.has(sku)) {
          parts.set(sku, { sku, name: title, productUrl, imageUrl: firstImageSrc(body), ourCategory });
        }
      } else if (attrs['data-card-type'] === 'category' && attrs['href']) {
        subCategories.push(attrs['href']);
      }
    }

    console.log(
      `${'  '.repeat(depth)}  -> ${cards.length} cards, ${subCategories.length} sub-categories, ${parts.size} total SKUs so far`,
    );

    for (const subUrl of subCategories) {
      await crawlCategory(subUrl, ourCategory, depth + 1);
    }
  }

  for (const { slug, ourCategory } of opts.topCategories) {
    await crawlCategory(`${opts.baseUrl}/${slug}`, ourCategory, 0);
    opts.onCheckpoint?.(parts);
  }

  return parts;
}

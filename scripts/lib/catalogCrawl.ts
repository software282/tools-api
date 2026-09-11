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
export const USER_AGENT =
  'Mozilla/5.0 (compatible; SeattleSolversToolsBot/1.0; +https://tools.seattlesolvers.com; software@seattlesolvers.com)';

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchPage(url: string, attempt = 1): Promise<string | null> {
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

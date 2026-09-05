/** Pull og:image out of a product page, tolerating either attribute order. */
export function extractOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/**
 * Best-effort image for a product page URL. Never throws — a failed fetch or a
 * page with no og:image tag both degrade to null, same as "couldn't find one".
 */
export async function fetchOgImage(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; seattlesolvers-tools/0.1)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return extractOgImage(await res.text());
  } catch {
    return null;
  }
}

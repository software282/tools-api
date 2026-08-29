import type { Vendor } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getClaude, RECEIPT_MODEL } from '../lib/claude.js';
import { claudeEnabled } from '../config/env.js';

export type UrlSuggestionSource = 'deterministic' | 'ai_search' | 'none';

export interface UrlSuggestion {
  url: string | null;
  source: UrlSuggestionSource;
}

// REV Robotics product pages are the SKU, lowercased, as the whole path:
// REV-31-1595 -> https://www.revrobotics.com/rev-31-1595/
const REV_SKU = /^REV-\d{2}-\d{3,4}$/i;

function deterministicUrl(vendor: Vendor, sku?: string): string | null {
  const trimmed = sku?.trim();
  if (vendor === 'REV' && trimmed && REV_SKU.test(trimmed)) {
    return `https://www.revrobotics.com/${trimmed.toLowerCase()}/`;
  }
  return null;
}

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Best-effort product page URL for a part that isn't in the library yet.
 * Never throws — a failed lookup degrades to `{ url: null, source: 'none' }`,
 * same as the manual-entry experience this replaces.
 */
export async function suggestProductUrl(params: {
  vendor: Vendor;
  sku?: string;
  name: string;
}): Promise<UrlSuggestion> {
  const deterministic = deterministicUrl(params.vendor, params.sku);
  if (deterministic) {
    return { url: deterministic, source: 'deterministic' };
  }

  if (!claudeEnabled) {
    return { url: null, source: 'none' };
  }

  try {
    const manufacturer = await prisma.manufacturer.findFirst({
      where: { vendor: params.vendor },
      select: { websiteUrl: true },
    });
    const domain = manufacturer?.websiteUrl ? new URL(manufacturer.websiteUrl).hostname : undefined;

    const response = await getClaude().messages.create({
      model: RECEIPT_MODEL,
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 2,
          ...(domain ? { allowed_domains: [domain] } : {}),
        },
      ],
      messages: [
        {
          role: 'user',
          content:
            `Use web search to find the single product page URL, on the vendor's own ` +
            `website, for this hardware part. Vendor: ${params.vendor}. ` +
            `SKU: ${params.sku ?? '(none)'}. Name: ${params.name}. ` +
            `Reply with ONLY the URL and nothing else, or the single word NONE if you ` +
            `cannot find a confident match.`,
        },
      ],
    });

    const text = response.content.find((block) => block.type === 'text')?.text?.trim();
    if (!text || text.toUpperCase() === 'NONE' || !isUrl(text)) {
      return { url: null, source: 'none' };
    }
    return { url: text, source: 'ai_search' };
  } catch {
    return { url: null, source: 'none' };
  }
}

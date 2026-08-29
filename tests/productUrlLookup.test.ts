import { afterEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('../src/lib/claude.js', () => ({
  getClaude: () => ({ messages: { create: createMock } }),
  RECEIPT_MODEL: 'claude-opus-4-8',
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: { manufacturer: { findFirst: vi.fn().mockResolvedValue(null) } },
}));

vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/env.js')>();
  return { ...actual, claudeEnabled: true };
});

const { suggestProductUrl } = await import('../src/services/productUrlLookup.js');

describe('suggestProductUrl', () => {
  afterEach(() => {
    createMock.mockReset();
  });

  it('derives a REV product URL from the SKU without calling Claude', async () => {
    const result = await suggestProductUrl({ vendor: 'REV', sku: 'REV-31-1595', name: 'Motor' });
    expect(result).toEqual({
      url: 'https://www.revrobotics.com/rev-31-1595/',
      source: 'deterministic',
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('is case- and whitespace-insensitive for the REV SKU', async () => {
    const result = await suggestProductUrl({ vendor: 'REV', sku: ' rev-41-1097 ', name: 'x' });
    expect(result.url).toBe('https://www.revrobotics.com/rev-41-1097/');
  });

  it('does not apply the REV formula to other vendors', async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'NONE' }] });
    const result = await suggestProductUrl({ vendor: 'GOBILDA', sku: 'REV-31-1595', name: 'x' });
    expect(result.source).not.toBe('deterministic');
  });

  it('falls back to Claude web search for a vendor with no deterministic formula', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'https://www.gobilda.com/some-part/' }],
    });
    const result = await suggestProductUrl({ vendor: 'GOBILDA', name: 'Some Part' });
    expect(result).toEqual({ url: 'https://www.gobilda.com/some-part/', source: 'ai_search' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('returns none when Claude reports no confident match', async () => {
    createMock.mockResolvedValueOnce({ content: [{ type: 'text', text: 'NONE' }] });
    const result = await suggestProductUrl({ vendor: 'AXON', name: 'Unknown Part' });
    expect(result).toEqual({ url: null, source: 'none' });
  });

  it('returns none when Claude replies with something that is not a URL', async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: "I couldn't find it" }],
    });
    const result = await suggestProductUrl({ vendor: 'FERRA', name: 'Mystery Bracket' });
    expect(result).toEqual({ url: null, source: 'none' });
  });

  it('returns none rather than throwing when the Claude call fails', async () => {
    createMock.mockRejectedValueOnce(new Error('network down'));
    const result = await suggestProductUrl({ vendor: 'MATA', name: 'x' });
    expect(result).toEqual({ url: null, source: 'none' });
  });
});

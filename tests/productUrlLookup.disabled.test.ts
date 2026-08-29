import { describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('../src/lib/claude.js', () => ({
  getClaude: () => ({ messages: { create: createMock } }),
  RECEIPT_MODEL: 'claude-opus-4-8',
}));

vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/env.js')>();
  return { ...actual, claudeEnabled: false };
});

const { suggestProductUrl } = await import('../src/services/productUrlLookup.js');

describe('suggestProductUrl with no ANTHROPIC_API_KEY configured', () => {
  it('returns none for a non-deterministic vendor without calling Claude', async () => {
    const result = await suggestProductUrl({ vendor: 'GOBILDA', name: 'Some Part' });
    expect(result).toEqual({ url: null, source: 'none' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('still resolves REV deterministically, since that needs no AI call', async () => {
    const result = await suggestProductUrl({ vendor: 'REV', sku: 'REV-31-1595', name: 'x' });
    expect(result).toEqual({
      url: 'https://www.revrobotics.com/rev-31-1595/',
      source: 'deterministic',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
const fetchOgImageMock = vi.fn().mockResolvedValue(null);

vi.mock('../src/lib/claude.js', () => ({
  getClaude: () => ({ messages: { create: createMock } }),
  RECEIPT_MODEL: 'claude-opus-4-8',
}));

vi.mock('../src/lib/teamAnthropicKey.js', () => ({
  getTeamAnthropicApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/lib/ogImage.js', () => ({
  fetchOgImage: (...args: unknown[]) => fetchOgImageMock(...args),
}));

const { suggestProductUrl } = await import('../src/services/productUrlLookup.js');

describe('suggestProductUrl with no team Anthropic key configured', () => {
  it('returns none for a non-deterministic vendor without calling Claude', async () => {
    const result = await suggestProductUrl({ vendor: 'GOBILDA', name: 'Some Part', teamId: 'team_1' });
    expect(result).toEqual({ url: null, source: 'none', imageUrl: null });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('still resolves REV deterministically (and its image), since that needs no AI call', async () => {
    fetchOgImageMock.mockResolvedValueOnce('https://cdn.revrobotics.com/rev-31-1595.jpg');
    const result = await suggestProductUrl({
      vendor: 'REV',
      sku: 'REV-31-1595',
      name: 'x',
      teamId: null,
    });
    expect(result).toEqual({
      url: 'https://www.revrobotics.com/rev-31-1595/',
      source: 'deterministic',
      imageUrl: 'https://cdn.revrobotics.com/rev-31-1595.jpg',
    });
  });
});

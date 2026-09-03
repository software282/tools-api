import { describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();

vi.mock('../src/lib/claude.js', () => ({
  getClaude: () => ({ messages: { create: createMock } }),
  RECEIPT_MODEL: 'claude-opus-4-8',
}));

vi.mock('../src/lib/teamAnthropicKey.js', () => ({
  getTeamAnthropicApiKey: vi.fn().mockResolvedValue(null),
}));

const { suggestProductUrl } = await import('../src/services/productUrlLookup.js');

describe('suggestProductUrl with no team Anthropic key configured', () => {
  it('returns none for a non-deterministic vendor without calling Claude', async () => {
    const result = await suggestProductUrl({ vendor: 'GOBILDA', name: 'Some Part', teamId: 'team_1' });
    expect(result).toEqual({ url: null, source: 'none' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('still resolves REV deterministically, since that needs no AI call', async () => {
    const result = await suggestProductUrl({
      vendor: 'REV',
      sku: 'REV-31-1595',
      name: 'x',
      teamId: null,
    });
    expect(result).toEqual({
      url: 'https://www.revrobotics.com/rev-31-1595/',
      source: 'deterministic',
    });
  });
});

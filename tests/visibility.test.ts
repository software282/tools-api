import { describe, expect, it } from 'vitest';
import { visibilityFilter } from '../src/modules/parts/service.js';

/**
 * This filter is the whole tenancy boundary for parts: every read path composes
 * it. The important property is negative — an anonymous or other-team caller must
 * never get a clause that can reach another team's custom parts.
 */
describe('visibilityFilter', () => {
  it('shows anonymous callers only approved global parts', () => {
    expect(visibilityFilter(null)).toEqual({
      OR: [{ scope: 'GLOBAL', status: 'APPROVED' }],
    });
  });

  it('never exposes TEAM-scoped parts to an anonymous caller', () => {
    const clauses = visibilityFilter(null).OR as Array<Record<string, unknown>>;
    expect(clauses.some((c) => c.scope === 'TEAM')).toBe(false);
    expect(JSON.stringify(clauses)).not.toContain('createdByTeamId');
  });

  it('adds only the viewer\'s own team parts', () => {
    expect(visibilityFilter('team_abc')).toEqual({
      OR: [
        { scope: 'GLOBAL', status: 'APPROVED' },
        { scope: 'TEAM', createdByTeamId: 'team_abc' },
      ],
    });
  });

  it('does not leak pending global submissions', () => {
    const clauses = visibilityFilter('team_abc').OR as Array<Record<string, unknown>>;
    const globalClause = clauses.find((c) => c.scope === 'GLOBAL');
    expect(globalClause).toEqual({ scope: 'GLOBAL', status: 'APPROVED' });
  });
});

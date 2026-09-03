import type { Team } from '@prisma/client';

/** The team fields safe to hand back to a client — never the encrypted key itself. */
export function serializePublicTeam(team: Team) {
  return {
    id: team.id,
    number: team.number,
    name: team.name,
    inviteCode: team.inviteCode,
    anthropicApiKeyConfigured: team.anthropicApiKeyCiphertext !== null,
  };
}

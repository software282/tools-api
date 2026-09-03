import { prisma } from './prisma.js';
import { decryptSecret } from './secretBox.js';

/**
 * A team's own decrypted Anthropic API key, or null if it hasn't configured one
 * (or has no team). Every Claude call in this service is billed to the calling
 * team's own key — there is no shared/global fallback.
 */
export async function getTeamAnthropicApiKey(teamId: string | null | undefined): Promise<string | null> {
  if (!teamId) return null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { anthropicApiKeyCiphertext: true },
  });
  if (!team?.anthropicApiKeyCiphertext) return null;

  try {
    return decryptSecret(team.anthropicApiKeyCiphertext);
  } catch {
    // A corrupt payload (e.g. ENCRYPTION_KEY rotated) should degrade to "not
    // configured" rather than break every receipt upload for the team.
    return null;
  }
}

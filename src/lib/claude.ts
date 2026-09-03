import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

/**
 * Anthropic client for a specific team's own API key.
 *
 * There is no shared/global key: this is a multi-team hosted service, and each
 * team is billed through its own Anthropic account (see
 * src/lib/teamAnthropicKey.ts). Construction is cheap (no network call), so a
 * fresh client per call is simpler than caching one per key.
 */
export function getClaude(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export const RECEIPT_MODEL = env.ANTHROPIC_RECEIPT_MODEL;

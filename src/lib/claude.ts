import Anthropic from '@anthropic-ai/sdk';
import { claudeEnabled, env } from '../config/env.js';

let client: Anthropic | null = null;

/** Lazily-created Anthropic client. Throws if ANTHROPIC_API_KEY is missing. */
export function getClaude(): Anthropic {
  if (!claudeEnabled) {
    throw new Error('Claude is not configured. Set ANTHROPIC_API_KEY to enable receipt vision.');
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const RECEIPT_MODEL = env.ANTHROPIC_RECEIPT_MODEL;

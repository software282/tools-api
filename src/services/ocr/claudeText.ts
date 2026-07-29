import type { Vendor } from '@prisma/client';
import { getClaude, RECEIPT_MODEL } from '../../lib/claude.js';
import { buildReceiptPrompt, coerceParsedReceipt, extractJson } from './claudeShared.js';
import type { ParsedReceipt } from './types.js';

/**
 * Structure an already-extracted receipt text with Claude.
 *
 * This is the fallback for *digital* receipts — a pasted confirmation or PDF text
 * layer whose layout no tuned vendor parser recognises. It costs a fraction of a
 * vision call because the characters are already exact; there is nothing to
 * decipher, only to organise.
 */
export async function parseTextWithClaude(
  text: string,
  vendor: Vendor,
): Promise<ParsedReceipt> {
  const client = getClaude();

  const response = await client.messages.create({
    model: RECEIPT_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildReceiptPrompt(vendor, 'text') },
          // Delimited so the model cannot mistake receipt content for instructions.
          { type: 'text', text: `<receipt>\n${text}\n</receipt>` },
        ],
      },
    ],
  });

  const block = response.content.find((c) => c.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  return coerceParsedReceipt(extractJson(raw), vendor);
}

import type { Vendor } from '@prisma/client';
import { getClaude, RECEIPT_MODEL } from '../../lib/claude.js';
import { buildReceiptPrompt, coerceParsedReceipt, extractJson } from './claudeShared.js';
import type { ParsedReceipt } from './types.js';

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Read a receipt *image* with Claude vision.
 *
 * The expensive last resort, reached only when a photo of a physical receipt
 * defeats both Tesseract and the vendor parsers. Digital receipts never get here:
 * their text is exact, so they take the text path instead.
 *
 * `contentType` must be a Claude-supported image type; PDFs are handled earlier
 * by extracting their text layer.
 */
export async function parseWithClaude(
  buffer: Buffer,
  contentType: string,
  vendor: Vendor,
): Promise<ParsedReceipt> {
  if (!SUPPORTED_IMAGE_TYPES.has(contentType)) {
    throw new Error(`Claude vision does not support content type "${contentType}"`);
  }

  const client = getClaude();
  const response = await client.messages.create({
    model: RECEIPT_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: contentType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: buffer.toString('base64'),
            },
          },
          { type: 'text', text: buildReceiptPrompt(vendor, 'image') },
        ],
      },
    ],
  });

  const block = response.content.find((c) => c.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  return coerceParsedReceipt(extractJson(raw), vendor);
}

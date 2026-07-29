import type { ExtractionMethod, Vendor } from '@prisma/client';
import { claudeEnabled, env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import { extractText } from './tesseract.js';
import { getVendorParser } from './vendors/index.js';
import { parseWithClaude } from './claudeVision.js';
import { parseTextWithClaude } from './claudeText.js';
import { htmlToText, normalizeWhitespace, pdfToText } from './textExtract.js';
import type { ExtractionResult, ParsedReceipt, ReceiptInput } from './types.js';

const TESSERACT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const CLAUDE_VISION_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/** A parse is unusable if it produced no purchasable lines. */
function isEmpty(parsed: ParsedReceipt | null): boolean {
  return !parsed || parsed.items.length === 0;
}

/**
 * Run the tuned vendor parser, then Claude-on-text if it found nothing.
 *
 * Shared by every digital source (pasted text, HTML email, PDF text layer),
 * because once the text is in hand the source no longer matters. Claude here is
 * text-only: the characters are already exact, so there is nothing to decipher.
 */
async function parseDigitalText(
  text: string,
  vendor: Vendor,
  method: ExtractionMethod,
): Promise<ExtractionResult> {
  const parsed = getVendorParser(vendor)(text, vendor);

  if (!isEmpty(parsed)) {
    return { method, rawText: text, parsed: parsed!, usedClaude: false, textConfidence: 100 };
  }

  if (claudeEnabled) {
    try {
      return {
        method: 'CLAUDE_TEXT',
        rawText: text,
        parsed: await parseTextWithClaude(text, vendor),
        usedClaude: true,
        textConfidence: 100,
      };
    } catch {
      // Fall through and report the empty parse for manual entry.
    }
  }

  return { method, rawText: text, parsed: { vendor, items: [] }, usedClaude: false, textConfidence: 100 };
}

/**
 * Read a photo or screenshot: OCR first, Claude vision only if that is not good
 * enough. This is the path for physical receipts, and the only one that can be
 * defeated by image quality.
 */
async function parseImage(
  buffer: Buffer,
  contentType: string,
  vendor: Vendor,
): Promise<ExtractionResult> {
  const canTesseract = TESSERACT_TYPES.has(contentType);
  const canVision = claudeEnabled && CLAUDE_VISION_TYPES.has(contentType);

  let rawText: string | null = null;
  let textConfidence: number | undefined;
  let parsed: ParsedReceipt | null = null;

  if (canTesseract) {
    const extraction = await extractText(buffer);
    rawText = extraction.text;
    textConfidence = extraction.meanConfidence;
    parsed = getVendorParser(vendor)(extraction.text, vendor);
  }

  const lowConfidence =
    textConfidence !== undefined && textConfidence < env.OCR_CONFIDENCE_THRESHOLD;

  if ((isEmpty(parsed) || lowConfidence) && canVision) {
    try {
      return {
        method: 'CLAUDE_VISION',
        rawText,
        parsed: await parseWithClaude(buffer, contentType, vendor),
        usedClaude: true,
        textConfidence,
      };
    } catch {
      // Fall through to whatever OCR managed.
    }
  }

  if (!canTesseract && !canVision) {
    throw new Error(`Cannot read a receipt of type "${contentType}"`);
  }

  return {
    method: 'TESSERACT',
    rawText,
    parsed: parsed ?? { vendor, items: [] },
    usedClaude: false,
    textConfidence,
  };
}

/**
 * Turn any receipt input into structured line items.
 *
 * Ordered by how most orders actually arrive. Nearly all FTC purchases are placed
 * online, so the common case is a pasted confirmation or a downloaded PDF — exact
 * text that needs no OCR and no model call. Photos of physical receipts still
 * work, but they are the exception and the only path that pays for vision.
 */
export async function runReceiptExtraction(input: ReceiptInput): Promise<ExtractionResult> {
  switch (input.kind) {
    case 'text':
      return parseDigitalText(normalizeWhitespace(input.text), input.vendor, 'PASTED_TEXT');

    case 'html':
      return parseDigitalText(
        normalizeWhitespace(htmlToText(input.html)),
        input.vendor,
        'PASTED_HTML',
      );

    case 'pdf': {
      const text = await pdfToText(input.buffer);
      if (text) return parseDigitalText(text, input.vendor, 'PDF_TEXT');
      // No text layer means a scan or photo saved as PDF. Rasterising it would
      // need another dependency, so ask for an image instead of failing vaguely.
      // Thrown as an AppError so the route surfaces this wording to the user.
      throw badRequest(
        'This PDF has no text layer, so it is a scan rather than a digital receipt. ' +
          'Upload a photo or screenshot of it instead.',
        'PDF_NOT_DIGITAL',
      );
    }

    case 'image':
      return parseImage(input.buffer, input.contentType, input.vendor);
  }
}

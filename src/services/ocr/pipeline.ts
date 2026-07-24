import type { Vendor } from '@prisma/client';
import { claudeEnabled, env } from '../../config/env.js';
import { extractText } from './tesseract.js';
import { getVendorParser } from './vendors/index.js';
import { parseWithClaude } from './claudeVision.js';
import type { OcrResult, ParsedReceipt } from './types.js';

const TESSERACT_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const CLAUDE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface RunOcrParams {
  buffer: Buffer;
  contentType: string;
  vendor: Vendor;
}

/**
 * Hybrid receipt reading:
 *  1. Tesseract text pass (raster images only) + tuned vendor parser.
 *  2. Fall back to Claude vision when the vendor parser finds nothing, the
 *     Tesseract confidence is below OCR_CONFIDENCE_THRESHOLD, or the file
 *     isn't a raster image Tesseract can read (e.g. a PDF).
 */
export async function runReceiptOcr(params: RunOcrParams): Promise<OcrResult> {
  const { buffer, contentType, vendor } = params;
  const canTesseract = TESSERACT_TYPES.has(contentType);
  const canClaude = claudeEnabled && CLAUDE_TYPES.has(contentType);

  let rawText: string | null = null;
  let textConfidence: number | undefined;
  let tesseractParse: ParsedReceipt | null = null;

  if (canTesseract) {
    const extraction = await extractText(buffer);
    rawText = extraction.text;
    textConfidence = extraction.meanConfidence;
    tesseractParse = getVendorParser(vendor)(extraction.text, vendor);
  }

  const lowConfidence =
    textConfidence !== undefined && textConfidence < env.OCR_CONFIDENCE_THRESHOLD;
  const needFallback = !tesseractParse || tesseractParse.items.length === 0 || lowConfidence;

  if (needFallback && canClaude) {
    try {
      const claudeParse = await parseWithClaude(buffer, contentType, vendor);
      return {
        method: canTesseract ? 'HYBRID' : 'CLAUDE',
        rawText,
        parsed: claudeParse,
        usedClaude: true,
        textConfidence,
      };
    } catch {
      // Claude failed — fall through to whatever Tesseract produced.
    }
  }

  return {
    method: 'TESSERACT',
    rawText,
    parsed: tesseractParse ?? { vendor, items: [] },
    usedClaude: false,
    textConfidence,
  };
}

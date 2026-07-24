import { createWorker } from 'tesseract.js';

export interface TextExtraction {
  text: string;
  meanConfidence: number; // 0-100
}

/**
 * Run Tesseract OCR over an image buffer. A single worker is created per call
 * and terminated afterward to keep memory bounded; for higher throughput this
 * could be swapped for a pooled worker.
 *
 * Note: Tesseract.js works on raster images (jpg/png/webp), not PDFs. PDF
 * receipts should go straight to the Claude fallback (see pipeline).
 */
export async function extractText(buffer: Buffer): Promise<TextExtraction> {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(buffer);
    return { text: data.text ?? '', meanConfidence: data.confidence ?? 0 };
  } finally {
    await worker.terminate();
  }
}

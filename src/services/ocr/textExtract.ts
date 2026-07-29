import { convert } from 'html-to-text';

/**
 * Turning a digital receipt into plain text. No OCR and no model call involved —
 * an order confirmation already contains exact characters, so the job is only to
 * preserve the line structure the vendor parsers key on.
 */

/** Content types we can pull a text layer out of without OCR. */
export const PDF_TYPES = new Set(['application/pdf']);

/**
 * Convert an HTML order-confirmation email to text.
 *
 * Line structure carries the meaning here: vendors lay items out in tables, so
 * each cell has to become its own line for the block parsers to group them.
 * Links and images are dropped — a bare tracking URL on its own line only
 * confuses price and quantity detection.
 */
export function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
      // One line per cell rather than tab-separated columns.
      { selector: 'table', format: 'dataTable', options: { colSpacing: 0, rowSpacing: 0 } },
    ],
  });
}

/** Cheap structural check — enough to tell a pasted HTML email from plain text. */
export function looksLikeHtml(value: string): boolean {
  return /<\s*(html|body|table|tr|td|div|p|span|br)\b|<\/[a-z]+\s*>/i.test(value);
}

/**
 * Extract the text layer from a PDF.
 *
 * Returns null when the PDF has no text layer — that means a scanned or
 * photographed document, which needs the image path instead. `unpdf` is imported
 * lazily because it pulls in pdf.js, which is large and irrelevant to every
 * request that isn't a PDF.
 */
export async function pdfToText(buffer: Buffer): Promise<string | null> {
  const { extractText, getDocumentProxy } = await import('unpdf');

  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: true });

  const normalized = normalizeWhitespace(Array.isArray(text) ? text.join('\n') : text);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Collapse the whitespace noise that PDF and HTML extraction leave behind, while
 * keeping one item field per line.
 */
export function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ') // non-breaking spaces are common in HTML emails
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, '  ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

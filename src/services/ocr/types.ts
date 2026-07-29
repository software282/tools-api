import type { ExtractionMethod, Vendor } from '@prisma/client';

export interface ParsedLineItem {
  /** The raw text line this item came from (for auditing / manual correction). */
  rawText?: string;
  /** Vendor SKU / part number if detected. */
  sku?: string;
  /** Human-readable item name. */
  name: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

export interface ParsedReceipt {
  vendor: Vendor;
  orderTotal?: number;
  purchasedAt?: string; // ISO date
  items: ParsedLineItem[];
}

/**
 * What the caller supplied. The digital variants carry exact text and are the
 * common case; `image` is a photo of a physical receipt.
 */
export type ReceiptInput =
  | { kind: 'text'; text: string; vendor: Vendor }
  | { kind: 'html'; html: string; vendor: Vendor }
  | { kind: 'pdf'; buffer: Buffer; vendor: Vendor }
  | { kind: 'image'; buffer: Buffer; contentType: string; vendor: Vendor };

export interface ExtractionResult {
  method: ExtractionMethod;
  /** The extracted text, whatever the source. */
  rawText: string | null;
  parsed: ParsedReceipt;
  /** Whether a Claude call (text or vision) was needed. */
  usedClaude: boolean;
  /**
   * Confidence in the *text* itself, 0-100. Always 100 for digital sources, since
   * their characters are exact; Tesseract's mean word confidence for images.
   */
  textConfidence?: number;
}

/** A vendor parser turns OCR text into a structured receipt, or null if it can't. */
export type VendorParser = (text: string, vendor: Vendor) => ParsedReceipt | null;

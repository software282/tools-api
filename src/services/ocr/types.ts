import type { Vendor } from '@prisma/client';

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

export interface OcrResult {
  method: 'TESSERACT' | 'CLAUDE' | 'HYBRID';
  rawText: string | null;
  parsed: ParsedReceipt;
  /** Whether the Claude vision fallback was invoked. */
  usedClaude: boolean;
  /** Tesseract mean word confidence (0-100), when a text pass ran. */
  textConfidence?: number;
}

/** A vendor parser turns OCR text into a structured receipt, or null if it can't. */
export type VendorParser = (text: string, vendor: Vendor) => ParsedReceipt | null;

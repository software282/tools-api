import type { Vendor } from '@prisma/client';
import type { VendorParser } from '../types.js';
import { parseGobilda } from './gobilda.js';
import { parseRev } from './rev.js';
import { parseAxon } from './axon.js';
import { parseUxcell } from './uxcell.js';
import { parseGeneric } from './generic.js';

/**
 * Vendors with a parser tuned to their SKU format or product naming.
 *
 * The remaining vendors — FERRA, MELONBOTICS, OFFSET, MATA, OTHER — deliberately
 * have no entry. Their SKU formats are not known here, and a guessed pattern is
 * worse than none: it would either never match, or match the wrong thing
 * confidently. They use the generic block parser, which handles both stacked
 * digital confirmations and single-line photos without needing a SKU at all.
 *
 * To add one, write a parser keyed on that vendor's real SKU shape (see
 * gobilda.ts for the pattern) and register it here.
 */
const TUNED: Partial<Record<Vendor, VendorParser>> = {
  GOBILDA: parseGobilda,
  REV: parseRev,
  AXON: parseAxon,
  UXCELL: parseUxcell,
};

/**
 * Return the parser for a vendor: the tuned one where it exists, always with the
 * generic block parser behind it.
 *
 * Composing them matters. A tuned parser keys on a SKU pattern, so a receipt that
 * omits SKUs — or uses a format the pattern does not cover — would otherwise
 * yield nothing and fall all the way through to Claude. With the generic pass
 * behind it, a tuned parser can only ever improve on the baseline.
 */
export function getVendorParser(vendor: Vendor): VendorParser {
  const tuned = TUNED[vendor];
  if (!tuned) return parseGeneric;

  return (text, v) => {
    const result = tuned(text, v);
    if (result && result.items.length > 0) return result;
    return parseGeneric(text, v);
  };
}

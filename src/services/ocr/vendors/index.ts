import type { Vendor } from '@prisma/client';
import type { VendorParser } from '../types.js';
import { parseGobilda } from './gobilda.js';
import { parseRev } from './rev.js';
import { parseAxon } from './axon.js';
import { parseGeneric } from './generic.js';

/**
 * Tuned parsers by vendor, in the priority order the project cares about:
 * goBILDA -> REV -> Axon first. Vendors without a tuned parser use the generic
 * text parser and lean more heavily on the Claude fallback.
 */
const parsers: Partial<Record<Vendor, VendorParser>> = {
  GOBILDA: parseGobilda,
  REV: parseRev,
  AXON: parseAxon,
  // FERRA, MELONBOTICS, OFFSET, MATA, UXCELL, OTHER -> generic + Claude fallback.
};

export function getVendorParser(vendor: Vendor): VendorParser {
  return parsers[vendor] ?? parseGeneric;
}

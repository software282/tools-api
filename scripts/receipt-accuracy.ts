/**
 * Scores receipt parsing accuracy against a corpus of labelled fixtures.
 *
 * Exists because ">90% accuracy on digital receipts" is otherwise an assertion
 * nobody can check. Run with `npm run accuracy`.
 *
 * Scope: this measures the *deterministic* parsers only — vendor parsers over
 * text, HTML, and PDF text layers. The Claude fallback is deliberately excluded,
 * so the score is reproducible, free, and improves only when the parsers do.
 * Claude sits behind this number as a safety net; it is not part of it.
 *
 * A fixture is a directory under tests/fixtures/receipts/:
 *   <name>/input.txt | input.html | input.pdf   the receipt as received
 *   <name>/expected.json                        what should come out
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { getVendorParser } from '../src/services/ocr/vendors/index.js';
import { htmlToText, normalizeWhitespace, pdfToText } from '../src/services/ocr/textExtract.js';
import type { ParsedLineItem } from '../src/services/ocr/types.js';

const CORPUS = path.join('tests', 'fixtures', 'receipts');
const MONEY_TOLERANCE = 0.005;

/** The bar set for digital receipts. Non-zero exit below this. */
const THRESHOLD = Number(process.env.ACCURACY_THRESHOLD ?? 90);

interface ExpectedItem {
  sku?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

interface Expected {
  vendor: string;
  /** True while the fixture is invented rather than a real receipt. */
  synthetic?: boolean;
  note?: string;
  orderTotal?: number;
  purchasedAt?: string;
  items: ExpectedItem[];
}

interface Score {
  fixture: string;
  vendor: string;
  synthetic: boolean;
  expectedCount: number;
  extractedCount: number;
  /** Items paired with an expectation AND correct in every compared field. */
  exact: number;
  fieldsChecked: number;
  fieldsCorrect: number;
  orderTotalOk: boolean | null;
  problems: string[];
}

const normalizeName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sameMoney = (a?: number, b?: number) => {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) < MONEY_TOLERANCE;
};

/** Read whichever input file the fixture provides and turn it into text. */
async function loadFixtureText(dir: string): Promise<string> {
  const entries = await readdir(dir);

  const txt = entries.find((f) => f === 'input.txt');
  if (txt) return normalizeWhitespace(await readFile(path.join(dir, txt), 'utf8'));

  const html = entries.find((f) => f === 'input.html');
  if (html) {
    return normalizeWhitespace(htmlToText(await readFile(path.join(dir, html), 'utf8')));
  }

  const pdf = entries.find((f) => f === 'input.pdf');
  if (pdf) {
    const text = await pdfToText(await readFile(path.join(dir, pdf)));
    if (!text) throw new Error('input.pdf has no text layer');
    return text;
  }

  throw new Error('no input.txt, input.html, or input.pdf');
}

/**
 * Pair extracted items with expectations: by SKU where the expectation has one,
 * then by exact normalised name.
 *
 * Pairing is strict on purpose. Fuzzy-matching names here would hide exactly the
 * errors this harness exists to surface.
 */
function pair(expected: ExpectedItem[], extracted: ParsedLineItem[]) {
  const remaining = [...extracted];
  const pairs: Array<{ want: ExpectedItem; got: ParsedLineItem }> = [];
  const missed: ExpectedItem[] = [];

  for (const want of expected) {
    let index = -1;

    if (want.sku) {
      const wantSku = want.sku.toLowerCase();
      index = remaining.findIndex((got) => got.sku?.toLowerCase() === wantSku);
    }
    if (index === -1) {
      const wantName = normalizeName(want.name);
      index = remaining.findIndex((got) => normalizeName(got.name) === wantName);
    }

    if (index === -1) missed.push(want);
    else pairs.push({ want, got: remaining.splice(index, 1)[0] });
  }

  return { pairs, missed, spurious: remaining };
}

async function scoreFixture(name: string): Promise<Score> {
  const dir = path.join(CORPUS, name);
  const expected: Expected = JSON.parse(await readFile(path.join(dir, 'expected.json'), 'utf8'));

  const text = await loadFixtureText(dir);
  const parsed = getVendorParser(expected.vendor as never)(text, expected.vendor as never);
  const extracted = parsed?.items ?? [];

  const { pairs, missed, spurious } = pair(expected.items, extracted);

  const problems: string[] = [];
  for (const want of missed) problems.push(`missed: ${want.name}`);
  for (const got of spurious) problems.push(`spurious: ${got.name}`);

  let fieldsChecked = 0;
  let fieldsCorrect = 0;
  let exact = 0;

  for (const { want, got } of pairs) {
    const checks: Array<[string, boolean]> = [
      ['name', normalizeName(want.name) === normalizeName(got.name)],
      ['quantity', want.quantity === got.quantity],
    ];
    if (want.sku !== undefined) {
      checks.push(['sku', (got.sku ?? '').toLowerCase() === want.sku.toLowerCase()]);
    }
    if (want.unitPrice !== undefined) {
      checks.push(['unitPrice', sameMoney(want.unitPrice, got.unitPrice)]);
    }
    if (want.lineTotal !== undefined) {
      checks.push(['lineTotal', sameMoney(want.lineTotal, got.lineTotal)]);
    }

    fieldsChecked += checks.length;
    fieldsCorrect += checks.filter(([, ok]) => ok).length;

    const wrong = checks.filter(([, ok]) => !ok).map(([field]) => field);
    if (wrong.length === 0) exact++;
    else problems.push(`${want.name}: wrong ${wrong.join(', ')}`);
  }

  const orderTotalOk =
    expected.orderTotal === undefined ? null : sameMoney(expected.orderTotal, parsed?.orderTotal);
  if (orderTotalOk === false) {
    problems.push(`orderTotal: expected ${expected.orderTotal}, got ${parsed?.orderTotal}`);
  }

  return {
    fixture: name,
    vendor: expected.vendor,
    synthetic: expected.synthetic ?? false,
    expectedCount: expected.items.length,
    extractedCount: extracted.length,
    exact,
    fieldsChecked,
    fieldsCorrect,
    orderTotalOk,
    problems,
  };
}

/**
 * Line accuracy penalises both misses and invented items: dividing by the larger
 * of expected and extracted means a parser cannot score well by over-reporting.
 */
function lineAccuracy(scores: Score[]): number {
  const exact = scores.reduce((sum, s) => sum + s.exact, 0);
  const denominator = scores.reduce(
    (sum, s) => sum + Math.max(s.expectedCount, s.extractedCount),
    0,
  );
  return denominator === 0 ? 0 : (exact / denominator) * 100;
}

function fieldAccuracy(scores: Score[]): number {
  const checked = scores.reduce((sum, s) => sum + s.fieldsChecked, 0);
  const correct = scores.reduce((sum, s) => sum + s.fieldsCorrect, 0);
  return checked === 0 ? 0 : (correct / checked) * 100;
}

const pct = (value: number) => `${value.toFixed(1)}%`;

async function main() {
  let names: string[];
  try {
    const entries = await readdir(CORPUS);
    const dirs = await Promise.all(
      entries.map(async (e) => ((await stat(path.join(CORPUS, e))).isDirectory() ? e : null)),
    );
    names = dirs.filter((e): e is string => e !== null).sort();
  } catch {
    console.error(`No corpus at ${CORPUS}. See its README for the fixture format.`);
    process.exit(1);
  }

  if (names.length === 0) {
    console.error(`No fixtures in ${CORPUS}.`);
    process.exit(1);
  }

  const scores: Score[] = [];
  for (const name of names) {
    try {
      scores.push(await scoreFixture(name));
    } catch (err) {
      console.error(`  ${name}: FAILED to score — ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }

  // Per vendor, so it is obvious which vendor is dragging the number down.
  const vendors = [...new Set(scores.map((s) => s.vendor))].sort();
  console.log('\nReceipt parsing accuracy (deterministic parsers only, no Claude)\n');
  console.log('  vendor         fixtures  lines  line acc.  field acc.');
  console.log('  ' + '-'.repeat(58));
  for (const vendor of vendors) {
    const group = scores.filter((s) => s.vendor === vendor);
    const lines = group.reduce((sum, s) => sum + s.expectedCount, 0);
    console.log(
      `  ${vendor.padEnd(14)} ${String(group.length).padStart(8)} ${String(lines).padStart(6)} ` +
        `${pct(lineAccuracy(group)).padStart(10)} ${pct(fieldAccuracy(group)).padStart(11)}`,
    );
  }

  const overall = lineAccuracy(scores);
  const real = scores.filter((s) => !s.synthetic);
  const synthetic = scores.filter((s) => s.synthetic);

  console.log('  ' + '-'.repeat(58));
  console.log(
    `  ${'OVERALL'.padEnd(14)} ${String(scores.length).padStart(8)} ` +
      `${String(scores.reduce((sum, s) => sum + s.expectedCount, 0)).padStart(6)} ` +
      `${pct(overall).padStart(10)} ${pct(fieldAccuracy(scores)).padStart(11)}`,
  );

  const withProblems = scores.filter((s) => s.problems.length > 0);
  if (withProblems.length > 0) {
    console.log('\nProblems:');
    for (const score of withProblems) {
      console.log(`  ${score.fixture} (${score.vendor})`);
      for (const problem of score.problems) console.log(`    - ${problem}`);
    }
  }

  console.log(
    `\nCorpus: ${real.length} real, ${synthetic.length} synthetic.` +
      (real.length === 0
        ? '\n\n  WARNING: every fixture is synthetic. This score says the parsers behave as\n' +
          '  designed on layouts we invented — it is NOT evidence of real-world accuracy.\n' +
          '  Add real order confirmations before treating the threshold as met.'
        : ''),
  );

  if (overall < THRESHOLD) {
    console.error(`\nFAIL: line accuracy ${pct(overall)} is below the ${THRESHOLD}% threshold.`);
    process.exit(1);
  }
  console.log(`\nPASS: line accuracy ${pct(overall)} meets the ${THRESHOLD}% threshold.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

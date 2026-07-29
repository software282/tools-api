# Receipt accuracy corpus

Labelled receipts used by `npm run accuracy` to measure whether digital receipt
parsing clears the **>90% accuracy** bar.

> **Every fixture here is currently synthetic** — invented by reading the parser
> code, in the shape real confirmations take. The harness reports 100% on them,
> which only proves the parsers behave as designed on layouts we made up. It is
> **not** evidence of real-world accuracy. The corpus only becomes meaningful once
> it contains real order confirmations.

## Adding a real receipt (the useful thing to do)

1. Make a directory named for the vendor and layout, e.g. `gobilda-2026-03-email`.
2. Drop in the receipt exactly as received, as **one** of:
   - `input.txt` — pasted plain-text confirmation
   - `input.html` — a forwarded email body, saved as HTML
   - `input.pdf` — a downloaded PDF invoice
3. Write `expected.json` describing what *should* come out:

```json
{
  "vendor": "GOBILDA",
  "orderTotal": 139.46,
  "purchasedAt": "2026-01-23",
  "items": [
    {
      "sku": "5203-2402-0027",
      "name": "5203 Series Yellow Jacket Planetary Gear Motor (19.2:1 Ratio, 312 RPM)",
      "quantity": 2,
      "unitPrice": 43.0,
      "lineTotal": 86.0
    }
  ]
}
```

4. Run `npm run accuracy`.

Omit `synthetic` (or set it `false`) for real receipts — the harness counts real
and synthetic fixtures separately and drops its warning once real ones exist.

### Notes on `expected.json`

- **Only assert fields you can see.** Omitted fields are not scored, so leave out
  `sku` for a vendor that does not print one rather than inventing a value.
- `name` is compared after normalising case and punctuation, but not fuzzily. If
  the parser returns a materially different name that counts as a miss, which is
  the point.
- Redact anything personal — addresses, card digits, order numbers you would
  rather not commit. None of it affects scoring.

## What the score means

- **line acc.** — the primary metric. Items correct in *every* asserted field,
  divided by the greater of expected and extracted counts, so a parser cannot
  score well by inventing extra lines.
- **field acc.** — of the fields compared on paired items, how many were right.
  Useful for seeing *how* a parser is wrong: 95% field accuracy with 60% line
  accuracy means one field is consistently off.

The harness scores the **deterministic parsers only** — the Claude fallback is
excluded so the number is reproducible, free, and moves only when the parsers
improve. Claude sits behind this number as a safety net, not as part of it.

Override the threshold with `ACCURACY_THRESHOLD=95 npm run accuracy`.

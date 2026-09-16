# Handoff — read this first

Written 2026-09-05, end of a long session, because George is switching Claude
accounts and the next session starts with zero memory of any of this. Read
this whole file before touching anything — it front-loads what would
otherwise take an hour of re-deriving.

---

## Session update — 2026-09-15, end of day (supersedes stale bits below)

**User-reported bug, same day as the design-export merge below: team roster
names rendered with a duplicated leading letter glued on with no gap**
("GGeorge Conlan"). Root cause: `app/styles.css` was taken **wholesale** from
the design export during that merge (reasonable — pure visual file, no
wiring to lose), but `TeamRoster` and `NotificationBell` (`app/settings.jsx`,
`app/notifications.jsx`) are both hand-written and were never in any Design
export, so the export's stylesheet never had their classes at all. Same bug
class as `ConfirmModal`, which the merge session had already caught and
patched — this was a second instance of it I missed the first pass.

**Fix**: grepped every className/`cx()` literal across every `app/*.jsx`
file against the current `styles.css` (not just the files that changed in
the merge) and found two real gaps — `.roster-*` (7 rules) and `.notif-*`
(17 rules, plus 2 dark-theme overrides) — both restored verbatim from the
pre-merge stylesheet (`git show 21f75c2:app/styles.css`). Verified via
`node build.cjs` + serving `dist/` over local HTTP + headless-Chrome render
(clean console, no `PAGE_SIZE`-style regression). `.line-main`
(`receipts.jsx`) and `.part-card-meta` (`parts.jsx`) also came up unstyled
in the same audit, but were unstyled in the *pre-merge* stylesheet too —
pre-existing, not caused by this merge, left alone.

`MERGE-NOTES.md`'s procedure now has an explicit step for this: whenever
`styles.css` is replaced wholesale from a future export, audit *every*
`.jsx` file's classNames against the new stylesheet, not just the files
that changed — a component can lose all its styling without itself being
touched, because the loss happens in the stylesheet.

Committed (`7c3b91e`, frontend repo) and rebuilt `dist-deploy.zip` — **this
still needs to be re-uploaded to Cloudflare Pages** (same manual drag-the-
zip-file process as always; no Cloudflare access in this session).

---

## Session update — 2026-09-15, later same day (supersedes stale bits below)

**Reviewed all 37 rows in `prisma/data/dedup-report.md` (the goBILDA/
ServoCity cross-catalog dedup from the 2026-09-11/12 session) and found the
matcher had been wrongly merging real, distinct parts — a bug, not noise.**
Two concrete failure modes, both now covered by tests in
`tests/nameMatch.test.ts`:
- `sameQualifiers` only checked whether each name *contained* a known word,
  not how many times. "Female / Female to Male JST Y-Extension" vs "Male /
  Male to Female JST Y-Extension" both contain both words once overall, so
  presence-only checking saw them as identical — they're opposite-gender,
  incompatible cable ends. The real signal is the *count* (Female ×2 vs ×1).
- A fixed list of "known distinguishing words" can never anticipate every
  real one. "Gear Motor Input Board A/B/D" (three different boards) and
  "Whippersnapper/Sprout/Bogie/Zip/Junior Runt Rover™" (five separately-named
  kits) both slipped through — a bare trailing letter and a differing proper
  product name were never going to be on anyone's word list.

**Fix, in `src/services/nameMatch.ts`**: replaced the fixed-word-list
`sameQualifiers` with word-frequency comparison — strip a small set of
generic connectives (with/to/and/or/...) and bare numbers
(`sameNumericSpec` already owns those), then require every remaining word to
match in *count*, not just presence. This subsumes everything the old list
caught (encoder/color/duty-class variants — verified, all prior tests still
pass) with nothing left to maintain going forward, since it needs no
enumerated list at all.

**Re-ran `npm run seed` against the fix: all 37 were genuine false
positives — 0 real duplicates.** All 37 parts now exist as their own rows
(verified directly against the database, e.g. `605114`/`605120` really are
"Gear Motor Input Board B"/"D", not a mis-named "Board A"). Also fixed
`seedParts()` to always rewrite `dedup-report.md`, even with zero skips —
the previous report sat unchanged for days describing merges that, as of
this fix, had just been reversed; a stale "everything's fine" report is
worse than no report.

**Worth doing next time a *new* catalog gets merged in**: this class of bug
is specific to cross-catalog dedup (auto-merging with no human review per
row) — re-read `prisma/data/dedup-report.md` after any future dedup run
before trusting it, the same way this session did. The fix is general
(no catalog-specific knowledge baked in), so it should hold up, but a fresh
vendor's naming conventions could still surface a new edge case the same
way male/female-count and proper-names did here.

---

## Session update — 2026-09-15 (supersedes stale bits below)

**Merged a large new Claude Design export into the live frontend** — the
lead's `Seattle Solvers parts inventory Updated Frontend.zip` (backend repo
root, not committed — same as every prior Design export, see the frontend
repo's `MERGE-NOTES.md`, which now has a full 2026-09-15 write-up). Adds a
public/signed-out landing page (About/Parts/Hardware browsable without
logging in), a shared `<Topbar>`, dark theme as the first-paint default
(Orbitron/Inter fonts), and three new screens: `about.jsx` (static),
`hardware.jsx` (fasteners browsed by size), `builds.jsx` (build-list/BOM/
allocation tracking). Frontend repo commit `951830b`.

**Read `Seattle Solvers Parts Inventory Frontend/MERGE-NOTES.md` in full
before the next Design export** — it has the complete file-by-file merge
outcome. Short version: `api.jsx` was NOT merged wholesale (the export
ships a ~1200-line fake in-browser demo backend every time; kept the real
126-line live-only client, added new method entries for Builds/Hardware by
hand). Several real regressions were caught and re-applied — `<Waking>`
(the cold-start retry screen) was gone entirely, `NotificationBell`'s
notification-to-part jump was dropped, `receipts.jsx` lost delete-receipt
confirmation and error handling on confirm, `ui.jsx` lost `ConfirmModal`
(plus its CSS, since the export's `styles.css` never defined it). Also
caught a real **bundling bug**, not an export problem: `parts.jsx` and the
new `hardware.jsx` both declared top-level `const PAGE_SIZE` — harmless as
separate `<script>` tags, a fatal `SyntaxError` once `build.cjs`
flat-concatenates every screen into one bundle, which silently killed the
*entire app* (blank `#root`, no error shown anywhere except the browser
console) — only caught by actually rendering the built `dist/index.html` in
headless Chrome, not by syntax-checking each file individually. Renamed to
`HARDWARE_PAGE_SIZE`. **Any future merge that adds a new screen must grep
every bundled file for top-level name collisions** — `dedupeReactHooks()` in
`build.cjs` only handles the `const { x } = React;` destructuring pattern.

**One feature deliberately not shipped**: the export's new "receipt storage
retention" settings section calls `PATCH /teams/current` with a
`receiptFileRetention` field that route's zod schema doesn't have — Zod
silently strips unknown fields, so it would return 200 and appear to save
while doing nothing, forever, with no way for a user to tell. Left out of
`settings.jsx` entirely (that file needed no other changes — it already had
everything else this export's version had, plus the account/team panels the
export dropped).

**Builds and Hardware are live but backend-less on purpose.** Both call
routes that don't exist yet (`/build-lists`, `/inventory/:id/allocations`,
`/parts/:id/bom`, `/parts/hardware-facets`, `/inventory/convertible`,
`/inventory/:id/convert`, `/inventory/:id/expand-kit`) — this is the
existing, intentional graceful-degradation path (`api.stale(path)` /
`<StaleRouteNote>`), not a bug to fix. **Not built this session** — deciding
whether/which of these becomes a real feature is a separate, larger
conversation with George's lead, not routine merge work.

**`dist-deploy.zip` is rebuilt and ready, not yet confirmed deployed** —
same manual drag-into-Cloudflare-Pages step as always (project `parts`).

**Verification method worth repeating next time**: `node --check` (or
esbuild's syntax check) on each file individually does NOT catch a
duplicate top-level `const` across files — only rendering the actual bundled
`dist/index.html` does. Serve `dist/` over local HTTP (not `file://` —
Chrome headless silently refuses `fetch()` from a `file://` origin, which
looks identical to a real bug) and render it in headless Chrome
(`--headless --disable-gpu --dump-dom`), checking both the DOM actually
mounted something and the console log for errors.

---

## Session update — 2026-09-12 (later same day, supersedes stale bits below)

**Security: Claude Code is now denied read access to `.env`/`.env.local` in
this repo.** George's explicit request, after a long stretch of this session
running direct DB scripts — the concern was standing risk, not anything that
went wrong. Added `.claude/settings.json` (project-level, committed, so it
applies to any Claude Code session opened in this repo, not just this one):
```json
{ "permissions": { "deny": ["Read(.env)", "Read(.env.local)", "Grep(.env)", "Grep(.env.local)"] } }
```
Verified live: both the Read tool and Bash (`cat`/`node readFileSync`)
refuse `.env`; `.env.example` (placeholders only) still works normally.
**This is a real behavioral change for future sessions** — any script that
needs `DATABASE_URL` etc. still works fine (dotenv loads `.env` at Node
runtime, unaffected — this only blocks Claude's own Read/Grep/cat of the
file), but Claude can no longer casually view secret values in this repo.
Rotating the actual Supabase DB password was recommended but is George's
side to do — not done as part of this change.

**Receipt-extraction model switched from Opus 5 to Sonnet 5**
(`ANTHROPIC_RECEIPT_MODEL` in `src/config/env.ts` + `.env.example`).
Receipt parsing is structured extraction (read printed text, map to known
fields), not deep reasoning — Sonnet performs close to Opus here at 2-3x
lower cost. This is a rarely-hit fallback path already (most receipts are
pasted text/HTML and never call Claude at all — see `claudeShared.ts`), so
the dollar impact either way is small. **If `ANTHROPIC_RECEIPT_MODEL` is
explicitly set in Render's production env vars (not just defaulted in
code), that override needs updating there too** — the code-default change
alone won't affect a deployment that pins its own value.

**Diagnosed, not a bug: "waking the server up" that never resolves on the
school network.** `tools-api-9vfr.onrender.com` gets an actual "Web Filter
Violation" response (confirmed via curl) when hit from the Eastside
Catholic school network — a content filter (Lightspeed/GoGuardian/Securly-
type) blocking the domain outright, most likely a blanket rule against
`*.onrender.com`-style dynamic-hosting domains (the same reason
`*.vercel.app`/`*.pages.dev` sites often get blocked on school networks).
The frontend (`tools.seattlesolvers.com`, its own domain) loads fine on the
same network — it's specifically the backend's raw Render URL that's
blocked, which the app's `<Waking>` retry screen can't distinguish from a
real cold start, so it just spins forever. **Two real fixes, neither done
yet**: (a) give the backend its own custom domain via Cloudflare (like the
frontend already has) — the actual fix, works on any network, but needs a
step in Render's own dashboard (adding the custom domain there) that
requires Render access nobody in this session had; (b) ask the school's IT
to allowlist the onrender.com hostname — faster but doesn't help on any
other filtered network. George's call was "if that's the only issue we're
fine" — parked, not forgotten, if it comes up again.

**Basic SEO added to the frontend** (`Seattle Solvers Parts Inventory
Frontend/index.html`, `Solvers Tools.html`, new `robots.txt`/`sitemap.xml`
at the repo root): a `<meta name="description">`, a canonical link tag, and
a robots.txt pointing at the new sitemap.xml — previously there was no
description at all and no robots.txt/sitemap, so the site could only be
reached by typing the URL directly. `build.cjs` now also copies
`robots.txt`/`sitemap.xml` into `dist/` alongside the existing `assets/`
copy step (was missing before — a `node build.cjs` run wipes and rebuilds
`dist/` from scratch every time, so anything not explicitly copied is
lost). **`dist-deploy.zip` is built and ready but not yet confirmed
deployed** — same manual drag-into-Cloudflare-Pages step as always (project
`parts`). **Also not yet done**: George was going to set up Google Search
Console (Domain property for `seattlesolvers.com`, DNS TXT verification —
offered to add the TXT record via Cloudflare once he has it, since Cloudflare
already manages that domain's DNS) and submit the sitemap; hasn't sent the
verification string yet as of this writing.

Investigated whether Cloudflare Pages deploys could go through the
Cloudflare MCP directly instead of manual zip-and-drag (a long-standing
"someday" item from earlier HANDOFF entries) — **checked, and it's not a
quick win**: direct-upload deployments need a content-hash manifest plus a
separate per-file asset-upload step (the same protocol `wrangler pages
deploy` uses internally), not a single "upload this zip" call. Not
attempted; stick with manual deploy unless someone wants to build that
properly.

**`software@seattlesolvers.com` (the SUPER_ADMIN account) had its password
reset** at George's request (he'd forgotten it) — direct DB mutation
(bcrypt-hashed via the same `bcryptjs` + cost-10 convention `prisma/seed.ts`
uses), with `tokenVersion` incremented alongside it to invalidate every
existing session for that account, matching how the app's own
change-password flow already behaves. Done via a one-off script written
directly into `scripts/`, run once, then deleted immediately afterward (it
briefly contained the new password in plaintext) — nothing about this is
committed to git or persisted anywhere outside the database itself. The new
password was not echoed back after setting it; only George has it.

Confirmed **not a bug**, no code change: a receipt line showed "Not in the
library" for a part that does in fact exist. Root cause was purely timing —
`matchLineItems` runs once at parse time and the result is stored on the
`ReceiptLineItem`, not re-evaluated live; the part in question was added to
the shared catalog (during this same session's ServoCity import) *after*
that particular receipt had already been parsed. `Pick` on a review screen
does a live `GET /parts?q=...` search (confirmed in
`Frontend/app/receipts.jsx`), so it finds newly-added parts fine — the fix
for any one stuck line is just re-picking it manually. **There is no
"re-match a parsed receipt" action anywhere** (no button, no endpoint) — if
this keeps coming up as parts get added to the library after receipts are
parsed, that's a real gap worth building, not done this session.

---

## Session update — 2026-09-11/12 (supersedes stale bits below)

**Seattle Solvers team data wiped, per George's request.** Team "Seattle
Solvers" (#23511): all `InventoryItem`, `ExpenseEntry`, and `Receipt`
(+ its `ReceiptLineItem`s) rows deleted. Team and both user accounts
untouched. The other team on this system ("Catastrophe" #99532) already had
zero inventory/expenses, nothing to do there.

**New feature: email Seattle Solvers staff when a team submits a part to the
shared library.** `src/lib/email.ts` (Resend HTTP API, plain `fetch`, no new
npm dependency), fired from `POST /parts` in `src/modules/parts/routes.ts`
whenever `submitToLibrary` actually creates a new GLOBAL/PENDING part.
Recipients (`PART_SUBMISSION_NOTIFY_EMAILS`) and the sign-in link
(`FRONTEND_URL`) are env-configurable, defaulting to
george.conlan@eastsidecatholicschool.org + software@seattlesolvers.com and
`https://tools.seattlesolvers.com`. **`RESEND_API_KEY` is not yet set** —
until it is (Render env vars), sending is a no-op (logged, never fatal); the
domain also needs verifying in Resend with DNS records added via Cloudflare.

**goBILDA + ServoCity merged into one manufacturer, full ServoCity catalog
imported, several real bugs found and fixed.** The `Manufacturer` row
(slug `gobilda`, id unchanged) is now named "ServoCity/GoBilda" — same id,
`vendor: 'GOBILDA'` unchanged, so no Part FK moved and goBILDA-format
receipt parsing still works as before. Catalog went from 1,512 parts to
**2,506** (Belts: 5 → 103, confirming the "missing pulleys" complaint is
fixed — `timing-belts-pulleys` was a real goBILDA category entirely absent
from `scripts/scrape-gobilda.ts`'s old hand-transcribed list).

New/changed scripts, all sharing `scripts/lib/catalogCrawl.ts`:
- `scripts/discover-categories.ts` — read-only category-tree audit (used
  once to find the gap; output kept at `prisma/data/category-audit*.{json,md}`
  for reference, not re-run regularly).
- `scripts/scrape-gobilda.ts` — gap-fill categories added to `TOP_CATEGORIES`.
- `scripts/scrape-servocity.ts` — new, same crawl logic (identical
  BigCommerce theme/markup on both sites), its own category list (92
  entries: 50 share goBILDA's naming, 42 are ServoCity-specific, mapped by
  hand from sibling categories on the same nav page).
- `prisma/seed.ts` — loads `servocity-parts.json` under the merged
  `gobilda`-slug manufacturer, plus a cross-catalog dedup pass (see below).

**Three real bugs found this session, not just data entry:**
1. `catalogCrawl.ts`'s `fetchPage()` had no request timeout — one
   unresponsive request hung an entire scrape indefinitely. Stalled an
   overnight ServoCity run for ~10 hours with zero errors/progress before
   being caught and killed. Fixed with `AbortSignal.timeout(30_000)`.
2. **This repo can live inside a OneDrive-synced folder.** Both scrapers
   used to checkpoint (rewrite the real `prisma/data/*.json`) after every
   top-level category — ~89 rapid rewrites of the same cloud-synced file.
   A burst of fast categories checkpointing within seconds of each other lost
   a race with OneDrive's sync engine: the script finished and logged the
   true final count, but the file on disk silently reverted to an earlier,
   smaller snapshot with **no error thrown**. Fixed: checkpoints now go to a
   local `os.tmpdir()` path during the crawl; the real file is written once,
   at the very end. **If you ever see a scraper's logged final count not
   match the file on disk again, this is why — don't trust the file without
   re-checking.**
3. Both sites render "related/see-also" cross-sell widget cards using the
   *identical* `data-card-type="product"` markup as real products —
   distinguishable only by `data-sku` being a literal `"rd-<slug>"` string
   (e.g. sku `rd-see-also-servoblocks`, name `SEE ALSO: ServoBlocks®`)
   instead of a real vendor part number. 251 of these had already been
   seeded as real `Part` rows (90 from the original 2026-09-04 goBILDA
   import, predating this session; 161 from this session's ServoCity run)
   before `catalogCrawl.ts` was fixed to skip any `sku` starting with `rd-`.
   Deleted all 251 from the live DB (verified zero
   InventoryItem/ExpenseEntry/ReceiptLineItem/Notification rows referenced
   any of them first).

**Cross-catalog dedup (`prisma/seed.ts` + new `src/services/nameMatch.ts`)
needed two follow-up fixes after shipping — read this before trusting its
first-pass output ever again.** The word-overlap fuzzy matcher
(`pickBestNameMatch`, originally built for receipt-line matching where a
human can correct a bad match) is *not* safe on its own for permanently
skipping catalog rows: two names differing only in a spec number
(`sameNumericSpec`) or a qualifier word — encoder/no-encoder, color,
male/female, duty class (`sameQualifiers`) — score as near-duplicates on
word overlap alone. First real run wrongly auto-skipped 991 genuinely
distinct parts as "duplicates" this way. Both gates are now required before
treating anything as a real duplicate; recovered ~900 of those 991 across
three iterations (991 → 187 → 72 → 37 remaining). `tests/nameMatch.test.ts`
locks in the real false-positive examples that were found. **The remaining
37 skips in `prisma/data/dedup-report.md` are mostly plausible true
duplicates, but a few (e.g. "Gear Motor Input Board B/D" matched against
"Board A") are likely still wrong** — `DISTINGUISHING_QUALIFIERS` in
`nameMatch.ts` is a known-incomplete, evidence-driven list, not a solved
problem; extend it the same way (find a real false-positive in the report,
add the word that distinguishes it) if this dedup pass runs again later.

**Not done / explicitly out of scope this session:** no ServoCity receipt
parser was built (the `Vendor` enum and OCR parsers are untouched — a real
ServoCity invoice upload still has nowhere correct to go). Frontend changes
from this session (build step, favicon — see below) were pushed; this
session's backend commits were not pushed to `origin/main` — confirm with
George before pushing further catalog-import commits, given their size.

---

**Frontend now has a real build step — the "zero build step, static site"
description further down is stale.** The site was loading React's
*development* UMD builds (~1.2MB) plus Babel Standalone (~3.1MB) from a CDN
and re-transpiling all 9 `app/*.jsx` files live in the browser on every visit
— by far the biggest load-time cost, and the thing George asked to fix.
- Swapped `react.development.js` / `react-dom.development.js` for the
  `.production.min.js` builds in all three HTML entry points (`index.html`,
  `Solvers Tools.html`, `dist/index.html`) — real SRI hashes, verified by
  downloading and hashing the actual files rather than guessing them (a
  guessed `integrity` attribute makes the browser refuse to run the script
  at all, so this isn't optional to get right).
- Added `Seattle Solvers Parts Inventory Frontend/build.cjs` (`.cjs` because
  the backend's `package.json` has `"type": "module"`, and Node resolves
  module type from the nearest `package.json` above wherever the script
  lives). Run it with `node build.cjs` from inside the frontend folder — it
  resolves `esbuild` the same way the existing syntax-check convention
  already did, by walking up to the backend's `node_modules` (the frontend
  still has none of its own). It strips JSX from each `app/*.jsx` file ahead
  of time and concatenates them, in the same order as the old `<script>`
  tags, into `dist/app.bundle.js`, then writes a `dist/index.html` that
  loads just that one file — no Babel, no live in-browser transpile.
  - The source files have no `import`/`export`; every top-level `function`
    (screens like `ReceiptsScreen`, helpers like `Btn`) is read as a bare
    global identifier by other files (`app.jsx` references `ReceiptsScreen`
    directly, never through `window.`), so the bundle concatenates them
    flat rather than wrapping each in its own scope — anything else breaks
    every screen reference.
  - The one thing flat concatenation can't tolerate as-is: every file opens
    with its own `const { useState, ... } = React;`, and redeclaring the
    same `const` name twice in one shared scope is a hard `SyntaxError` once
    they're one file instead of nine separate `<script>` elements.
    `dedupeReactHooks()` in `build.cjs` strips hook names already
    destructured by an earlier file in the bundle order before concatenating
    — verified by `node --check`'ing the output, and by rendering
    `dist/index.html` in real headless Chrome (`--dump-dom`) to confirm the
    app actually mounts and reaches its "waking the server up" screen with
    no console errors, not just that it parses.
- **New deploy step, same shape as before:** run `node build.cjs` in the
  frontend folder, *then* zip `dist/` (Python/`zip`, not PowerShell
  `Compress-Archive` — see the existing warning about backslash filenames
  below) and drag it into Cloudflare Pages, same as always. No npm install,
  no CI, still a local command + manual upload.
- `Seattle Solvers Parts Inventory Frontend/app/*.jsx` (the real source) is
  untouched by this — still edit those directly, then re-run the build
  before deploying. `index.html` (root) still references the raw `.jsx`
  files + Babel Standalone and is fine to keep using for quick local preview
  without a build step; only `dist/` is production.

**Favicon added** (George's screenshot showed the generic globe icon in the
tab). Generated `assets/favicon.ico` + `favicon-32.png`/`favicon-192.png`/
`apple-touch-icon.png` from the existing `assets/logo-white.png` (Seattle
Solvers lightbulb/Space Needle mark) — trimmed to its visible bounds, padded
back to a square so it doesn't stretch, and downsized to a few KB instead of
shipping the 740KB source as a favicon. Linked in `index.html` and
`Solvers Tools.html`; `build.cjs` already copies everything under `assets/`
into `dist/assets/`, so no build-script change was needed.

**Deploy confirmed, frontend changes committed (2026-09-11 follow-up).**
`dist-deploy.zip` got dragged into Cloudflare Pages — verified via the
Cloudflare MCP (`GET /accounts/{accountId}/pages/projects`): project `parts`'
latest deployment (`https://5b1b8850.parts-3wg.pages.dev`) succeeded at
2026-09-11 00:11:56 UTC. All of the above (build.cjs, favicon assets, the
JSX/CSS/HTML edits) is now committed in the frontend repo as `77fee1c`.

**Cloudflare agent setup installed** (George ran
`https://developers.cloudflare.com/agent-setup/prompt.md`'s official
Claude Code instructions): `claude plugin marketplace add cloudflare/skills`
+ `claude plugin install cloudflare@cloudflare`, then `/reload-plugins`.
This is a **plugin** (Cloudflare's own skills, e.g. `cloudflare:wrangler`,
`cloudflare:workers-best-practices` — in the available-skills list) that
also bundles Cloudflare MCP tools (`docs`, `search`, `execute` — the last
runs arbitrary JS against the Cloudflare API via `cloudflare.request()`,
pre-scoped to `accountId` = Business@seattlesolvers.com's account).

**OAuth is done** — George completed it in an interactive PowerShell
terminal. Confirmed working in a later (non-interactive) session by calling
`mcp__plugin_cloudflare_cloudflare__execute` directly (the Pages-project
query above) with no auth prompt needed.

**Still open, next session:** revisit whether Pages deploys can go through
the MCP `execute` tool directly (`cloudflare.request()` against the Pages
deployment-creation endpoint) instead of the current "run `node build.cjs`,
zip `dist/`, hand George the zip to drag into the dashboard" manual loop.
Only read endpoints have been exercised so far (listing projects) — check
what a deployment-creation call actually needs (likely a multipart upload of
the built files, similar shape to the Worker-with-bindings example in the
tool's own description) before promising George a fully automated deploy.

---

## Session update — 2026-09-08 (supersedes stale bits below)

**Catalog prices: 100% done.** All 1,726 GLOBAL parts have a `lastKnownPrice`.
Backend commit `1a8f2e6` — see the three `scripts/scrape-*` / `price-*` files.
118 rows had relative/entity-encoded `productUrl`s (now normalised in place);
~90 non-single-product URLs got a family-page median or a category median as a
fallback-of-a-fallback. A random 12-part spot-check matched live goBILDA
exactly. `scripts/price-progress.ts` reports the count; `scrape-prices.ts
--force` re-does everything (~5h) if prices drift.

**Frontend: deployed and live at `https://tools.seattlesolvers.com`.**
- Cloudflare **Pages** project `parts` (→ `parts-3wg.pages.dev`), in the
  **business** account (`Business@seattlesolvers…`). Direct-upload, no Git
  remote. Redeploy = rebuild `Seattle Solvers Parts Inventory Frontend/dist/`
  and drag that folder into the Pages project (Deployments → Create deployment).
- The custom domain works cross-account: the `seattlesolvers.com` zone lives in
  the **original** account (`Solvers.seattle@gm…`, Porkbun registrar). A
  `CNAME tools → parts-3wg.pages.dev` (proxied) was added there, then
  `tools.seattlesolvers.com` was added as a custom domain on the Pages project
  via the "My DNS provider" path — same pattern as `www`. **Do NOT accept
  Cloudflare's "transfer DNS" offer — the zone carries the team's email records.**
- `CORS_ORIGINS` in Render = all three:
  `https://tools.seattlesolvers.com,https://parts-3wg.pages.dev,https://solvers-tools.business-cf9.workers.dev`
  (comma-separated, **no trailing slashes** — a slash silently breaks the match).
- The old `solvers-tools` **Worker** in the business account is now redundant —
  fine to delete once the Pages one is proven.
- If you ever zip for upload: use `zip`/Python (forward slashes). PowerShell
  `Compress-Archive` writes backslashes that Cloudflare stores as literal
  filenames (`app\api.jsx`), which 404s every script.

**Frontend: three commits since `d173ac5`.**
- `42ddb70` — removed the in-browser demo backend entirely. It was masquerading
  as real data on every cold start (6s timeout < Render's 30-60s wake). Now a
  live-only `api.jsx` with a 45s timeout and a `<Waking>` retry screen.
- `36436c4` — merged the 2026-09-06 Claude Design export: Expenses, Settings,
  Usage screens, light/dark theme. **The export rebuilt the demo backend again
  — rejected.** See `MERGE-NOTES.md`.
- `5c365c0` — notifications bell (`app/notifications.jsx`, hand-written) + a
  change-password panel in Settings.

**Database: wiped to a clean slate.** 0 teams. One user:
`software@seattlesolvers.com` (SUPER_ADMIN, no team) — password was reset this
session, George has the new one. The 1,726-part catalog + categories +
manufacturers are intact. Request logs cleared. George will recreate team
#23511 himself via "Start a team".

**Still open:** George recreating the team. (Custom domain + `CORS_ORIGINS`
were done later this same session — see the bullets above; this line was
never updated when that landed. The old `solvers-tools` Worker in the
business account is also still sitting there unused — fine to delete once
the Pages deployment is confirmed proven in production.)

---

## Production status — RESOLVED 2026-09-05

For ~10 commits the live API was stuck: `ENCRYPTION_KEY` (a required
boot-time env var, added for the BYOK feature) had never been set in
Render's dashboard, so every deploy crash-looped on
`Invalid environment configuration: ENCRYPTION_KEY: Required` while Render
quietly kept serving the last build from *before* that commit. `/health`
returned 200 the whole time — it touches neither the DB nor the key — which
is exactly why it went unnoticed.

**Fixed.** George added `ENCRYPTION_KEY` in Render and it deployed clean.
Verified live: 34 paths, both `/api/v1/expenses` routes present,
`/admin/stats` present, `auth/teams` returning the new `{ team, warning }`
contract. `CORS_ORIGINS` also now includes the Claude Design preview origin,
confirmed by preflight (allowed origin echoes back
`access-control-allow-origin`; a random origin does not).

**The key used is the same one in this machine's `.env`** — deliberately, so
local scripts and production can decrypt the same `Team.anthropicApiKeyCiphertext`
values. Do not "helpfully" regenerate it. At the time it was set, zero teams
had a key stored, so nothing was at risk; once teams start saving Anthropic
keys, rotating it means every team must re-enter theirs.

**How to re-verify production is current** (do this after any deploy — a
green Render dashboard is not proof):
```
curl https://tools-api-9vfr.onrender.com/health
curl -o /dev/null -w "%{http_code}\n" https://tools-api-9vfr.onrender.com/api/v1/expenses   # 401 (needs auth) is correct, 404 means stale
curl https://tools-api-9vfr.onrender.com/openapi.json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(Object.keys(JSON.parse(d).paths).length))"   # 34 as of d8f1c9b
```
If the path count is behind, read Render's Events tab for the actual failure
rather than guessing. See "A diagnostic technique worth keeping" below.

## What this project is

`tools.seattlesolvers` — a parts-inventory, catalog-search, and
receipt-reading web app for Seattle Solvers, an FTC (FIRST Tech Challenge)
robotics team, built to eventually be used by other FTC teams too (BYOK
support for Claude usage was added specifically so this scales to many
teams without Seattle Solvers absorbing everyone's AI costs).

**Two separate repos, both local-only git until noted otherwise:**

| | Path | Remote |
|---|---|---|
| Backend (this repo) | `...\2025-2026 Eastside Catholic Portfolio\Seattle Solvers Parts Inventory Website` | `github.com/software282/tools-api` (public) |
| Frontend | `...\2025-2026 Eastside Catholic Portfolio\Seattle Solvers Parts Inventory Frontend` | **none** — local git only, deployed by zipping and uploading to Cloudflare Pages by hand |

The frontend has no CI/CD — there is no automated way to know if it's
"deployed." A zip of it exists at
`...\2025-2026 Eastside Catholic Portfolio\Seattle Solvers Parts Inventory Frontend.zip`,
last regenerated after frontend commit `40f5fb6`. **It is unknown whether
George has actually uploaded this to Cloudflare Pages yet** — that step was
handed to him each time the zip was refreshed, but was never confirmed done.
Ask, don't assume.

## Stack

- **Backend:** TypeScript, Fastify 5, Prisma 6 over Supabase Postgres, Zod
  validation, JWT auth (custom, bcrypt — not Supabase Auth), Supabase Storage
  for receipt files. Deployed on Render (Docker) at
  `https://tools-api-9vfr.onrender.com`. `tools.seattlesolvers.com` DNS still
  doesn't resolve — unfinished custom-domain step, not urgent, the Render URL
  works fine.
- **Frontend:** a *static* React app, source-authored as raw `app/*.jsx`
  with no `import`/`export` (cross-file sharing is bare global identifiers
  and `Object.assign(window, {...})`). `index.html` (a.k.a.
  `Solvers Tools.html`) still loads those files straight off disk via Babel
  Standalone for quick local preview with no build step. **Production is
  different as of 2026-09-10** — see the session update at the top of this
  file: `dist/` is now built by `node build.cjs` (esbuild, JSX-only, no
  bundler-style module resolution since there's nothing to resolve) into one
  `dist/app.bundle.js`, and that's what actually gets zipped and deployed.
  Was authored via Claude Design (the canvas tool); George is doing further
  visual design work there himself. **Important architectural fact learned
  the hard way this session:** a page published *as a Claude Design/claude.ai Artifact* runs in
  a sandbox that blocks `fetch`/XHR to any external host — it cannot talk to
  this API at all from inside that sandbox. The plan is Design produces the
  visual mockup; the actual deployed site is exported as real static files
  and hosted for real (Cloudflare Pages), which has no such restriction. The
  exported files already have this working — `app/api.jsx`'s `API_BASE`
  points at the real Render URL and it functions once actually deployed
  outside claude.ai's sandbox.
- **Database:** one shared Supabase Postgres project, used directly (via
  Prisma) both by this machine during development *and* by the live Render
  deployment — there is no separate dev/prod database. Anything run against
  it from a local script is real, live, shared data. (This is why every
  verification step in this session that touched the DB was done with an
  explicit throwaway team/user, cleaned up immediately after — see the
  pattern below.)

## Everything built this session, in order

Each item below is one real commit on `main`, pushed, typechecked, tested,
and (where it touches data) verified against the live database with a
temporary script before being called done. Read the commit message for the
full reasoning; this is just the index.

1. **`cc89b87` — BYOK (bring your own key).** Removed the single global
   `ANTHROPIC_API_KEY`; each Team now supplies its own Anthropic key via
   `PATCH /teams/current`, encrypted at rest (`src/lib/secretBox.ts`,
   AES-256-GCM keyed by `ENCRYPTION_KEY` — **the env var currently missing on
   Render, see above**). `anthropicApiKeyConfigured: boolean` is the only
   thing ever exposed back; the raw key never round-trips.
2. **`c8b6bdf` — Full catalog import.** Scraped goBILDA's entire public
   catalog (`scripts/scrape-gobilda.ts`, respecting their published 10s
   AI-bot crawl-delay — this took over an hour to run) plus REV's Duo/FTC
   line (compiled by hand, REV's storefront is client-rendered and not
   scrapable the same way). Parts library went from 47 to 1,726. Added two
   new categories (`structure`, `kits`) goBILDA's real taxonomy needed.
3. **`6baac1a` — Search fix + auto image resolution.**
   `src/lib/textSearch.ts` makes search match every typed *word* anywhere
   across name/SKU/description/manufacturer, instead of requiring the whole
   typed phrase to match one field verbatim (a real bug George hit: "1102
   Series Flat Beam 23 Hole" couldn't find
   "...Beam (23 Hole, 184mm Length)..." because of the punctuation). Also:
   `GET /parts/suggest-url` now resolves an image (reads the product page's
   og:image) alongside the URL, so reviewers never hand-paste either.
4. **`dec7147` — No login account for teams.** George found he could log
   directly into `team@seattlesolvers.com` — a shared credential, which
   defeats individual accountability for a team of students. `POST
   /auth/teams` now creates *only* the Team (no user, no token) and returns
   `{ team, warning }` — the invite code is shown exactly once, with an
   explicit warning to save it. Every person, including whoever set up the
   team, gets an account via `POST /auth/join`; the *first* joiner is
   auto-promoted to `TEAM_ADMIN`, everyone after is `MEMBER`.
5. **`d9296d7` — Duplicate-checked library submissions + optional URLs.**
   `productUrl` is now optional on `POST /parts` (only required when
   requesting the shared library) — a personal inventory entry shouldn't
   need a URL. `submitToLibrary` is now a *request*: it's checked against
   existing/pending global parts first (`findLikelyDuplicateGlobalPart`,
   reusing the receipt line-matcher's fuzzy logic) and silently skipped
   (not queued) on a match, reporting `duplicateOf` instead — this is what
   actually prevents duplicate/junk submissions from piling up in the admin
   review queue.
6. **`e428785` — Usage stats + a capacity estimate.** `GET /admin/stats`
   (`SUPER_ADMIN`), backed by a new `RequestLog` table (one row per request,
   `/health` excluded). `SETUP.md` Phase 7.10 has a full capacity writeup for
   "50 teams on their own keys" grounded in Render's/Supabase's actual
   documented limits (fetched fresh that session, not recalled) — TL;DR:
   request volume is a non-issue at that scale; Render free tier's 0.1 vCPU
   is the real first bottleneck (concurrent OCR-heavy photo receipts); Claude
   spend isn't pooled at all since every team pays through its own key.
7. **`0be7f5f` — Fixed CI.** Unrelated regression caught via a "got an email
   saying run failed" report: CI had been red since commit 1 in this list
   (`cc89b87`) because `.github/workflows/ci.yml`'s placeholder env vars were
   never updated to include `ENCRYPTION_KEY` — passed locally the whole time
   only because a real `.env` is always present on this machine. **This is
   the same class of bug as the Render issue above**, caught in CI first but
   apparently not connected to the *also-missing* Render env var at the time.
8. **`d8f1c9b` — Expense tracking.** New `GET /expenses` (+ CSV export),
   grouped by category then part (biggest spend first within each category),
   backed by a new `ExpenseEntry` model — one row per inventory-quantity
   increase with a knowable cost, written atomically alongside the increment
   itself. `Part.lastKnownPrice` is the rolling fallback price. Three
   creation paths: an exact price parsed off a confirmed receipt line
   (`source: RECEIPT`, and refreshes `lastKnownPrice`); a manual
   `POST /inventory/:partId/adjust` with a positive delta on a part that
   already has a price (`source: ESTIMATED` — `PUT`, an absolute set, never
   triggers this, since it's a stock-take correction, not an implied
   purchase); or `POST /parts`'s new `unitCost` field, for when a receipt
   line's price failed to parse and a human types one in while adding the
   part. **The ~1,700 imported catalog parts have no price at all yet** —
   goBILDA's real price isn't in the data the crawler captured (it's
   JS-rendered, not in the static HTML that crawler reads), so this wasn't
   attempted; parts simply pick up a price the first time any team actually
   buys one through a receipt. Backfilling real prices for all of them would
   be a separate large scraping effort, not started.

**Also done, not a backend commit:** two Claude Design prompt briefs were
written and handed to George for the parts of the frontend that needed to
change to match all of the above — category filter buttons + real
pagination for the parts library, the no-login-account sign-up flow, the
optional-URL/duplicate-request part-adding flow, and (most recently) the new
Expenses dashboard screen. These are in the chat history of the session that
just ended, not saved as a file anywhere — if George asks for either again,
they'd need to be reconstructed from this same information (they're derived
directly from the API changes described above, so reconstructing them is
mechanical, not something requiring the old conversation).

**Also done: password reset + account cleanup.** Early in the session, a
stray test team/user (`team@seattlesolvers.com` from an earlier test run)
was found and deleted at George's request, then a *different*, real
`team@seattlesolvers.com` account (which George had separately created) had
its password reset because bcrypt hashes can't be recovered, only reset. If
George mentions login trouble on that specific account again, check whether
it's the same one or ask what changed since.

## A diagnostic technique worth keeping

Twice this session, "it works on my machine" turned out to be **exactly**
the bug (CI, then Render) — both times because a required env var existed in
`.env` locally but nowhere else. The fix both times was: **reproduce the
failure exactly, with the exact env the failing environment actually has,
before proposing a fix.** For Render specifically: build production
(`npm run build`), then run `node dist/src/server.js` with `NODE_ENV=production`
and *only* the env vars `render.yaml` declares (sourced from the real `.env`
but injected via a small Node launcher script, not shell `export`/`source` —
the Supabase pooler connection string contains a literal `&`, which a shell
interprets as "run in background" if you naively `source` or `export` it;
this cost real time once already). Compare `openapi.json`'s path count and a
couple of response shapes (fetched live vs. `git show <commit>:openapi.json`)
to figure out *which* commit is actually live, rather than assuming the
latest push made it.

## Open items, roughly in order of urgency

1. ~~Fix the Render `ENCRYPTION_KEY` gap~~ — **done 2026-09-05**, see above.
2. **Expenses screen** doesn't exist in the frontend yet. George is building
   it in Claude Design and will hand over a **fresh zip export** — read
   `MERGE-NOTES.md` in the frontend repo *before* unzipping it over
   anything, or ~190 lines of API wiring get silently reverted.
3. **Cost-prompt UX** for when a receipt line's price fails to parse (the
   frontend needs to ask for `unitCost` then, or that part can never be
   expense-tracked). Same merge applies.
4. ~~Confirm the frontend is actually deployed to Cloudflare Pages~~ —
   **done, resolved 2026-09-08**: live at `tools.seattlesolvers.com`, Pages
   project `parts`. See the session update at the top for what's still
   pending on the Cloudflare front (a ready-to-upload zip, and the new
   Cloudflare MCP/skills setup).
5. ~~Custom domain (`tools.seattlesolvers.com`)~~ — **done, resolved
   2026-09-08**, see above.
6. **Four unused `screens-*.jsx` files** sit in the frontend repo
   (`screens-auth.jsx`, `screens-parts.jsx`, `screens-inventory.jsx`,
   `screens-receipts.jsx`) — an earlier design draft never wired into the
   real entry HTML, dead code. Asked once whether to delete them; no answer
   yet either way.
7. **goBILDA/REV price backfill** — not started, would be a large separate
   scraping effort (see item 8 in the commit list above).

## Conventions this session established — keep following them

- **Every schema/data change gets verified against the live database** with
  a throwaway script (`scripts/_tmp-*.ts`, deleted immediately after) before
  being called done — not just typecheck + unit tests. Clean up any test
  team/user/data created this way in the same script.
- **Migrations run directly against the live Supabase DB** via
  `npx prisma migrate dev` (interactive, for genuinely new local changes) or
  `npx prisma migrate deploy` (non-interactive — required when a migration
  needs to be applied without a TTY, e.g. after hand-editing a migration
  file). There is no separate dev database — treat every migration as
  production.
- **`npm run openapi` gets run and committed** after any route/schema
  change — CI's "Check the committed OpenAPI document is up to date" step
  fails the build otherwise.
- **Every frontend `.jsx` edit gets syntax-checked** with
  `node_modules/.bin/esbuild <file> --outfile=<scratch>` (borrowing esbuild
  from the *backend's* `node_modules`, since the frontend has none of its
  own) before being called done. As of 2026-09-10 there IS a real build
  (`node build.cjs` — see the session update at the top), but it only
  produces `dist/`; the source `app/*.jsx` files are still zero-dependency
  and still worth a quick per-file syntax check while editing.
- **Commit messages explain the *why*, not just the *what*** — this repo's
  whole history (see `SETUP.md` and `README.md` too) is written as much for
  a future reader as for git blame. Keep matching that register.
- **The frontend repo has no remote.** "Push" only ever applies to the
  backend. The frontend's deploy path is: edit `app/*.jsx` → `esbuild`
  syntax-check → `node build.cjs` to rebuild `dist/` → `git commit` (local)
  → regenerate the zip *of `dist/`* (Python/`zip`, not PowerShell
  `Compress-Archive` — see the backslash-filename warning above) → tell
  George to upload it to Cloudflare Pages.

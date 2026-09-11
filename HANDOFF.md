# Handoff — read this first

Written 2026-09-05, end of a long session, because George is switching Claude
accounts and the next session starts with zero memory of any of this. Read
this whole file before touching anything — it front-loads what would
otherwise take an hour of re-deriving.

---

## Session update — 2026-09-10 (supersedes stale bits below)

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

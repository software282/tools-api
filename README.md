# Seattle Solvers Tools API

Backend for **tools.seattlesolvers** — an FTC parts inventory, search, and
receipt-reading service for robotics teams.

This repository is the **backend/API only**. It is intentionally UI-free and
API-first: the frontend will be built later using the Seattle Solvers design
system.

> **Setting this up for the first time?** [`SETUP.md`](SETUP.md) is the ordered
> runbook — GitHub, Supabase, schema, verification, deployment, and the design
> handoff — including which steps have never been executed yet.

> **Start here if you are building the frontend:** [`openapi.json`](openapi.json)
> at the repo root is the complete contract, committed and up to date. You do not
> need a database, a server, or any credentials to read it. Regenerate it any time
> with `npm run openapi`.
>
> **Live API:** <https://tools-api-9vfr.onrender.com> (Render, `oregon` region).
> A custom domain at `tools.seattlesolvers` is pending DNS — see `SETUP.md`
> Phase 7.7. `Authorization: Bearer <token>` on every authenticated route, token
> from `POST /api/v1/auth/login`.

## What it does

1. **Team accounts** — a team is created once (team number + name), and members
   join it with an invite code. JWT-based auth, with `MEMBER` / `TEAM_ADMIN` /
   `SUPER_ADMIN` roles.
2. **Parts library + search** — a curated global library of standard FTC parts
   from major vendors (goBILDA, REV, Axon, Ferra, MelonBotics, Offset, Mata,
   uxcell), filterable by category and manufacturer. Teams can add their own
   parts and optionally submit them to the shared library for review.
3. **Inventory sheet** — per-team quantities of parts, with CSV export.
4. **Receipt reading** — paste an order confirmation (or upload a PDF invoice or
   a photo), and the line items are extracted, matched to parts, and applied to
   inventory once confirmed. See [Receipt intake](#receipt-intake).

## Tech stack

- **Node 20+ / TypeScript**, [Fastify](https://fastify.dev) 5
- **Prisma** ORM over **Supabase Postgres**
- **Supabase Storage** for receipt images
- **Tesseract.js** + **Claude vision** (`@anthropic-ai/sdk`) for receipts
- **Zod** for request/response validation and OpenAPI generation
- **Vitest** for tests

## Getting started

```bash
# 1. Install
npm install

# 2. Configure — copy the example and fill in Supabase + Anthropic values
cp .env.example .env

# 3. Check the setup before running anything that depends on it
npm run db:check

# 4. Create the schema in your Supabase database
npx prisma migrate dev --name init

# 5. Seed categories, manufacturers, the super admin, and standard parts
npm run seed

# 6. Confirm, then run the dev server (http://localhost:3000)
npm run db:check
npm run dev
```

`npm run db:check` is read-only and reports connection, schema, seed, and storage
problems in plain language — worth running first, because Prisma reports a typo'd
password and an unreachable IPv6-only host with the same opaque error code. Read
the connection-string notes in `.env.example` before filling in the URLs.

Useful scripts:

| Script | What it does |
|---|---|
| `npm run dev` | Watch-mode dev server |
| `npm test` | Vitest suite (no database required) |
| `npm run typecheck` | `tsc --noEmit` across src, tests, and tool configs |
| `npm run openapi` | Write `openapi.json` (no database required) |
| `npm run accuracy` | Score receipt parsing against the labelled corpus |
| `npm run db:check` | Diagnose Supabase connection, schema, seed, and storage |
| `npm run images` | Fill in missing part images from each vendor's product page |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run prisma:studio` | Browse the database |

### Prerequisites you provide

- A **Supabase project**: put its connection string in `DATABASE_URL` /
  `DIRECT_URL`, the API URL/keys in `SUPABASE_*`, and create a **private** Storage
  bucket named to match `SUPABASE_RECEIPTS_BUCKET` (default `receipts`). Private
  matters: receipts carry names and shipping addresses, so links are signed per
  request via `GET /receipts/:id/file` rather than stored.
- A **`SUPER_ADMIN_PASSWORD`** of at least 12 characters. `npm run seed` fails
  rather than creating the account that can approve parts for every team with a
  weak or default password. Re-seeding never changes an existing admin's password.
- An **`ANTHROPIC_API_KEY`** is *optional*. It is only used as a fallback when no
  vendor parser recognises a receipt's layout. Pasted confirmations, PDF invoices,
  and clear photos are all handled without it.

## The API contract

- **`openapi.json`** (committed) — the full OpenAPI 3 document. Generate a typed
  client from this. No backend types are exported directly; the schema is the
  source of truth, and CI fails if the committed file drifts from the code.
- **`GET /openapi.json`** — the same document, served at runtime in every
  environment.
- **`GET /docs`** — browsable Swagger UI, **development only**. It is not
  registered in production because `@fastify/swagger-ui` depends on
  `@fastify/static`, which currently has an unpatched path-traversal advisory
  ([GHSA-83w8-p2f5-377r](https://github.com/advisories/GHSA-83w8-p2f5-377r)) with
  no fix available.

All routes are under `/api/v1`. Auth is a Bearer JWT from `/auth/login`, team
create, or team join.

| Area | Endpoint | Notes |
|------|----------|-------|
| Auth | `POST /auth/teams` | Create team + first admin (`TEAM_ADMIN`), returns invite code |
| | `POST /auth/join` | Sign up and join a team via invite code |
| | `POST /auth/login` | Email + password → JWT |
| | `GET /auth/me` | Current user + team |
| | `GET /auth/invite-code` | Own team's invite code |
| | `PATCH /auth/password` | Change password; revokes all sessions, returns a fresh token |
| Teams | `GET /teams/current` | Team detail + member count |
| | `PATCH /teams/current` | Rename team (`TEAM_ADMIN`); team number is immutable |
| | `GET /teams/members` | List members |
| | `PATCH /teams/members/:userId` | Promote/demote between `MEMBER` and `TEAM_ADMIN` |
| | `DELETE /teams/members/:userId` | Remove from team (account is kept, access revoked immediately) |
| | `POST /teams/join` | Join with an **existing** account (must be teamless) |
| | `POST /teams/invite-code/rotate` | Issue a new code, invalidating the old one (`TEAM_ADMIN`) |
| Dashboard | `GET /dashboard` | Every count a home screen needs, in one call |
| Catalog | `GET /categories`, `GET /manufacturers` | Reference data for filters |
| Parts | `GET /parts` | Search (`q`, `category`, `manufacturer`, `scope`, `ownedOnly`, paging) |
| | `GET /parts/:id` | Single part |
| | `POST /parts` | Add a team part; `submitToLibrary` queues global review |
| | `PATCH /parts/:id` | Edit own team's custom part |
| | `DELETE /parts/:id` | Delete own team's custom part (refused while stock > 0) |
| Inventory | `GET /inventory` | The team's sheet (paginated). `?lowStock=true` gives the reorder list |
| | `PUT /inventory/:partId` | Set quantity |
| | `POST /inventory/:partId/adjust` | Adjust by a delta |
| | `DELETE /inventory/:partId` | Stop tracking (distinct from quantity 0) |
| | `GET /inventory/export.csv` | Download CSV |
| Receipts | `POST /receipts` | **Paste an order confirmation** (text or HTML email). The common case |
| | `POST /receipts/upload` | multipart (`vendor` + `file`): PDF invoice, or photo of a paper receipt |
| | `GET /receipts` | List (paginated, newest first) |
| | `GET /receipts/:id` | Detail with parsed line items |
| | `GET /receipts/:id/file` | Short-lived signed link to the original file (bucket is private) |
| | `PATCH /receipts/:id/lines/:lineId` | Correct a parsed line/match |
| | `POST /receipts/:id/confirm` | Apply matched lines to inventory (idempotent per line) |
| Admin | `GET /admin/submissions` | Pending library submissions (`SUPER_ADMIN`) |
| | `POST /admin/submissions/:id/approve\|reject` | Review |

## Notes for the design/frontend phase

**Errors.** Every failure — including 404s, validation errors, and rate limits —
uses one envelope:

```json
{ "error": { "code": "PART_NOT_EDITABLE", "message": "…", "issues": [] } }
```

`issues` is present only on `VALIDATION_ERROR`. One parser handles everything.

**Pagination.** `GET /parts`, `GET /inventory`, and `GET /receipts` all return the
same shape, and all accept `page` / `pageSize`:

```json
{ "items": [], "page": 1, "pageSize": 25, "total": 0, "totalPages": 1 }
```

**Auth.** Send `Authorization: Bearer <token>`. Tokens last `JWT_EXPIRES_IN`
(7 days by default) and there is **no refresh flow** — plan for a re-login when a
token expires. Role and team membership are re-read from the database on every
authenticated request, so a promotion, demotion, or removal takes effect
immediately rather than at token expiry. Two error codes need explicit handling:

- `TOKEN_REVOKED` — the password changed; log in again.
- `ACCOUNT_GONE` — the account was deleted.

**Part images.** Every part has an `imageUrl`, so a catalogue never has to render a
gap. 42 of 47 point at the vendor's own product image; the other 5 carry a
self-contained placeholder SVG, because their vendor page exposes no usable image
(four uxcell belts listed on Amazon, and one REV part whose page now 404s).

A placeholder is a `data:` URI, so `imageUrl.startsWith('data:')` identifies one
if you want to style it differently — a subtle "image coming soon" treatment, say.
Do not assume every image is a remote URL. Real images will replace these as they
are sourced, with no API change.

**Home screen.** `GET /dashboard` returns counts only, in one call: parts tracked,
total units held, low-stock count, receipts awaiting review, receipts that failed,
custom parts, and — for a `SUPER_ADMIN` — submissions pending approval. `team` is
null for a caller with no team, `admin` null unless they are a `SUPER_ADMIN`.
Fetch the matching *lists* from `/inventory`, `/receipts`, and
`/admin/submissions`, which already page and filter.

**Low stock.** Each inventory row carries `minQuantity` (the level the team wants
to keep) and `isLow`. A `minQuantity` of 0 means *not tracked*, so the feature is
opt-in per part — without that, every part run down to zero would show as an
alert and the list would be noise. `GET /inventory?lowStock=true` is the reorder
view, and the natural thing to surface on a dashboard: for a competition team,
"you are down to one spare motor" is the single most actionable signal here.

**Anonymous access.** `GET /parts`, `GET /parts/:id`, `GET /categories`, and
`GET /manufacturers` work without a token and return the approved global library.
Authenticated callers additionally see their own team's custom parts and get an
`ownedQuantity` on each part.

**Rate limits.** Per IP, per minute: 300 globally, 10 on credential endpoints
(login, signup, join, password change), and 30 on receipt intake — the costliest
work here. Exceeding any returns 429 with code `RATE_LIMITED`.

**Receipt review flow.** Both intake routes return parsed line items with a
`matchConfidence` and a possibly-null `matchedPart`. Deliberately, an *ambiguous*
name match returns no match rather than a guess — vendor part names often differ
only in one spec (two goBILDA motors identical but for `19.2:1` vs `26.9:1`), and
guessing silently corrupts inventory. Design for a review step: the user fixes
matches via `PATCH /receipts/:id/lines/:lineId`, then calls `/confirm`.

**CORS.** Set `CORS_ORIGINS` to the frontend origin(s), comma-separated.

## Project structure

```
openapi.json              the API contract (committed, CI-verified)
prisma/schema.prisma      data model
prisma/seed.ts            categories, manufacturers, super admin, standard parts
prisma.config.ts          Prisma config (replaces the deprecated package.json key)
scripts/export-openapi.ts writes openapi.json without booting a server
src/server.ts             Fastify bootstrap, OpenAPI, security, error handling
src/config/env.ts         validated environment config
src/lib/                  prisma, supabase, claude, auth, errors, invite codes
src/plugins/auth.ts       auth guards (requireAuth / requireRole / requireTeam / requireTeamAdmin)
src/modules/              auth, teams, catalog, parts, inventory, receipts, admin
src/services/ocr/         receipt pipeline: text/HTML/PDF extraction, vendor
                          parsers, tesseract, and the claude fallbacks
src/services/partMatch.ts line-item → part matching
tests/                    vitest suites (no database required)
Dockerfile                multi-stage production image
```

## Receipt intake

Nearly every FTC order is placed online, so **receipts are digital by default**.
Digital sources carry exact characters — there is nothing to decipher, only to
organise — which is why the common paths involve no OCR and usually no model call.

| Source | Route | `method` recorded | Cost |
|---|---|---|---|
| Pasted confirmation text | `POST /receipts` | `PASTED_TEXT` | free |
| Pasted HTML email body | `POST /receipts` (auto-detected) | `PASTED_HTML` | free |
| Downloaded PDF invoice | `POST /receipts/upload` | `PDF_TEXT` | free |
| Photo of a paper receipt | `POST /receipts/upload` | `TESSERACT` | free |
| Digital text no parser recognises | either | `CLAUDE_TEXT` | cheap — text only |
| Photo OCR could not read | `POST /receipts/upload` | `CLAUDE_VISION` | most expensive |

Two consequences worth designing around:

- **Claude vision is now a corner case.** It is reached only by a photo that
  defeats both Tesseract and the vendor parsers. A digital receipt never reaches
  it; if a digital layout is unrecognised, the fallback is Claude on *text*, which
  costs a fraction of a vision call.
- **A scanned PDF is not a digital receipt.** If a PDF has no text layer it is a
  scan, and the API returns `PDF_NOT_DIGITAL` asking for a photo instead, rather
  than silently producing nothing.

### Vendor parsers

Parsers are **block-based**: each item anchors on a line (a SKU, or the product
name) and the following lines up to the next anchor form its block, stopping at
any totals line. This is what makes one parser handle both receipt shapes — an
OCR'd photo puts a whole item on one line, a digital confirmation stacks SKU,
name, quantity and prices on separate lines, and both reduce to the same block.

Tuned parsers exist for **goBILDA**, **REV**, **Axon**, and **uxcell** (the last
unverified against a real receipt — see the note in `uxcell.ts`). **Ferra,
MelonBotics, Offset, and Mata deliberately have none**: their SKU formats aren't
known here, and a guessed pattern is worse than no pattern, since it would either
never match or match the wrong thing confidently. They use the generic block
parser, which needs no SKU at all.

Every tuned parser has the generic parser composed behind it, so a receipt that
omits SKUs — or uses a format the pattern doesn't cover — still yields line items
instead of falling through to Claude.

Adding a tuned parser is the highest-leverage work left, and needs one real order
confirmation per vendor to do honestly. Vendor priority: goBILDA → REV → Axon →
Ferra → MelonBotics/Offset → Mata → uxcell.

### Measuring accuracy

Digital receipts are held to **>90% line accuracy**. `npm run accuracy` scores the
deterministic parsers against the labelled corpus in
[`tests/fixtures/receipts/`](tests/fixtures/receipts/) and exits non-zero below the
threshold; CI runs it on every push.

The Claude fallback is excluded from the score on purpose, so the number is
reproducible, free, and moves only when the parsers improve.

> The corpus currently contains **one real fixture and four synthetic ones**. The
> real one (a goBILDA order confirmation) already earned its keep once — it
> caught a name/SKU misalignment bug that every synthetic fixture missed, because
> none of them modeled the real email's layout. One data point per vendor is
> still far too small to call the >90% bar met in general: REV, Axon, and the
> five untuned vendors have zero real coverage so far. Adding more real
> confirmations is what closes that gap; see the corpus README for the (short)
> process.

## Testing status

`npm test` runs 107 tests covering the vendor parsers (both single-line and
stacked digital layouts), HTML email and PDF text extraction, the part-matching
ambiguity rule, the parts visibility/tenancy filter, and the HTTP contract
(error envelope, auth rejection, request validation, rate limiting, security
headers). All of it runs **without a database**, which is also how CI runs it.

**Manually verified against the live Supabase project** (see `SETUP.md` Phase
5): auth, team/invite flows, inventory arithmetic, a real receipt end to end
(including the parser bug it found and the correction workflow), and
confirm-idempotency — confirming the same receipt twice does not double-apply
it.

**Not yet covered by the automated suite:** the same DB-dependent paths above
have no integration tests exercising them against Postgres — they've only been
checked by hand, once, against production data. Adding a throwaway-Postgres
integration suite so this runs in CI, not just manually, is the next gap to
close here.

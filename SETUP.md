# Setup runbook

Everything needed to take this repo to a working service with a Supabase
database, ready to hand to Claude design.

## Where things stand

| Phase | Status |
|---|---|
| 1 — GitHub repo and first commit | **Done** — `software282/tools-api`, CI green, public with all rights reserved |
| 2 — Supabase project | **Done** |
| 3 — Local configuration | **Done** — `db:check` reports 7/7 green |
| 4 — Schema and seed | **Done** — migration applied, 47 parts seeded, password rotated, API serving live data |
| 5 — Prove the flows | **✅ 44/44 verified against the live database**, including 5.5 (found a real parser bug, see below) and 5.6 (corrected both wrong matches; confirmed idempotently) |
| 6 — Real accuracy corpus | **Started.** One real fixture in; the rest of 6.1–6.5 still open |
| 7 — Deployment | **Live** at <https://tools-api-9vfr.onrender.com> — first-ever Docker build passed on the first try. Only 7.7 left: point `tools.seattlesolvers` DNS at it |
| 8 — Hand off to design | Possible now; much better after 4 |

**What 5.5 found:** pasting a real goBILDA order confirmation (2026-08-04)
exposed a genuine off-by-one in the tuned goBILDA parser — invisible on every
synthetic fixture because none of them modeled the real email's layout. The
real email prints each product's name **twice, directly above** its SKU line;
`parseBySku`'s block collector only looks *forward* from its SKU anchor, so
each item's name was silently stolen from the *next* item instead (and the
last item lost its name entirely). All 11 lines parsed with the right SKU/
qty/price but the wrong name.

Fixed in `moveDuplicateNameAfterSku` ([src/services/ocr/vendors/common.ts](src/services/ocr/vendors/common.ts)) —
a narrow pre-pass in `parseBySku` (shared by goBILDA, REV, and uxcell) that
detects a duplicated line immediately before a SKU match and moves it after
the SKU, where the existing block logic already knows how to read it. Verified
safe against every existing fixture (none have that duplicate-line shape) and
against a resubmission of the same real receipt, which now parses all 11 lines
with the correct name, SKU, quantity, and price. The real receipt replaced the
placeholder `tests/fixtures/receipts/gobilda-stacked-text` fixture, which was
explicitly marked for this ("Replace input.txt with a real one").

Two of the eleven lines matched an existing seeded part at 0.63 confidence —
correctly a *different* variant (wrong hole count / wrong gear ratio) than
what was ordered, because neither exact SKU is in the 47-part demo catalogue.
That's a catalogue-coverage gap, not a parser bug, and is exactly what 5.6's
review step exists to catch.

**Immediate next action:** Phase 7.7 — the API is live at
<https://tools-api-9vfr.onrender.com>; only the custom domain (pointing
`tools.seattlesolvers` DNS at it) is left, and that needs your DNS registrar
access. See Phase 7 below. Separately, and not blocking anything: keep feeding
real confirmations into 6.1–6.5 to grow the accuracy corpus past one fixture.

Typecheck, 107 tests, the accuracy harness (100% line accuracy, 1 real + 4
synthetic fixtures), the production build, and the 30-path OpenAPI export all
pass as of this commit.

Phases are ordered by dependency. Phase 4 is the one that makes any endpoint work
for the first time.

---

## Phase 1 — GitHub repo and first commit ✅

- [x] **1.1** Repo created at `software282/tools-api`.
- [x] **1.2** Default branch renamed `master` → `main`.
- [x] **1.3** Confirmed `.env` is ignored and never committed. 
- [x] **1.4** `openapi.json` tracked, so CI's drift check can work.
- [x] **1.5** Two commits pushed; 76 files on `main`; working tree clean.

- [x] **1.6** **CI is green** — run #3, all ten steps.
      <https://github.com/software282/tools-api/actions>

      The first two runs failed on the last step only, `prisma validate`. The
      datasource references `env("DIRECT_URL")` as well as `DATABASE_URL`, and
      `validate` resolves every `env()` in that block — unlike `generate`, which
      does not need the datasource to resolve at all, which is why the earlier
      generate step passed. Fixed in `f1ff7a7` by setting both.

      Masked locally because `prisma.config.ts` reports "Prisma config detected,
      skipping environment variable loading" and supplies the vars itself via
      `dotenv/config`, so a populated `.env` always made it pass on a dev machine.

- [x] **1.7** **Licence decided: none — all rights reserved.** The repo stays
      **public** (visible for portfolio and award submissions) with no `LICENSE`
      file, which is the legal default: readable by anyone, reusable by nobody.

      Consequences, so nobody re-litigates this later:
      - Other FTC teams **cannot** legally use, modify, or redistribute the code,
        so the vendor parsers for Ferra/MelonBotics/Offset/Mata cannot be
        crowdsourced. They can still open issues or send you receipts.
      - GitHub's Terms of Service still permit other GitHub users to **view and
        fork within GitHub** — "all rights reserved" does not switch that off on
        a public repo. Make it private if that matters.
      - There is no warranty disclaimer, which a permissive licence would have
        included. Negligible risk for a team tool, but it is the one protection
        given up by having no file at all.

      Revisit only if the goal changes to sharing with other teams.

**Success:** green CI. ✅ Run #3 passed all ten steps.

---

## Phase 2 — Supabase project ✅

Dashboard labels shift between Supabase releases. Navigate by the *concepts*
below — transaction pooler, session pooler, service role, exposed schemas — not
by exact button text.

### Create the project

- [x] **2.1** Sign in at <https://supabase.com/dashboard>. Signing in with GitHub
      is simplest since you already have an account.

- [x] **2.2** Create an organisation if this is your first project. Name it for
      the team (e.g. `Seattle Solvers`), not for yourself — an org can gain members
      and change owners when you graduate.

- [x] **2.3** **New project**, then:
      - **Name:** `tools-api` (matching the repo keeps things findable)
      - **Database password:** generate a strong one and **save it to a password
        manager immediately** — it is shown once and can only be reset, not
        recovered.
      - ⚠️ **Avoid `@ : / ? # [ ] %` in the password.** It goes into a URI, and
        those characters break parsing. If your generator includes them you must
        percent-encode the password before pasting it into `.env` (`@` → `%40`).
        Choosing an alphanumeric password avoids the whole problem.
      - **Region:** nearest to your users. For Seattle that is **West US
        (Oregon)**. It becomes part of the connection host.
      - **Plan:** Free is sufficient.

- [x] **2.4** Wait for provisioning (~2 minutes) before continuing — the
      connection strings are not final until it finishes.

### Close the Data API hole ⚠️

- [x] **2.5** **Stop the `public` schema being exposed through the Data API.**

      This is the most important step in Phase 2, and it is easy to miss because
      nothing appears broken if you skip it.

      Supabase serves every table in the `public` schema over PostgREST, and the
      `anon` key is *designed* to be embedded in a frontend. Prisma will create all
      of this project's tables in `public` **without RLS enabled**, because it
      manages its own schema. So once a frontend ships the anon key, anyone
      holding it could read and write `User`, `Team`, `InventoryItem`, and
      `Receipt` directly — bypassing every auth check, team-scoping rule, and role
      guard in this API.

      This service never uses the Data API. Verified: the Supabase client is used
      only for Storage ([src/lib/supabase.ts](src/lib/supabase.ts)), and all
      relational access goes through Prisma. So turn the Data API off:

      **Project Settings → API → Exposed schemas → remove `public`.**

      Belt and braces, after Phase 4 creates the tables: enable RLS on every table
      and add no policies, which denies everyone. Prisma connects as the `postgres`
      role, which bypasses RLS, so this API keeps working unchanged.

      Re-check this after any `prisma migrate`, since new tables inherit the same
      exposure.

### Storage

- [x] **2.6** Create a Storage bucket named exactly **`receipts`**
      (Storage → New bucket). The name must match `SUPABASE_RECEIPTS_BUCKET`.

- [x] **2.7** **Leave "Restrict file size" and "Restrict MIME types" off.** The
      API already enforces both — 15 MB in [src/server.ts](src/server.ts), and the
      accepted content types in
      [src/modules/receipts/routes.ts](src/modules/receipts/routes.ts) — and it
      fails loudly when they are exceeded.

      Bucket-level limits would add a *silent* failure instead: the upload is
      best-effort, so a rejection is logged as a warning and the receipt is saved
      with no file, with nothing surfaced to the user. Note also that the API
      accepts the non-standard `image/jpg`, which some browsers send, so a MIME
      whitelist omitting it would quietly drop those uploads.

- [x] **2.8** **Keep the bucket private.** Done, and the code was changed to
      match — it no longer mints public URLs.

      The reasoning, since it is easy to under-rate: an order confirmation is not
      just a list of parts. goBILDA and REV confirmations routinely carry the
      purchaser's **name, email, and shipping address**, which for a school team
      may be a student's home. A public bucket makes that readable by anyone
      holding the URL, and URLs leak — into database rows, API responses, browser
      history, logs, and screenshots. An unguessable UUID is not access control.

      How it works now:
      - `Receipt.filePath` stores the storage **path**, never a URL.
      - Responses carry `hasFile: boolean` instead of `fileUrl`.
      - `GET /receipts/:id/file` authenticates, checks the receipt belongs to the
        caller's team, then returns a freshly signed URL valid for 5 minutes.

      The team check is the real gain: file access now follows current membership.
      With public URLs, someone removed from a team kept working links forever.

      Still only affects *stored files* — pasted-text receipts, the common case,
      never create one.

### Credentials

- [x] **2.9** From **Project → Connect**, copy both connection strings. Do not
      hand-build them; the username format differs per mode.
      - Transaction pooler, port **6543** → `DATABASE_URL`
      - Session pooler, port **5432** → `DIRECT_URL`

      ⚠️ Prefer the pooler host (`…pooler.supabase.com`) over the direct host
      (`db.<ref>.supabase.co`). The direct host resolves to **IPv6 only** unless
      your project has the IPv4 add-on, and on most networks that appears as a
      connection timeout rather than a useful error.

      Each string contains a `[YOUR-PASSWORD]` placeholder — substitute the real
      password from 2.3, percent-encoding it if it contains URI-special
      characters.

- [x] **2.10** Append `?pgbouncer=true&connection_limit=1` to `DATABASE_URL`
      only. Without it, Prisma's prepared statements fail intermittently against
      the transaction pooler, and the symptom appears much later as random query
      errors. Leave `DIRECT_URL` unmodified.

- [x] **2.11** From **Project Settings → API**, copy three values:
      - **Project URL** → `SUPABASE_URL`
      - **anon / public key** → `SUPABASE_ANON_KEY`
      - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY`

      The service-role key bypasses row-level security entirely: server-side only,
      never in a frontend bundle. If your project shows **Publishable** and
      **Secret** keys instead of anon/service_role, those are the newer names for
      the same two things.

**Success:** a provisioned project, the Data API no longer exposing `public`, a
private `receipts` bucket, two connection strings with the password substituted,
and three API values. Nothing is written to `.env` yet — that is Phase 3.

---

## Phase 3 — Local configuration ✅

- [x] **3.1** Create `.env`:
      ```bash
      cp .env.example .env
      ```

- [x] **3.2** Generate a real `JWT_SECRET` (anything under 16 chars is rejected at
      boot):
      ```bash
      node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
      ```

- [x] **3.3** Fill in `DATABASE_URL` and `DIRECT_URL` from 2.5. Keep
      `?pgbouncer=true&connection_limit=1` on `DATABASE_URL` — without it Prisma's
      prepared statements fail intermittently against the transaction pooler, in a
      way that looks like random query errors much later.

- [x] **3.4** Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`. Leave `SUPABASE_RECEIPTS_BUCKET=receipts`.

- [x] **3.5** Set `SUPER_ADMIN_PASSWORD` to **12+ characters**. It is currently
      `change-me` and the seed will refuse it. This account approves parts for
      every team — use a real password from a manager.

- [ ] **3.6** Optionally set `ANTHROPIC_API_KEY`. It is only the fallback for
      receipt layouts no vendor parser recognises; pasted confirmations, PDFs, and
      clear photos all work without it.

- [x] **3.7** Set `CORS_ORIGINS` to your frontend origin(s), comma-separated.
      `http://localhost:5173` is fine for now.

- [x] **3.8** Run the preflight:
      ```bash
      npm run db:check
      ```
      Read-only. It distinguishes a wrong password from an unreachable host — which
      Prisma reports almost identically — and checks the bucket exists.

**Success:** `db:check` reports the connection succeeded. It will still say the
schema is not applied; that is Phase 4.

---

## Phase 4 — Create and seed the schema ✅

**This is the step that has never been run.** The schema validates and the seed
typechecks, but neither has executed. If something breaks, it is most likely here.

> ✅ **`minQuantity` is done** — added before this migration, so it ships in the
> initial schema. Each inventory row has a threshold and an `isLow` flag, and
> `GET /inventory?lowStock=true` returns the reorder list.

- [x] **4.1** Apply the schema. This creates `prisma/migrations/` — commit it
      afterwards.
      ```bash
      npx prisma migrate dev --name init
      ```

- [x] **4.2** Seed reference data, the super admin, and 48 standard parts:
      ```bash
      npm run seed
      ```

- [x] **4.3** Verify:
      ```bash
      npm run db:check
      ```
      Expect: connection ok, schema applied, seed data present, SUPER_ADMIN exists,
      bucket exists.

- [x] **4.4** Commit the migration:
      ```bash
      git add prisma/migrations && git commit -m "Add initial database migration" && git push
      ```

- [x] **4.5** Start the server and confirm it serves:
      ```bash
      npm run dev
      ```
      - `http://localhost:3000/health` → `{"status":"ok",...}`
      - `http://localhost:3000/docs` → Swagger UI (development only)
      - `http://localhost:3000/api/v1/parts` → the seeded library, no auth needed

- [x] **4.6** 🔑 **Database password rotated.** Done immediately after seeding,
      while the schema existed but no team data did. Verified: the old value is
      gone from both URLs, they match, and all seven checks still pass.

      It was pasted into a chat transcript during setup, so it exists somewhere it
      was not meant to. This is the right moment to replace it: the database is
      still empty, and `.env` is the only place the password lives. After Phase 5
      it guards real team data, and after Phase 7 it also lives in a hosting
      provider's secrets — both make this more work and more consequential.

      Worth understanding why it matters: the pooler host is reachable from the
      internet, so this password alone grants direct database access, bypassing
      every auth check, team-scoping rule, and rate limit in the API.

      **Project Settings → Database → Reset database password**, then update it in
      both `DATABASE_URL` and `DIRECT_URL` and re-run `npm run db:check`.

**Success:** `/api/v1/parts` returns real parts. **This is the first moment any
endpoint has worked**, and the point at which design has a live API to build
against.

---

## Phase 5 — Prove the flows end to end ✅

Worth doing manually before design starts, because these paths have never
executed. Use `/docs` to send the requests.

- [x] **5.1** `POST /api/v1/auth/teams` — create your team and first admin. Save
      the returned token and invite code.
- [x] **5.2** `POST /api/v1/auth/login` — confirm the token round-trips.
- [x] **5.3** `GET /api/v1/parts` with the token — each part should now carry
      `ownedQuantity`.
- [x] **5.4** `PUT /api/v1/inventory/{partId}` — set a quantity, then
      `GET /api/v1/inventory` to see the sheet.
- [x] **5.5** `POST /api/v1/receipts` — **paste a real goBILDA or REV order
      confirmation.** Done 2026-08-04 with a real goBILDA confirmation — found
      and fixed a real name/SKU shift bug in the parser (see above). All 11
      lines now parse correctly; 2 matched the wrong seeded variant, which is
      a catalogue-coverage gap for 5.6 to exercise, not a parser defect.
- [x] **5.6** `PATCH /api/v1/receipts/{id}/lines/{lineId}` — fix any wrong or
      missing part match. Done 2026-08-04: cleared both of the real receipt's
      wrong 0.63-confidence matches (`matchedPartId: null`) since the demo
      catalogue doesn't carry either exact SKU ordered. Confirms the review
      step behaves as intended — the wrong-variant guess never reaches
      inventory once corrected.
- [x] **5.7** `POST /api/v1/receipts/{id}/confirm` — apply to inventory, then
      confirm quantities moved. **Run it twice** — the second call should report the
      lines as already applied, not double-count. Re-verified 2026-08-04 against
      the real receipt: `appliedCount: 0` both times (none of the 11 real SKUs
      are in the 47-part demo catalogue) and the skip list was identical on
      both calls — idempotent.
- [x] **5.8** `GET /api/v1/inventory/export.csv` — check the CSV opens cleanly.

**Success:** a receipt became inventory, and confirming twice did not double it.

---

## Phase 6 — Real accuracy measurement (optional, high value)

**Started 2026-08-04.** The corpus now has one real fixture — the goBILDA
confirmation from 5.5, which replaced the placeholder `gobilda-stacked-text`
fixture it was explicitly earmarked to replace — plus four fixtures I invented.
`npm run accuracy` reports **100% line accuracy, 1 real + 4 synthetic**. That
one real data point is what caught the parser bug recorded under 5.5; it's
still far too small a sample to call the >90% bar met in general — REV, Axon,
and the five untuned vendors have zero real coverage. Keep going with 6.1–6.5
for every additional real confirmation.

- [x] **6.1** For each real confirmation from 5.5, create
      `tests/fixtures/receipts/<vendor>-<date>/input.txt` (or `.html` / `.pdf`).
      — done for the one goBILDA confirmation so far.
- [x] **6.2** Write the matching `expected.json` — see
      [the corpus README](tests/fixtures/receipts/README.md). Omit `synthetic`.
- [x] **6.3** Redact anything personal; it does not affect scoring. — nothing to
      redact; the confirmation already used placeholder names/addresses.
- [x] **6.4** ```bash
      npm run accuracy
      ```
- [ ] **6.5** Commit the corpus. CI now gates on a number that means something.

**Success:** the "every fixture is synthetic" warning disappears, and the reported
accuracy reflects real receipts. Partially there — disappears once REV, Axon,
and the untuned vendors also have at least one real fixture each.

---

## Phase 7 — Deployment ✅ (bar the custom domain)

**Deployed 2026-08-04 on Render**, connected straight to GitHub — Render built
the `Dockerfile` on its own infrastructure, so this machine never needed
Docker installed at all. That superseded 7.1/7.2 as originally written (build
and run the image *locally* first); see below for what replaced them. The
first-ever build of this Dockerfile, on the very first attempt, deployed clean
— live at <https://tools-api-9vfr.onrender.com>.

- [x] **7.0 (new)** Prepared everything Render needs before you touch the
      dashboard:
      - Reviewed the `Dockerfile` line by line against the compiled build
        output — the multi-stage copy-not-generate trick for the Prisma client
        in the `--omit=dev` runtime stage is correct, and `dotenv/config`
        no-ops safely with no `.env` file present, which is exactly the
        container/host-secrets case.
      - Confirmed `src/server.ts` already binds to `env.PORT`/`env.HOST`
        (`app.listen({ port: env.PORT, host: env.HOST })`), which is what
        Render's Docker runtime requires — it injects its own `PORT` (default
        10000) rather than reading the Dockerfile's `EXPOSE`. No code change
        needed; the app was already correct for this.
      - Added [render.yaml](render.yaml) — a Blueprint Render reads
        automatically once the repo is connected. Declares `runtime: docker`,
        `region: oregon` (same region as the Supabase project, to avoid
        cross-region DB latency), `healthCheckPath: /health`, and every env
        var that needs a real value as `sync: false` (Render prompts for these
        once, in its dashboard, rather than reading them from this file). Vars
        the app already defaults sensibly are deliberately left out — see the
        comment block at the top of the file for the full reasoning.
      - Validated the YAML parses correctly and that `npm test` (107 passing)
        and `npm run build` are unaffected by the new file.
- [x] **7.1 / 7.2 (superseded)** — Docker isn't installed on this machine, and
      doesn't need to be: Render builds and runs the image on connect. The
      closest available substitute was run instead — the **compiled production
      build** (`npm run build && NODE_ENV=production npm start`) against the
      live Supabase database: `/health` OK, `/docs` correctly 404s, `/openapi.json`
      and `/api/v1/parts` both serve. That's the same code path Render's
      container runs, just not inside a container.
- [x] **7.3** Confirmed above — `/docs` 404s under `NODE_ENV=production`.
      `@fastify/swagger-ui` depends on a package with an unpatched
      path-traversal advisory, so it's a devDependency and absent from the
      production install. The spec is still at `/openapi.json`.
- [x] **7.4** Host picked: **Render**, connecting the GitHub repo directly
      through its web dashboard — no CLI, no local Docker.
- [x] **7.5** Done 2026-08-04. Blueprint connected at
      <https://dashboard.render.com/blueprints>; all secrets entered through
      Render's dashboard prompt (never seen by me). **First-ever build of this
      Dockerfile passed on the first try** — "Deploy live for 331c24d."
      Live at <https://tools-api-9vfr.onrender.com>.
- [x] **7.6** `CORS_ORIGINS` set to the `http://localhost:5173` placeholder
      during the same prompt. Revisit once design hands back a real frontend
      origin.
- [ ] **7.7** Custom domain — **your turn.** In the Render dashboard, the
      `tools-api` service's Settings tab has an "Add Custom Domain" action that
      gives you a CNAME target. Add that CNAME for `tools.seattlesolvers` at
      your DNS registrar. Render issues and renews the TLS certificate
      automatically once the CNAME resolves — no separate certificate step.
- [x] **7.8** Confirmed 2026-08-04 against the live `*.onrender.com` URL:
      `/health` OK, `/docs` 404s (production build correctly omits it),
      `/openapi.json` serves, and `/api/v1/parts` returns real seeded data —
      proving `DATABASE_URL` and the Supabase secrets were entered correctly.
      Re-confirm once more at `https://tools.seattlesolvers.../health` after
      7.7's CNAME resolves.

---

## Phase 8 — Hand off to Claude design

- [ ] **8.1** Give the design pass the repo, and point it at:
      - `openapi.json` — the complete contract
      - `README.md` — auth, error envelope, pagination, receipt review flow
- [ ] **8.2** Tell it the base URL and that a Bearer JWT comes from
      `POST /api/v1/auth/login`.
- [ ] **8.3** Flag the deliberate constraints so it designs around them rather
      than against them:
      - No refresh tokens — plan a re-login when a 7-day JWT expires
      - An *ambiguous* receipt line returns **no** part match rather than a guess,
        so a review step is required, not optional
      - `TOKEN_REVOKED` and `ACCOUNT_GONE` need explicit handling

### Consider closing these first — the design pass will want them

| Gap | Why it matters | Cost |
|---|---|---|
| ~~No product images~~ | **Done.** 42/47 carry the vendor's own product image; the remaining 5 use a self-contained placeholder SVG, so the catalogue never renders a gap | — |
| ~~No dashboard endpoint~~ | **Done.** `GET /dashboard` returns every count a home screen needs in one call | — |
| ~~No low-stock threshold~~ | **Done.** `minQuantity` + `isLow` on every row, `GET /inventory?lowStock=true` for the reorder list, and a `LowStock` column in the CSV export | — |

The third is the only one with a deadline: adding a column before the first
migration is free, afterwards it is a migration.

---

## Known-unverified list

Honest inventory of what's still unverified. (Everything else that used to be
listed here — `prisma migrate dev`, `npm run seed`, every endpoint, CI,
`docker build` — is done; see Phases 1–7 above.)

| Thing | Status |
|---|---|
| Custom domain + TLS on `tools.seattlesolvers` | Not yet pointed there — Phase 7.7. The API is live at the Render-assigned URL in the meantime |
| REV, Axon, and the five untuned vendors | Zero real-receipt coverage in the accuracy corpus — only goBILDA has a real fixture so far |
| uxcell SKU pattern | Unverified against a real receipt; degrades safely to the generic parser |
| Accuracy figure | 100% line accuracy, but on 1 real + 4 synthetic fixtures — too small a sample to call the >90% bar met in general |

## Troubleshooting

| Symptom | Cause |
|---|---|
| Connection timeout, no error detail | IPv6-only direct host. Use the pooler host (2.5). |
| `P1000 authentication failed` | Wrong database password in the connection string. |
| Random query failures after a while | Missing `?pgbouncer=true` on `DATABASE_URL`. |
| `migrate dev` hangs or errors | `DIRECT_URL` is pointing at port 6543; migrations need 5432. |
| Seed fails on `SUPER_ADMIN_PASSWORD` | Under 12 characters (3.5). Intentional. |
| Uploaded receipt URLs do not load | Bucket is private, but the code builds public URLs (2.4). |
| `PDF_NOT_DIGITAL` on a PDF | It is a scan with no text layer. Upload a photo instead. |
| Env validation exits at boot | Read the printed list; `JWT_SECRET` must be 16+ chars. |

Start with `npm run db:check` for anything database- or storage-related.

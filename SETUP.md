# Setup runbook

Everything needed to take this repo to a working service with a Supabase
database, ready to hand to Claude design.

## Where things stand

| Phase | Status |
|---|---|
| 1 — GitHub repo and first commit | **Done** — pushed to `software282/tools-api`, except CI verification and the licence decision |
| 2 — Supabase project | Not started |
| 3 — Local configuration | Not started |
| 4 — Schema and seed | Not started — **the database has still never been connected** |
| 5 — Prove the flows | Blocked on 4 |
| 6 — Real accuracy corpus | Blocked on 5 |
| 7 — Deployment | Can start any time |
| 8 — Hand off to design | Ready now; better after 4 |

Typecheck, 99 tests, the accuracy harness, the production build, and the 28-path
OpenAPI export all pass on the pushed commit.

Phases are ordered by dependency. Phase 4 is the one that makes any endpoint work
for the first time.

---

## Phase 1 — GitHub repo and first commit ✅

- [x] **1.1** Repo created at `software282/tools-api`.
- [x] **1.2** Default branch renamed `master` → `main`.
- [x] **1.3** Confirmed `.env` is ignored and never committed.
- [x] **1.4** `openapi.json` tracked, so CI's drift check can work.
- [x] **1.5** Two commits pushed; 76 files on `main`; working tree clean.

- [ ] **1.6** **Check the first CI run:**
      <https://github.com/software282/tools-api/actions>

      Five steps, none needing a database: typecheck, tests, the accuracy
      harness, the OpenAPI drift check, and `prisma validate`. **Never executed
      before**, so expect a fix on the first run. Most likely differences are
      Ubuntu vs Windows behaviour around the generated PDF fixture or line
      endings.

- [ ] **1.7** **Decide on a licence.** Undecided. Without a `LICENSE` file a
      public repo is "all rights reserved" — readable but legally unusable, so
      other FTC teams could not contribute vendor parsers or fixes. MIT is the
      community norm. Irrelevant while the repo stays private; easier to add now
      than to retrofit.

      Use `Copyright (c) 2026 Seattle Solvers FTC Team` rather than a personal
      name, so it survives you graduating.

**Success:** green CI.

---

## Phase 2 — Supabase project

- [ ] **2.1** Create a Supabase project. **Save the database password immediately**
      — it is shown once and is not recoverable, only resettable.

- [ ] **2.2** Choose a region close to your users; it becomes part of the
      connection host.

- [ ] **2.3** Create a Storage bucket named exactly **`receipts`**
      (Storage → New bucket).

- [ ] **2.4** ⚠️ **Make the bucket public.** The code calls `getPublicUrl()`
      ([src/lib/supabase.ts:49](src/lib/supabase.ts#L49)), so a private bucket
      produces `fileUrl` values that fail to load.

      **Understand the tradeoff before doing this:** a public bucket means anyone
      with the URL can view an uploaded receipt, and receipts show what your team
      bought and what it cost. URLs contain a random UUID so they are not
      guessable, but they are not protected either.

      Two options:
      - **Public bucket** — works as written, no code change. Fine if you consider
        receipt images low-sensitivity.
      - **Private bucket + signed URLs** — requires changing `uploadReceiptFile` to
        `createSignedUrl` and deciding an expiry, plus a way to re-sign expired
        links. Ask and this can be implemented.

      Note this only affects *stored files*. Pasted-text receipts — the common
      case — never create a file at all.

- [ ] **2.5** From **Project → Connect**, copy both connection strings. Do not
      hand-build them; the username format differs per mode.
      - Transaction pooler, port **6543** → `DATABASE_URL`
      - Session pooler, port **5432** → `DIRECT_URL`

      ⚠️ Prefer the pooler host (`…pooler.supabase.com`) over the direct host
      (`db.<ref>.supabase.co`). The direct host resolves to **IPv6 only** unless
      your project has the IPv4 add-on, and on most networks that appears as a
      connection timeout rather than a useful error.

- [ ] **2.6** From **Project → API**, copy the project URL, the anon key, and the
      **service-role key**. The service-role key bypasses row-level security —
      server-side only, never in a frontend bundle.

**Success:** you have a project, a public `receipts` bucket, two connection
strings, and three API values.

---

## Phase 3 — Local configuration

- [ ] **3.1** Create `.env`:
      ```bash
      cp .env.example .env
      ```

- [ ] **3.2** Generate a real `JWT_SECRET` (anything under 16 chars is rejected at
      boot):
      ```bash
      node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
      ```

- [ ] **3.3** Fill in `DATABASE_URL` and `DIRECT_URL` from 2.5. Keep
      `?pgbouncer=true&connection_limit=1` on `DATABASE_URL` — without it Prisma's
      prepared statements fail intermittently against the transaction pooler, in a
      way that looks like random query errors much later.

- [ ] **3.4** Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`. Leave `SUPABASE_RECEIPTS_BUCKET=receipts`.

- [ ] **3.5** Set `SUPER_ADMIN_PASSWORD` to **12+ characters**. It is currently
      `change-me` and the seed will refuse it. This account approves parts for
      every team — use a real password from a manager.

- [ ] **3.6** Optionally set `ANTHROPIC_API_KEY`. It is only the fallback for
      receipt layouts no vendor parser recognises; pasted confirmations, PDFs, and
      clear photos all work without it.

- [ ] **3.7** Set `CORS_ORIGINS` to your frontend origin(s), comma-separated.
      `http://localhost:5173` is fine for now.

- [ ] **3.8** Run the preflight:
      ```bash
      npm run db:check
      ```
      Read-only. It distinguishes a wrong password from an unreachable host — which
      Prisma reports almost identically — and checks the bucket exists.

**Success:** `db:check` reports the connection succeeded. It will still say the
schema is not applied; that is Phase 4.

---

## Phase 4 — Create and seed the schema

**This is the step that has never been run.** The schema validates and the seed
typechecks, but neither has executed. If something breaks, it is most likely here.

> ⏳ **Last call for free schema changes.** Adding a column before the first
> migration costs nothing; afterwards it costs a migration. The one worth
> considering is a low-stock threshold (`minQuantity` on `InventoryItem`) —
> knowing before a competition that you are down to one spare motor is the most
> useful signal an FTC inventory tool can give. Roughly an hour. See the table in
> Phase 8; decide now or accept the migration later.

- [ ] **4.1** Apply the schema. This creates `prisma/migrations/` — commit it
      afterwards.
      ```bash
      npx prisma migrate dev --name init
      ```

- [ ] **4.2** Seed reference data, the super admin, and 48 standard parts:
      ```bash
      npm run seed
      ```

- [ ] **4.3** Verify:
      ```bash
      npm run db:check
      ```
      Expect: connection ok, schema applied, seed data present, SUPER_ADMIN exists,
      bucket exists.

- [ ] **4.4** Commit the migration:
      ```bash
      git add prisma/migrations && git commit -m "Add initial database migration" && git push
      ```

- [ ] **4.5** Start the server and confirm it serves:
      ```bash
      npm run dev
      ```
      - `http://localhost:3000/health` → `{"status":"ok",...}`
      - `http://localhost:3000/docs` → Swagger UI (development only)
      - `http://localhost:3000/api/v1/parts` → the seeded library, no auth needed

**Success:** `/api/v1/parts` returns real parts. **This is the first moment any
endpoint has worked**, and the point at which design has a live API to build
against.

---

## Phase 5 — Prove the flows end to end

Worth doing manually before design starts, because these paths have never
executed. Use `/docs` to send the requests.

- [ ] **5.1** `POST /api/v1/auth/teams` — create your team and first admin. Save
      the returned token and invite code.
- [ ] **5.2** `POST /api/v1/auth/login` — confirm the token round-trips.
- [ ] **5.3** `GET /api/v1/parts` with the token — each part should now carry
      `ownedQuantity`.
- [ ] **5.4** `PUT /api/v1/inventory/{partId}` — set a quantity, then
      `GET /api/v1/inventory` to see the sheet.
- [ ] **5.5** `POST /api/v1/receipts` — **paste a real goBILDA or REV order
      confirmation.** This exercises the primary receipt path and tells you what
      real accuracy looks like.
- [ ] **5.6** `PATCH /api/v1/receipts/{id}/lines/{lineId}` — fix any wrong or
      missing part match.
- [ ] **5.7** `POST /api/v1/receipts/{id}/confirm` — apply to inventory, then
      confirm quantities moved. **Run it twice** — the second call should report the
      lines as already applied, not double-count.
- [ ] **5.8** `GET /api/v1/inventory/export.csv` — check the CSV opens cleanly.

**Success:** a receipt became inventory, and confirming twice did not double it.

---

## Phase 6 — Real accuracy measurement (optional, high value)

The corpus is currently five fixtures I invented. It proves the parsers behave as
designed and catches regressions, but it is **not** evidence of real-world
accuracy against your >90% bar.

- [ ] **6.1** For each real confirmation from 5.5, create
      `tests/fixtures/receipts/<vendor>-<date>/input.txt` (or `.html` / `.pdf`).
- [ ] **6.2** Write the matching `expected.json` — see
      [the corpus README](tests/fixtures/receipts/README.md). Omit `synthetic`.
- [ ] **6.3** Redact anything personal; it does not affect scoring.
- [ ] **6.4** ```bash
      npm run accuracy
      ```
- [ ] **6.5** Commit the corpus. CI now gates on a number that means something.

**Success:** the "every fixture is synthetic" warning disappears, and the reported
accuracy reflects real receipts.

---

## Phase 7 — Deployment (can run parallel to design)

- [ ] **7.1** Build the image. **Never built** — Docker was not installed on the
      machine where the Dockerfile was written, so expect to iterate.
      ```bash
      docker build -t seattlesolvers/tools-api .
      ```
- [ ] **7.2** Run it against Supabase:
      ```bash
      docker run --rm -p 3000:3000 --env-file .env -e NODE_ENV=production \
        seattlesolvers/tools-api
      ```
      Then check `http://localhost:3000/health`.
- [ ] **7.3** Note that `/docs` is **absent in production** by design —
      `@fastify/swagger-ui` depends on a package with an unpatched path-traversal
      advisory, so it is a devDependency. The spec is still at `/openapi.json`.
- [ ] **7.4** Pick a host (Fly.io, Railway, Render, a VM — anything that runs a
      container).
- [ ] **7.5** Set every `.env` variable as host secrets. `.env` is gitignored and
      is not in the image.
- [ ] **7.6** Update `CORS_ORIGINS` to the real frontend origin once known.
- [ ] **7.7** Point `tools.seattlesolvers` DNS at the host and confirm TLS.
- [ ] **7.8** Confirm `https://tools.seattlesolvers.../health` responds.

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
| **No product images** — 48 seeded parts, 0 `imageUrl` | A parts catalog is mostly images; otherwise the browse screen gets designed twice | Needs real vendor image URLs |
| **No dashboard endpoint** | A home screen is near-certain, and otherwise needs 4–5 calls aggregated client-side | ~1 hour |
| **No low-stock threshold** — no `minQuantity` | The most useful signal in an FTC inventory tool: knowing before a competition you are down to one spare | ~1 hour, **free before Phase 4, needs a migration after** |

The third is the only one with a deadline: adding a column before the first
migration is free, afterwards it is a migration.

---

## Known-unverified list

Honest inventory of what has been written but never executed:

| Thing | Status |
|---|---|
| `prisma migrate dev` | Never run — Phase 4.1 |
| `npm run seed` | Never run — Phase 4.2 |
| Every API endpoint against real data | Never run — Phase 5 |
| `docker build` | Never run — Phase 7.1 |
| GitHub Actions CI | Never run — Phase 1.6 |
| uxcell SKU pattern | Unverified against a real receipt; degrades safely to the generic parser |
| Accuracy figure | 100% on synthetic fixtures only — not real-world accuracy |

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

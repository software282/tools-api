# Seattle Solvers Tools API

Backend for **tools.seattlesolvers** — an FTC parts inventory, search, and
receipt-reading service for robotics teams.

This repository is the **backend/API only**. It is intentionally UI-free and
API-first: the frontend will be built later using the Seattle Solvers design
system. Everything a frontend needs is described by the OpenAPI schema served at
`/docs` (Swagger UI) and `/docs/json` (raw OpenAPI).

## What it does

1. **Team accounts** — a team is created once (team number + name), and members
   join it with an invite code. JWT-based auth.
2. **Parts library + search** — a curated global library of standard FTC parts
   from major vendors (goBILDA, REV, Axon, Ferra, MelonBotics, Offset, Mata,
   uxcell), filterable by category and manufacturer. Teams can add their own
   parts and optionally submit them to the shared library for review.
3. **Inventory sheet** — per-team quantities of parts, with CSV export.
4. **Receipt reading** — upload a vendor receipt image; a hybrid OCR pipeline
   (Tesseract first, Claude vision fallback) extracts line items, matches them to
   parts, and applies confirmed quantities to inventory.

## Tech stack

- **Node + TypeScript**, [Fastify](https://fastify.dev) 5
- **Prisma** ORM over **Supabase Postgres**
- **Supabase Storage** for receipt images
- **Tesseract.js** + **Claude vision** (`@anthropic-ai/sdk`) for receipts
- **Zod** for request/response validation and OpenAPI generation

## Getting started

```bash
# 1. Install
npm install

# 2. Configure — copy the example and fill in Supabase + Anthropic values
cp .env.example .env

# 3. Create the schema in your Supabase database
npx prisma migrate dev --name init

# 4. Seed categories, manufacturers, the super-admin, and standard parts
npm run seed

# 5. Run the dev server (http://localhost:3000, docs at /docs)
npm run dev
```

### Prerequisites you provide

- A **Supabase project**: put its connection string in `DATABASE_URL` /
  `DIRECT_URL`, the API URL/keys in `SUPABASE_*`, and create a Storage bucket
  named to match `SUPABASE_RECEIPTS_BUCKET` (default `receipts`).
- An **`ANTHROPIC_API_KEY`** for the Claude receipt-vision fallback. Without it,
  receipt reading still works via Tesseract + vendor parsers, but low-confidence
  or PDF receipts won't have a fallback.

## API overview

All routes are under `/api/v1`. Auth is a Bearer JWT from
`/auth/login` (or team create/join).

| Area | Endpoint | Notes |
|------|----------|-------|
| Auth | `POST /auth/teams` | Create team + first admin, returns invite code |
| | `POST /auth/join` | Join a team via invite code |
| | `POST /auth/login` | Email + password → JWT |
| | `GET /auth/me` | Current user + team |
| Catalog | `GET /categories`, `GET /manufacturers` | Reference data for filters |
| Parts | `GET /parts` | Search (`q`, `category`, `manufacturer`, `scope`, `ownedOnly`, paging) |
| | `GET /parts/:id` | Single part |
| | `POST /parts` | Add a team part; `submitToLibrary` queues global review |
| Inventory | `GET /inventory` | The team's sheet |
| | `PUT /inventory/:partId` | Set quantity |
| | `POST /inventory/:partId/adjust` | Adjust by a delta |
| | `GET /inventory/export.csv` | Download CSV |
| Receipts | `POST /receipts` | multipart upload (`vendor` + `file`), runs OCR |
| | `GET /receipts`, `GET /receipts/:id` | List / detail |
| | `PATCH /receipts/:id/lines/:lineId` | Correct a parsed line/match |
| | `POST /receipts/:id/confirm` | Apply matched lines to inventory |
| Admin | `GET /admin/submissions` | Pending library submissions (SUPER_ADMIN) |
| | `POST /admin/submissions/:id/approve\|reject` | Review |

## Notes for the design/frontend phase

- **Contract-first:** generate a typed client from `/docs/json` (OpenAPI 3).
  No backend types are exported directly; the schema is the source of truth.
- **Auth:** store the JWT and send `Authorization: Bearer <token>`. `GET /parts`
  works anonymously (global library) and, when authenticated, adds each part's
  `ownedQuantity` for the current team.
- **Errors** always come back as `{ error: { code, message, issues? } }`.
- **CORS:** set `CORS_ORIGINS` to the frontend origin(s).

## Project structure

```
prisma/schema.prisma      data model
prisma/seed.ts            categories, manufacturers, super-admin, standard parts
src/server.ts             Fastify bootstrap, OpenAPI, error handling
src/config/env.ts         validated environment config
src/lib/                  prisma, supabase, claude, auth, errors
src/plugins/auth.ts       JWT auth guards (requireAuth / requireRole / requireTeam)
src/modules/              auth, catalog, parts, inventory, receipts, admin
src/services/ocr/         hybrid receipt pipeline (tesseract, vendor parsers, claude)
src/services/partMatch.ts fuzzy line-item → part matching
```

## Receipt vendor parsers

Tuned text parsers exist for **goBILDA**, **REV**, and **Axon** (highest
priority). Other vendors use a generic text parser and rely more on the Claude
fallback. Claude is the universal fallback, so every vendor works from day one;
add tuned parsers under `src/services/ocr/vendors/` to reduce cost/latency over
time. Vendor priority: goBILDA → REV → Axon → Ferra → MelonBotics/Offset → Mata.

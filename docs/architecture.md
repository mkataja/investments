# Architecture and domain model

## Repo layout

pnpm workspace — [`pnpm-workspace.yaml`](../pnpm-workspace.yaml).

Scripts/versions: root [`package.json`](../package.json). Setup, ports, env: [`README.md`](../README.md), [`.env.example`](../.env.example).


### [`db`](../db)

Drizzle DDL [`schema.ts`](../db/src/schema.ts), migrations, `drizzle.config.ts` — database layer only.


### [`lib`](../lib)

Anything used by both api and web.


### [`api`](../api)

- Hono API
- Keep route handlers thin - put domain logic in service layer: `api/src/service/`
- Generic helpers in `api/src/lib/`


### [`web`](../web)

- Vite + React + Tailwind
- `web/src/api/` — HTTP/API contract helpers and some models


## Infrastructure

- PostgreSQL via Docker Compose; data under `.data/postgres` (gitignored). Image, port, credentials: compose + README.
- API loads `.env` from repo root (see `api` DB bootstrap). `DATABASE_URL` required for a real DB unless tests mock — see code.
- Non-production: API runs pending Drizzle migrations on startup (`api/src/runDevMigrations.ts`) so DB matches schema after pulls. Production should still migrate on deploy (`pnpm db:migrate` or equivalent); startup migration skipped when `NODE_ENV=production`.


## Caching and distribution refresh

- On create: `POST /instruments` for ETF/stock (Yahoo, or provider holdings when `holdings_distribution_url` is set) and `custom` (Seligson FundViewer HTML scrape, or optional `constituents` for weighted composite merge) writes `distributions`, raw caches, and `prices` when data exists (same path as refresh). Create returns 502 if cache write fails (no orphan instrument row).
- Auto refresh when cached `fetchedAt` is older than 24h and the instrument has an open position — not every request.
- API startup may async-refresh stale caches for instruments with open positions (must not block listen).
- `source = manual` `distributions` rows are not overwritten by auto refresh or `POST /instruments/:id/refresh-distribution` (that route returns `{ skipped: true, reason: "manual" }` with 200).


## Data model

Tables, columns, and relations: [`db/src/schema.ts`](../db/src/schema.ts). History and raw SQL: [`db/migrations/`](../db/migrations/). Pipelines and provider-specific behavior (Yahoo, Seligson, composites, geo): [`data-sources.md`](./data-sources.md) and [`docs/data-sources/`](./data-sources/).

Positions are derived from transactions.

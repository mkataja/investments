# Architecture and domain model

## Repo layout

pnpm workspace — [`pnpm-workspace.yaml`](../pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](../db) | Drizzle [`schema.ts`](../db/src/schema.ts), migrations, `drizzle.config.ts` — database layer only |
| [`lib`](../lib) | Shared domain and validation used by api + web: `USER_ID`, currencies, Yahoo/ISIN/holdings URL helpers, geo buckets, broker rules, `DistributionPayload` type, sector ids, composite pseudo-keys, UI-adjacent helpers (`instrumentSelectLabel`, etc.); not Drizzle DDL |
| [`api`](../api) | Hono API (`api/src/index.ts` registers routes only); domain logic in `api/src/service/`, generic helpers in `api/src/lib/` |
| [`web`](../web) | Vite + React + Tailwind; `/`, `/brokers`, `/instruments`, `/instruments/new`, `/instruments/:id/edit`, `/portfolio/import` (Degiro CSV, IBKR CSV, Seligson TSV). Home subcomponents (charts, holdings, transactions, modals) under `web/src/pages/home/` |

Scripts/versions: root [`package.json`](../package.json). Setup, ports, env: [`README.md`](../README.md), [`.env.example`](../.env.example).

## Infrastructure

- PostgreSQL via Docker Compose; data under `.data/postgres` (gitignored). Image, port, credentials: compose + README.
- API loads `.env` from repo root (see `api` DB bootstrap). `DATABASE_URL` required for a real DB unless tests mock — see code.
- Non-production: API runs pending Drizzle migrations on startup (`api/src/runDevMigrations.ts`) so DB matches schema after pulls. Production should still migrate on deploy (`pnpm db:migrate` or equivalent); startup migration skipped when `NODE_ENV=production`.

## Caching and distribution refresh

- On create: `POST /instruments` for ETF/stock (Yahoo, or provider holdings when `holdings_distribution_url` is set) and `custom` (Seligson FundViewer HTML scrape, or optional `constituents` for weighted composite merge) writes `distributions`, raw caches, and `prices` when data exists (same path as refresh). Create returns 502 if cache write fails (no orphan instrument row).
- Auto refresh when cached `fetchedAt` is older than 24h and the instrument has an open position — not every request.
- API startup may async-refresh stale caches for instruments with open positions (must not block listen).
- `source = manual` `distributions` rows are not overwritten by auto refresh or `POST /instruments/:id/refresh-distribution` (that route returns `{ skipped: true, reason: "manual" }` with 200).
- Concurrent `POST /instruments/:id/refresh-distribution` requests (and ETF/stock `PATCH` when URLs change) share one global FIFO queue in `api/src/service/distributionCache/refreshDistribution.ts`: only one distribution refresh runs at a time; others wait. Startup stale-cache refresh uses a separate path.

## Data model

Tables, columns, and relations: [`db/src/schema.ts`](../db/src/schema.ts). History and raw SQL: [`db/migrations/`](../db/migrations/). Pipelines and provider-specific behavior (Yahoo, Seligson, composites, geo): [`data-sources.md`](./data-sources.md) and [`docs/data-sources/`](./data-sources/).

Positions are derived from transactions (net quantity); portfolio scoping and valuation logic live in `api` services and `@investments/lib`, not as separate stored position rows.

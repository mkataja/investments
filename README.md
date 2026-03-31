# Investments tracker

pnpm monorepo: PostgreSQL (Docker), Drizzle, Hono API, Vite React UI. Track transactions across brokers, derive positions, cache ETF/fund geographic and sector distributions (Yahoo Finance + Seligson scrape), and view aggregated portfolio weights.

## Prerequisites

- Node 25+ and [pnpm](https://pnpm.io)
- Docker (for Postgres)

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
```

Postgres is exposed on **host port 50500** (to avoid clashing with other local Postgres instances). Data lives in `.data/postgres` (gitignored).

## Packages

| Package | Role |
| --- | --- |
| `db` | Drizzle schema, SQL migrations, shared types, geo/sector helpers, `USER_ID` |
| `api` | Hono API, valuation, distribution fetch and cache refresh |
| `web` | Vite + React + Tailwind UI |

Details: [`docs/architecture.md`](docs/architecture.md#repo-layout).

## Development

```bash
pnpm dev
```

- Web: [http://localhost:5173](http://localhost:5173) — portfolio UI; `/instruments/new` and `/instruments/:id/edit` for instruments.
- API: [http://localhost:3001](http://localhost:3001) — `GET /health` health check.

Set `VITE_API_URL` in `web` if the API is not on port 3001.

### Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | API + web together |
| `pnpm run ci` | Lint, test, and web + API builds in parallel (`run` is necessary!) |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm docker:up` / `pnpm docker:down` | Postgres container |

## Architecture (overview)

- **Positions** are derived from **transactions** (net quantity per instrument); portfolio views aggregate by selected **`portfolio_id`**.
- **Distributions** (country/sector weights per instrument) are **cached** in the DB; Yahoo `quoteSummary`, optional provider holdings files, and Seligson HTML each feed normalization in **`api`**. Portfolio-level charts merge weights by value.
- **`USER_ID`** is a single hard-coded user in **`@investments/lib`** until auth exists.

**Reference:** [`docs/architecture.md`](docs/architecture.md) (packages, infra, tables, caching), [`docs/data-sources.md`](docs/data-sources.md) (pipelines), [`docs/api.md`](docs/api.md) (imports and core HTTP behavior).

## API notes

**[`docs/api.md`](docs/api.md)** describes imports, instruments, transactions, and portfolio responses—**not** every route; **`api/src/index.ts`** is the full list. **Caching / refresh:** **[`docs/architecture.md` — Caching and distribution refresh](docs/architecture.md#caching-and-distribution-refresh)**.

- Create brokers at `/brokers` (unique **name** per user). Imports match brokers by name: **Degiro**, **Seligson**, **IBKR**.
- **`GET /instruments/lookup-yahoo?symbol=`** — Yahoo preview for the add-instrument form.

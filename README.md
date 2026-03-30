# Investments tracker

pnpm monorepo: PostgreSQL (Docker), Drizzle, Hono API, Vite React UI. Track transactions across brokers, derive positions, cache ETF/fund geographic and sector distributions (Yahoo Finance + Seligson scrape), and view aggregated portfolio weights.

## Prerequisites

- Node 20+ and [pnpm](https://pnpm.io)
- Docker (for Postgres)

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
```

Postgres is exposed on **host port 50500** (to avoid clashing with other local Postgres instances). Data lives in `.data/postgres` (gitignored).

## Development

```bash
pnpm dev
```

- Web: [http://localhost:5173](http://localhost:5173) — portfolio UI, `/instruments/new` to add instruments, `/dev` for Yahoo / Seligson data checks.
- API: [http://localhost:3001](http://localhost:3001) — `GET /health` health check.

Set `VITE_API_URL` in `web` if the API is not on port 3001.

### Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | API + web together |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm docker:up` / `pnpm docker:down` | Postgres container |

### Git commits

Use short, descriptive one-line titles (no `feat:` / `chore:` prefixes).

## API notes

- **Brokers** are seeded (Seligson, Degiro, IBKR, Svea); **`name`** is unique. Manage and add more at `/brokers` (types: exchange, Seligson, cash account). Degiro CSV import uses the broker whose **name** is **Degiro**.
- **Seligson funds** live in `seligson_funds` (fid + name); new rows are created when you add a custom instrument from `/instruments/new` (FID + Seligson-type broker).
- **Instruments** of kind `custom` reference a `seligson_fund` row when using the Seligson integration; `broker_id` identifies the broker. Distributions are scraped from Seligson FundViewer (`view=40`).
- **ETFs/stocks** use `yahooSymbol`; distributions come from Yahoo `quoteSummary` (sectors / regions when available).
- **Cash** (`cash_account`): balance is in `cash_currency` (EUR/USD); `cash_geo_key` is required (ISO-like region label) for display and is not used for region/sector chart weights.
- **Distribution cache** refreshes at least daily for instruments with open positions (API startup; `manual` cache rows are not overwritten).
- **Dev-only routes** `GET /dev/yahoo?symbol=` and `GET /dev/seligson?fid=` are enabled when `NODE_ENV=development` or `DEV_TOOLS=true`.
- **Public routes** `GET /instruments/lookup-yahoo?symbol=` previews Yahoo metadata for the new-instrument UI.

## Packages

- `db` — Drizzle schema and SQL migrations
- `api` — Hono server
- `web` — React + Tailwind

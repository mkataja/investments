# Architecture and domain model

## Repo layout

pnpm workspace — [`pnpm-workspace.yaml`](../pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](../db) | Drizzle schema, migrations, shared types, `currencies.ts`, `yahooSymbol.ts` (Yahoo ticker normalization), `holdingsUrl.ts` (provider holdings URL validation), `geo/` (ISO country + default geo buckets), `brokerInstrumentRules`, `instrumentSelectLabel`, `appUser` (`USER_ID` — hard-coded until auth; no DB default for user identity) |
| [`api`](../api) | Hono API, valuation, distribution fetch/normalize, cache refresh |
| [`web`](../web) | Vite + React + Tailwind; `/`, `/brokers`, `/instruments`, `/instruments/new`, `/instruments/:id/edit`, `/import` (Degiro CSV, IBKR CSV, Seligson TSV). Home subcomponents (charts, holdings, transactions, modals) under `web/src/pages/home/` |

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

## Domain model (mental map)

Authoritative: `db/src/schema.ts` and migrations.

Timestamps: every table has `created_at` and `updated_at` (`timestamptz`, `NOT NULL`, default `now()` on insert). `updated_at` via DB trigger `public.set_updated_at` on `BEFORE UPDATE`. New tables: match existing Drizzle pattern and attach trigger (`EXECUTE FUNCTION public.set_updated_at()`).

Indexes: every FK column. Also filter/join/order columns not already covered by PK/unique. See [`AGENTS.md`](../AGENTS.md).

Conceptually:

- `users`: `name` text, required — no column default; placeholder for auth. One seeded row `name = default`. App uses `USER_ID` from `@investments/db` (`appUser.ts`) for all scoping.
- `portfolios`: per user; unique `(user_id, name)` (`portfolios_user_name_uidx`); `emergency_fund_eur` drives emergency vs excess cash in `GET /portfolio/distributions` asset mix. `transactions` reference `portfolio_id`. `GET/POST /portfolios`, `PATCH /portfolios/:id` for `USER_ID`. Home uses selected portfolio + `GET /portfolio/distributions?portfolioId=` / `GET /transactions?portfolioId=`. Imports: optional multipart `portfolioId` (defaults to lowest-id portfolio).
- `brokers`: `user_id` → `users` (required). Unique `(user_id, name)` (`brokers_user_name_uidx`); `POST /brokers` uses `USER_ID`. No default brokers at startup. `broker_type`: `exchange` (Yahoo equities), `seligson` (mutual funds), `cash_account` (cash only — no equities). CRUD `GET/POST/PATCH/DELETE /brokers`. Allowed instrument kinds: `isInstrumentKindAllowedForBrokerType` in `@investments/db` (`cash_account` broker → `cash_account` instruments only). Imports resolve brokers named Degiro, IBKR, Seligson within `USER_ID`.
- `seligson_funds`: keyed by `fid` (unique); name, notes, active. Created when adding `custom` instrument (`POST /instruments` with `seligsonFid` and Seligson-type `brokerId`) or reused if `fid` exists. Fund name, NAV, holdings: [seligson.md](./data-sources/seligson.md).
- `instruments`: `kind` (`etf` \| `stock` \| `custom` \| `cash_account`). `broker_id` null for `etf`/`stock`; required for `custom` and `cash_account`. `custom` may reference `seligson_fund_id`. Optional `holdings_distribution_url` and `provider_breakdown_data_url` for `etf`/`stock` — [data-sources.md](./data-sources.md).
- `instrument_composite_constituents`: optional rows per parent `instrument_id` — weighted blend of `target_instrument_id` or a `pseudo_key` (`other_equities`, `other_long_government_bonds`, `other_long_corporate_bonds`, `other_short_government_bonds`, `other_short_corporate_bonds`, `ultrashort_bonds`, `cash`). When present, distribution refresh merges child `distributions` instead of scraping the parent. See [seligson.md](./data-sources/seligson.md) (Pharos-style table).
- `transactions`: `user_id` → `users`; `portfolio_id` → `portfolios` (required). `trade_date` is `timestamptz`. `currency`, optional `unit_price_eur`; optional `external_source` / `external_id` for idempotent imports (e.g. Degiro Order ID UUID).
- `distributions`: one row per instrument; `payload` `{ countries, sectors }` — ISO 3166-1 alpha-2 country keys (uppercase), canonical sector ids (`db/src/distribution/sectorIds.ts`). `source`: `yahoo`, `seligson_scrape`, `composite`, `manual`, etc. Raw: `yahoo_finance_cache` (quoteSummary-shaped JSON), `seligson_distribution_cache` (`holdings_html` = FundViewer view=10); composite parents clear FundViewer cache for that instrument. Refresh clears `yahoo_finance_cache` when writing Seligson scrape for that instrument.
- `prices`: latest quoted price and currency per instrument (not history). Yahoo ETF/stock: from `quoteSummary.price` when present; Seligson `custom`: NAV from `FundValues_FI.html` (`seligson_fund_value_cache`). Valuation: `prices` only (`valuePortfolioRowsEur`); non-EUR/USD FX is a temporary stub. Cash accounts: no `prices` row (nominal `cash_currency`).

Positions: net quantity from transactions; `GET /instruments` `netQuantity` sums all user transactions or only `portfolioId` when that query is set.

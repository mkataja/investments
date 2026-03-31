# Architecture and domain model

## Repo layout

pnpm workspace — see [`pnpm-workspace.yaml`](../pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](../db) | Drizzle schema, SQL migrations, shared types, **`currencies.ts`**, **`yahooSymbol.ts`** (canonical Yahoo ticker normalization), **`holdingsUrl.ts`** (provider holdings URL validation), **`geo/`** (ISO country resolution + default geo buckets for portfolio/instruments UI), **`brokerInstrumentRules`**, **`instrumentSelectLabel`** (transaction UI labels), **`appUser`** (`USER_ID` — hard-coded until auth; no DB default for user identity) |
| [`api`](../api) | Hono API, valuation, distribution fetch/normalize, cache refresh |
| [`web`](../web) | Vite + React + Tailwind; portfolio UI at `/`, **brokers** at `/brokers`, **instruments list** at `/instruments`, **new instrument** at `/instruments/new`, **Degiro CSV + IBKR CSV + Seligson TSV import** at `/import` — **`HomePage`** subcomponents (distributions charts, holdings table, transactions table, add/edit transaction modal, edit portfolio modal) live under **`web/src/pages/home/`** |

Scripts and tool versions: **root [`package.json`](../package.json)**. Local setup, ports, and env keys: **[`README.md`](../README.md)** and **[`.env.example`](../.env.example)**.

## Infrastructure

- **PostgreSQL** via Docker Compose; persistent data under **`.data/postgres`** (gitignored). Compose image, host port, and credentials belong in **compose + README**.
- API loads **`.env` from the repository root** (see `api` DB bootstrap). **`DATABASE_URL`** is required for a real DB connection unless tests mock it—exact loading logic is in code.
- In **non-production**, the API **runs pending Drizzle migrations on startup** (`api/src/runDevMigrations.ts`) so the DB matches the schema after pulls. **Production** should still apply migrations in deploy (**`pnpm db:migrate`** or equivalent); startup migration is skipped when **`NODE_ENV=production`**.

## Caching and distribution refresh

- **On create:** **`POST /instruments`** for ETF/stock (Yahoo, or provider holdings when **`holdings_distribution_url`** is set) and **`custom`** (Seligson) **writes `distributions` + raw caches + `prices` (when data is available) immediately** (same fetch path as refresh). Create fails with **502** if the cache write fails (instrument row is not left behind).
- Automatic distribution refresh runs when cached **`fetchedAt`** is older than **24 hours** (and the instrument has an open position)—not on every request.
- **API startup** may **async** refresh stale caches for instruments with **open positions** (must not block server listen).
- **`source = manual`** **`distributions`** rows must **not** be overwritten by automatic refresh or **`POST /instruments/:id/refresh-distribution`** (that route returns **`{ skipped: true, reason: "manual" }`** with 200).

## Domain model (mental map)

Authoritative detail is **`db/src/schema.ts`** and migrations.

**Timestamps:** Every table has **`created_at`** and **`updated_at`** (**`timestamptz`**, `NOT NULL`, default **`now()`** on insert). **`updated_at`** is set automatically on row updates by the database (**`public.set_updated_at`** trigger on **`BEFORE UPDATE`**). When you add a **new** table, define both columns in Drizzle the same way as existing tables and attach the trigger in the migration (reuse **`EXECUTE FUNCTION public.set_updated_at()`**).

Conceptually:

- **`users`:** **`name`** (text, required — no column default on new inserts); placeholder for future auth. Migrations leave one seeded row whose **`name`** is **`default`**. The app uses **`USER_ID`** from **`@investments/db`** (`appUser.ts`) for all scoping; do not rely on DB defaults for user identity.
- **`portfolios`:** named buckets per user; **`(user_id, name)`** is unique (**`portfolios_user_name_uidx`**); **`emergency_fund_eur`** (per portfolio) drives emergency-fund vs excess cash in **`GET /portfolio/distributions`** asset mix. **`transactions`** reference **`portfolio_id`**. **`GET/POST /portfolios`** list and create for **`USER_ID`**; **`PATCH /portfolios/:id`** updates name and/or emergency fund. The home portfolio page uses a selected portfolio and **`GET /portfolio/distributions?portfolioId=`** / **`GET /transactions?portfolioId=`**. Imports accept optional multipart **`portfolioId`** (defaults to the lowest‑id portfolio for the user).
- **`brokers`:** **`user_id`** → **`users`** (required). **`(user_id, name)`** is unique ( **`brokers_user_name_uidx`** ); **`POST /brokers`** and name checks use **`USER_ID`**. The API does not insert default broker rows at startup. **`broker_type`** is **`exchange`** (Yahoo-backed equities), **`seligson`** (custom integrations / mutual funds), or **`cash_account`** (cash balances only—no equities). CRUD via **`GET/POST/PATCH/DELETE /brokers`** ( **`/brokers`** in **`web`** ). Which instrument kinds are allowed per broker: **`isInstrumentKindAllowedForBrokerType`** in **`@investments/db`** (**`cash_account`** → **`cash_account`** instruments only). Import routes resolve named brokers (**`Degiro`**, **`IBKR`**, **`Seligson`**) within **`USER_ID`**.
- **`seligson_funds`:** Seligson products keyed by **`fid`** (unique); **`name`**, notes, active flag. Rows are created when adding a **`custom`** instrument ( **`POST /instruments`** with **`seligsonFid`** and a Seligson-type **`brokerId`** ) or reused if **`fid`** already exists. Fund name resolution, NAV table matching, and holdings scrape: [seligson.md](./data-sources/seligson.md).
- **`instruments`:** **`kind`** (`etf` | `stock` | `custom` | `cash_account`). **`broker_id`** is **null** for **`etf`/`stock`**, **required** for **`custom`** and **`cash_account`** (identifies which broker’s integration applies). **`custom`** rows may reference **`seligson_fund_id`** when that broker’s pipeline uses Seligson fund data. Optional **`holdings_distribution_url`** and **`provider_breakdown_data_url`** for **`etf`/`stock`** (see [data-sources.md](./data-sources.md)).
- **`transactions`:** **`user_id`** → **`users`** (required; matches the broker’s user); **`portfolio_id`** → **`portfolios`** (required). **`trade_date`** is **`timestamptz`** (full instant). Trades with **`currency`** and optional **`unit_price_eur`** for EUR-side reporting; optional **`external_source`** / **`external_id`** for idempotent broker imports (e.g. Degiro **Order ID** UUID).
- **`distributions`:** one row per instrument; **`payload`** is **`{ countries, sectors }`**: **ISO 3166-1 alpha-2** country keys (uppercase) and **canonical sector ids** (vocabulary in **`db/src/distribution/sectorIds.ts`**). **`source`** distinguishes **`yahoo`**, **`seligson_scrape`**, **`manual`**, etc. Raw upstream data lives in **`yahoo_finance_cache`** (full **`quoteSummary`**-shaped JSON) and/or **`seligson_distribution_cache`** (**`holdings_html`** = FundViewer view=10 listing); the refresh path **clears** **`yahoo_finance_cache`** when writing Seligson scrape data for that instrument.
- **`prices`:** latest **quoted price** and **currency** per instrument (not a history table). Yahoo ETF/stock: extracted from **`quoteSummary.price`** when present; Seligson **`custom`**: NAV from **`FundValues_FI.html`** ( **`seligson_fund_value_cache`** holds scraped raw per fund). **Portfolio valuation** uses **`prices` only** ( **`valuePortfolioRowsEur`** ); non‑EUR/USD FX uses a **temporary stub** until a follow-up. Cash accounts have **no** **`prices`** row (nominal **`cash_currency`**).

**Positions** are derived from transactions (net quantity per instrument), scoped per **`portfolio_id`** when aggregating; **`GET /instruments`** **`netQuantity`** sums either all of the user’s transactions or only those **`portfolioId`** when that query is set.

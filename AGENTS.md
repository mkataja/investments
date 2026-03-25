# Agent instructions — investments tracker

This file is for **coding agents** (Cursor, etc.) working in this repository. Read it before making non-trivial changes.

When you change **architecture, conventions, env, API surface, or domain rules** in a way future agents would need to know, **update this file in the same change** (or a follow-up commit) so it stays accurate. Stale agent instructions are worse than none.

## What this project is

Personal **multi-broker portfolio tracker**: transactions are recorded per broker; **positions** are derived from buy/sell history. The main product goal is **aggregated geographic and sector/industry exposure** across the whole portfolio, not just per line item.

**Data sources for distributions** (implementation lives under `api`; details drift—read code when editing):

- **ETFs / stocks:** Yahoo Finance via **`yahoo-finance2`** (`quoteSummary` and related modules). Symbols are stored as **`yahooSymbol`**. Unofficial API—handle absence and schema changes gracefully; **caching** reduces repeated calls.
- **Seligson mutual funds:** **HTML scrape** of Seligson FundViewer (sector/region breakdown view; **`fid`** in the URL must match **`seligson_funds`** in the DB). Users register funds via **`/instruments/new`** (FID only); **`seligson_funds`** rows are **find-or-created** by the API, not edited via a separate admin app.
- **Cash (`cash_account`):** no external fetch for valuation beyond FX—nominal balance is in **`cash_currency`** (see **`SUPPORTED_CASH_CURRENCY_CODES`** in `db`); **`cash_geo_key`** is optional metadata and may be stored but **does not** affect region/sector charts.
- **Stocks:** sector/industry from Yahoo when present; geography is often **issuer-country-only** as a simplification, not economic exposure.

**Cash and geo charts:** `cash_account` positions are **excluded** from aggregated **region** and **sector** distribution weights (non-cash holdings are renormalized to sum to 100%).

## Repo layout

pnpm workspace — see [`pnpm-workspace.yaml`](pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](db) | Drizzle schema, SQL migrations, shared types, **`currencies.ts`** (supported cash currency codes for API + web) |
| [`api`](api) | Hono API, valuation, distribution fetch/normalize, cache refresh |
| [`web`](web) | Vite + React + Tailwind; portfolio UI, **instruments list** at `/instruments`, **new instrument** at `/instruments/new`, dev data checks |

Scripts and tool versions: **root [`package.json`](package.json)**. Local setup, ports, and env keys: **[`README.md`](README.md)** and **[`.env.example`](.env.example)** — **do not duplicate** those here; they change often.

## Infrastructure (stable ideas only)

- **PostgreSQL** via Docker Compose; persistent data under **`.data/postgres`** (gitignored). Compose image, host port, and credentials belong in **compose + README**, not here.
- API loads **`.env` from the repository root** (see `api` DB bootstrap). **`DATABASE_URL`** is required for a real DB connection unless tests mock it—exact loading logic is in code.

## Domain model (mental map)

Authoritative detail is **`db/src/schema.ts`** and migrations. Conceptually:

- **`brokers`:** seeded broker codes (Seligson, Degiro, IBKR, Svea).
- **`seligson_funds`:** Seligson products keyed by **`fid`** (unique); **`name`**, notes, active flag. Rows are created when adding a Seligson instrument ( **`POST /instruments`** with **`seligsonFid`** ) or reused if **`fid`** already exists.
- **`instruments`:** **`kind`** (`etf` | `stock` | `seligson_fund` | `cash_account`), identifiers and cash/Seligson fields as in schema; optional **`mark_price_eur`** when Yahoo quotes are not used.
- **`transactions`:** trades with **`currency`** and optional **`unit_price_eur`** for EUR-side reporting.
- **`distribution_cache`:** one row per instrument; **`payload`** is **`{ regions, sectors }`**-shaped normalized weights; **`source`** distinguishes Yahoo, Seligson scrape, manual, etc.

**Positions** are derived from transactions (net quantity per instrument), not a separate persisted ledger unless you add one.

## Seligson fund name behavior (product contract)

The API **fetches Seligson HTML** to resolve **`name`** when inserting a new **`seligson_funds`** row ( **`fetchSeligsonFundName`** ). Failures are surfaced as HTTP errors with a message body. Exact routes and status codes are defined in **`api`**—read there before changing.

## Caching and refresh

- **On create:** **`POST /instruments`** for ETF/stock (Yahoo) and Seligson fund **writes `distribution_cache` immediately** (same fetch path as refresh). Create fails with **502** if the cache write fails (instrument row is not left behind).
- Automatic distribution refresh is **roughly daily**, not on every request.
- **API startup** may **async** refresh stale caches for instruments with **open positions** (must not block server listen).
- **`source = manual`** cache rows must **not** be overwritten by automatic refresh or **`POST /instruments/:id/refresh-distribution`** (that route returns **`{ skipped: true, reason: "manual" }`** with 200).

## API and web (where to look)

- **HTTP routes, CORS, dev-only routes, validation:** **`api`** entrypoint / modules — single source of truth; **do not maintain a duplicate route list in this file.**
- **`GET /instruments`** returns each instrument row plus **`netQuantity`** (sum of buys minus sells), optional joined **`distribution`** (`fetchedAt`, `source`, `payload` with regions/sectors), and optional **`seligsonFund`** (`id`, `fid`, `name`) for Seligson-linked rows.
- **`POST /instruments/:id/refresh-distribution`** refetches and upserts distribution cache for that instrument (502 on upstream error; 404 if missing; 200 **`{ ok: true }`** or **`{ skipped: true, reason }`** for cash or manual cache).
- **`DELETE /instruments/:id`** removes the instrument after deleting its **`transactions`** and **`distribution_cache`** rows in one DB transaction (204). **`seligson_funds`** rows are not deleted.
- **Portfolio weighting and EUR valuation assumptions:** **`api`** `lib` (and related)—read before changing FX or valuation.
- **Web routes:** **`web`** source — same rule: discover from code.

## Tooling conventions

- **pnpm**; workspace packages **`@investments/db`**, **`@investments/api`**, **`@investments/web`**.
- **Biome** — [`biome.json`](biome.json).

### Before commit or sign-off

- **Lint:** always run **`pnpm lint`** (root **`biome check`**) and fix reported issues before **committing** or **treating work as complete**.
- **Tests:** run **affected** tests—packages, apps, or areas your change touches—before committing or signing off. Prefer the narrowest command that covers your edits (e.g. a package’s **`test`** script via **`pnpm --filter`** when present), not an unnecessary full-repo run unless the change warrants it.

### Git commits

- **Normal, readable one-line titles** describing the change.
- **No** Conventional Commit **prefixes** (`feat:`, `chore:`, `fix:`, `docs:`).
- **No** long bodies by default; extra lines only when truly useful (e.g. breaking changes).
- Prefer **small, well-scoped commits** when practical.

## When changing behavior

- **Schema:** edit Drizzle in `db`, **`pnpm db:generate`**, commit migrations, **`pnpm db:migrate`** locally.
- **Seligson HTML:** parsers are **brittle**—extend with care and prefer tests or fallbacks.
- **Yahoo:** tolerate missing data; avoid hard-failing the whole request for one empty module.

Keep changes **scoped** to the task; avoid drive-by refactors and unrelated new markdown unless requested.

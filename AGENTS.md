# Agent instructions — investments tracker

This file is for **coding agents** (Cursor, etc.) working in this repository. Read it before making non-trivial changes.

When you change **architecture, conventions, env, API surface, or domain rules** in a way future agents would need to know, **update this file in the same change** (or a follow-up commit) so it stays accurate. Stale agent instructions are worse than none.

## What this project is

Personal **multi-broker portfolio tracker**: transactions are recorded per broker; **positions** are derived from buy/sell history. The main product goal is **aggregated geographic and sector/industry exposure** across the whole portfolio, not just per line item.

**Data sources for distributions** (implementation lives under `api`; details drift—read code when editing):

- **ETFs / stocks:** Yahoo Finance via **`yahoo-finance2` v3** (shared **`YahooFinance`** instance in `api`, `quoteSummary` + `quote`). Symbols are stored as **`yahooSymbol`**. Unofficial API—Yahoo may **429 / block** by IP; the API maps that to a readable message and **503**, uses **retries with backoff** on `quoteSummary`, **batches `quote`** for portfolio valuation, and **staggers** startup distribution refresh for Yahoo rows (optional **`YAHOO_MIN_INTERVAL_MS`**, default ~900ms). **Caching** reduces repeated calls.
- **Seligson mutual funds:** **HTML scrape** of Seligson FundViewer (sector/region breakdown view; **`fid`** in the URL must match **`seligson_funds`** in the DB). Users register funds via **`/instruments/new`** (FID only); **`seligson_funds`** rows are **find-or-created** by the API, not edited via a separate admin app.
- **Cash (`cash_account`):** no external fetch for valuation beyond FX—nominal balance is in **`cash_currency`** (see **`SUPPORTED_CASH_CURRENCY_CODES`** in `db`); **`cash_geo_key`** is **required** (DB CHECK) and is an ISO-like region key for **`/instruments`** display. **Not** used for portfolio distribution chart weights (see below).
- **Stocks:** sector/industry from Yahoo when present; geography is often **issuer-country-only** as a simplification, not economic exposure.

**Cash and geo charts:** `cash_account` positions are **excluded** from aggregated **region** and **sector** distribution weights (non-cash holdings are renormalized to sum to 100%).

**Geo buckets:** shared logic in **`@investments/db`** maps ISO codes into default buckets: **`finland`**, **`europe`** (Europe excl. Finland, incl. **Greenland**), **`north_america`** (**US, CA**, U.S. insular areas **PR/VI/GU/AS/MP/UM**), **`asia`** (developed APAC: JP, KR, SG, TW, BN, AU, NZ — **CN/HK/MO** go to **`china`**; other Asia → **`emerging_markets`**), **`china`** (CN + HK + MO), **`emerging_markets`** (Latin America, Caribbean, Mexico, and Asian EM/frontier — see **`db/src/geo/geoBuckets.ts`**), **`unknown`** (region string could not be mapped to ISO — extend **`db/src/geo/countryIso.ts`**). Legacy Seligson macro **`pacific`** maps to **`emerging_markets`**. **`GET /portfolio/distributions`** returns **`regions`** already aggregated to these bucket ids (value-weighted across open positions). Instrument **`distribution.payload.regions`** remain **per-instrument** ISO (or legacy macro) weights until the UI aggregates with the same helpers. **Bucket display icons** and **ISO→flag emoji** (`GEO_BUCKET_DISPLAY_ICONS`, `countryIsoToFlagEmoji`) live in **`db/src/geo/geoBuckets.ts`**.

## Repo layout

pnpm workspace — see [`pnpm-workspace.yaml`](pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](db) | Drizzle schema, SQL migrations, shared types, **`currencies.ts`**, **`geo/`** (ISO country resolution + default geo buckets for portfolio/instruments UI) |
| [`api`](api) | Hono API, valuation, distribution fetch/normalize, cache refresh |
| [`web`](web) | Vite + React + Tailwind; portfolio UI, **instruments list** at `/instruments`, **new instrument** at `/instruments/new`, **Degiro CSV import** at `/import`, dev data checks |

Scripts and tool versions: **root [`package.json`](package.json)**. Local setup, ports, and env keys: **[`README.md`](README.md)** and **[`.env.example`](.env.example)** — **do not duplicate** those here; they change often.

## Infrastructure (stable ideas only)

- **PostgreSQL** via Docker Compose; persistent data under **`.data/postgres`** (gitignored). Compose image, host port, and credentials belong in **compose + README**, not here.
- API loads **`.env` from the repository root** (see `api` DB bootstrap). **`DATABASE_URL`** is required for a real DB connection unless tests mock it—exact loading logic is in code.

## Domain model (mental map)

Authoritative detail is **`db/src/schema.ts`** and migrations. Conceptually:

- **`brokers`:** seeded broker codes (Seligson, Degiro, IBKR, Svea).
- **`seligson_funds`:** Seligson products keyed by **`fid`** (unique); **`name`**, notes, active flag. Rows are created when adding a Seligson instrument ( **`POST /instruments`** with **`seligsonFid`** ) or reused if **`fid`** already exists.
- **`instruments`:** **`kind`** (`etf` | `stock` | `seligson_fund` | `cash_account`), identifiers and cash/Seligson fields as in schema; optional **`mark_price_eur`** when Yahoo quotes are not used.
- **`transactions`:** trades with **`currency`** and optional **`unit_price_eur`** for EUR-side reporting; optional **`external_source`** / **`external_id`** for idempotent broker imports (e.g. Degiro CSV row fingerprint).
- **`distribution_cache`:** one row per instrument; **`payload`** is **`{ regions, sectors }`**-shaped normalized weights. **`regions`** keys are **ISO 3166-1 alpha-2** where the fetch path resolves them (Yahoo country names are normalized on ingest; Seligson uses FundViewer **view=20** “Maajakauma” country table, falling back to legacy macro keys **`europe`**, **`north_america`**, **`pacific`**, **`emerging`** if that table is missing). **`raw_payload`** stores upstream data for reprocessing without refetch: Yahoo **`quoteSummary`** JSON; Seligson **`{ html40, html20 }`** (sector view + country view) or legacy single HTML string; null for manual or legacy rows; **`source`** distinguishes Yahoo, Seligson scrape, manual, etc.

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
- **Degiro CSV:** **`POST /import/degiro`** with multipart field **`file`** (UTF-8 CSV). Parser lives in **`api/src/import/degiroTransactions.ts`** (`csv-parse`, **`relax_column_count`**). Data rows are normalized to **18 columns** (Degiro sometimes omits the empty field before the Order ID UUID). Rows are upserted on **`(broker_id, external_source, external_id)`** with **`external_source = 'degiro_csv'`** and **`external_id`** = sha256 of the canonical row (Degiro Order ID is not unique per line). Only **EUR** trades; each CSV ISIN must resolve to exactly one **`etf`**, **`stock`**, or **`seligson_fund`**. Resolution: **`instruments.isin`** match first; otherwise **OpenFIGI** (`api/src/import/openFigi.ts`) maps the ISIN to Bloomberg listings and derives **Yahoo symbol** candidates (Bloomberg **`exchCode`** → Yahoo suffix) matched against **`instruments.yahoo_symbol`**. Optional **`OPENFIGI_API_KEY`** in root **`.env`** (sent as **`X-OPENFIGI-APIKEY`**). Seligson-only instruments without a Yahoo ticker still need **`isin`** set (or no match). Web: **`/import`**.
- **`POST /instruments/:id/refresh-distribution`** refetches and upserts distribution cache for that instrument (502 on upstream error; 404 if missing; 200 **`{ ok: true }`** or **`{ skipped: true, reason }`** for cash or manual cache).
- **`DELETE /instruments/:id`** removes the instrument after deleting its **`transactions`** and **`distribution_cache`** rows in one DB transaction (204). **`seligson_funds`** rows are not deleted.
- **Portfolio weighting and EUR valuation assumptions:** **`api`** `lib` (and related)—read before changing FX or valuation.
- **Web routes:** **`web`** source — same rule: discover from code.

## Tooling conventions

- **pnpm**; workspace packages **`@investments/db`**, **`@investments/api`**, **`@investments/web`**.
- **Biome** — [`biome.json`](biome.json).

### Web UI polish

When changing **`web`** forms and flows, include small UX improvements when they are an obvious fit—**e.g. focus the primary input** after the user picks a type or advances a step, sensible defaults, keyboard affordances. Keep scope tight: polish that ships with the feature, not unrelated refactors.

Shared **primary** controls (`Button`, `ButtonLink`) and a minimal style reference: **[`web/design-system.md`](web/design-system.md)**.

### Before commit or sign-off

- **Lint:** always run **`pnpm lint`** (root **`biome check`**) and fix reported issues before **committing** or **treating work as complete**.
- **Tests:** run **affected** tests—packages, apps, or areas your change touches—before committing or signing off. Prefer the narrowest command that covers your edits (e.g. a package’s **`test`** script via **`pnpm --filter`** when present), not an unnecessary full-repo run unless the change warrants it. Root **`pnpm test`** runs **`@investments/api`** Vitest (CSV import parser tests).

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

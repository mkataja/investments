# Agent instructions — investments tracker

This file is for **coding agents** (Cursor, etc.) working in this repository.

When you change **architecture, conventions, env, API surface, or domain rules** in a way future agents would need to know, **update this file in the same change** (or a follow-up commit) so it stays accurate. Stale agent instructions are worse than none.

## What this project is

Personal **multi-broker portfolio tracker**: transactions are recorded per broker; **positions** are derived from buy/sell history. The main product goal is **aggregated geographic and sector/industry exposure** across the whole portfolio, not just per line item.

**Data sources for distributions** (implementation lives under `api`; details drift—read code when editing):

- **ETFs / stocks:** Yahoo Finance via **`yahoo-finance2` v3** (shared **`YahooFinance`** instance in `api`, **`quoteSummary` only** for distributions and price snapshots—**no `quote()`**). Symbols are stored as **`yahooSymbol`**, trimmed and uppercased (**`normalizeYahooSymbolForStorage`** in **`@investments/db`**). Unofficial API—Yahoo may **429 / block** by IP; the API maps that to a readable message and **503**, uses **retries with backoff** on `quoteSummary`, and **staggers** startup distribution refresh for Yahoo rows (optional **`YAHOO_MIN_INTERVAL_MS`**, default ~900ms). **Portfolio valuation** uses the **`prices`** table (see below), not live quotes. **Caching** reduces repeated calls.
- **Seligson mutual funds:** **HTML scrape** of Seligson FundViewer (sector/region breakdown view; **`fid`** in the URL must match **`seligson_funds`** in the DB). Users register funds via **`/instruments/new`** (FID + **Seligson-type** broker); **`seligson_funds`** rows are **find-or-created** by the API, not edited via a separate admin app.
- **Cash (`cash_account`):** no external fetch for valuation beyond FX—nominal balance is in **`cash_currency`** (see **`SUPPORTED_CASH_CURRENCY_CODES`** in `db`); **country code** is **required** (DB column **`cash_geo_key`**, **`instruments_cash_geo_required_ck`**). **`POST /instruments`** validates it as **ISO 3166-1 alpha-2** (**`normalizeCashAccountIsoCountryCode`** / **`ISO_3166_1_ALPHA2_CODES`** in **`@investments/db`**); stored uppercase. Legacy rows may predate this. **`display_name`** is **unique among cash instruments** (case-insensitive, trimmed; partial unique index **`instruments_cash_account_display_name_uidx`**); **`POST /instruments`** returns **409** on duplicate name. **Not** used for portfolio distribution chart weights (see below).
- **Stocks:** sector/industry from Yahoo when present; geography is often **issuer-country-only** as a simplification, not economic exposure.

**Cash and geo charts:** `cash_account` positions are **excluded** from aggregated **region** and **sector** distribution weights (non-cash holdings are renormalized to sum to 100%).

**Geo buckets:** shared logic in **`@investments/db`** maps ISO codes into default buckets: **`finland`**, **`europe`** (Europe excl. Finland, incl. **Greenland**), **`north_america`** (**US, CA**, U.S. insular areas **PR/VI/GU/AS/MP/UM**), **`asia`** (developed APAC: JP, KR, SG, TW, BN, AU, NZ — **CN/HK/MO** go to **`china`**; other Asia → **`emerging_markets`**), **`china`** (CN + HK + MO), **`emerging_markets`** (Latin America, Caribbean, Mexico, and Asian EM/frontier — see **`db/src/geo/geoBuckets.ts`**), **`unknown`** (region string could not be mapped to ISO — extend **`db/src/geo/countryIso.ts`**). **`GET /portfolio/distributions`** returns **`regions`** already aggregated to these bucket ids (value-weighted across open positions). Instrument **`distributions.payload.countries`** hold **per-instrument** ISO country weights (Seligson: **Maajakauma table only**, no macro fallback). **Bucket display icons** and **ISO→flag emoji** (`GEO_BUCKET_DISPLAY_ICONS`, `countryIsoToFlagEmoji`) live in **`db/src/geo/geoBuckets.ts`**.

## Repo layout

pnpm workspace — see [`pnpm-workspace.yaml`](pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](db) | Drizzle schema, SQL migrations, shared types, **`currencies.ts`**, **`yahooSymbol.ts`** (canonical Yahoo ticker normalization), **`geo/`** (ISO country resolution + default geo buckets for portfolio/instruments UI), **`brokerInstrumentRules`**, **`instrumentSelectLabel`** (transaction UI labels), **`appUser`** (`USER_ID` — hard-coded until auth; no DB default for user identity) |
| [`api`](api) | Hono API, valuation, distribution fetch/normalize, cache refresh |
| [`web`](web) | Vite + React + Tailwind; portfolio UI, **brokers** at `/brokers`, **settings** at `/settings`, **instruments list** at `/instruments`, **new instrument** at `/instruments/new`, **Degiro CSV + Seligson TSV import** at `/import`, dev data checks |

Scripts and tool versions: **root [`package.json`](package.json)**. Local setup, ports, and env keys: **[`README.md`](README.md)** and **[`.env.example`](.env.example)** — **do not duplicate** those here; they change often.

## Infrastructure (stable ideas only)

- **PostgreSQL** via Docker Compose; persistent data under **`.data/postgres`** (gitignored). Compose image, host port, and credentials belong in **compose + README**, not here.
- API loads **`.env` from the repository root** (see `api` DB bootstrap). **`DATABASE_URL`** is required for a real DB connection unless tests mock it—exact loading logic is in code.
- In **non-production**, the API **runs pending Drizzle migrations on startup** (`api/src/runDevMigrations.ts`) so the DB matches the schema after pulls. **Production** should still apply migrations in deploy (**`pnpm db:migrate`** or equivalent); startup migration is skipped when **`NODE_ENV=production`**.

## Domain model (mental map)

Authoritative detail is **`db/src/schema.ts`** and migrations.

**Timestamps:** Every table has **`created_at`** and **`updated_at`** (**`timestamptz`**, `NOT NULL`, default **`now()`** on insert). **`updated_at`** is set automatically on row updates by the database (**`public.set_updated_at`** trigger on **`BEFORE UPDATE`**). When you add a **new** table, define both columns in Drizzle the same way as existing tables and attach the trigger in the migration (reuse **`EXECUTE FUNCTION public.set_updated_at()`**).

Conceptually:

- **`users`:** **`name`** (text, required — no column default); placeholder for future auth. The migration seeds one row with explicit **`name`** ( **`default`**). The app uses **`USER_ID`** from **`@investments/db`** (`appUser.ts`) for all scoping; do not rely on DB defaults for user identity.
- **`portfolio_settings`:** one row per **`users.id`** (**`user_id`** PK); **`emergency_fund_eur`**. Today the API reads/writes only the default user’s row (**`GET/PATCH /settings`**).
- **`brokers`:** **`user_id`** → **`users`** (required). **`(user_id, name)`** is unique ( **`brokers_user_name_uidx`** ); **`POST /brokers`** and name checks use **`USER_ID`**. The API does not insert default broker rows at startup. **`broker_type`** is **`exchange`** (Yahoo-backed equities), **`seligson`** (custom integrations / mutual funds), or **`cash_account`** (cash balances only—no equities). CRUD via **`GET/POST/PATCH/DELETE /brokers`** ( **`/brokers`** in **`web`** ). Which instrument kinds are allowed per broker: **`isInstrumentKindAllowedForBrokerType`** in **`@investments/db`** (**`cash_account`** → **`cash_account`** instruments only). Import routes resolve named brokers (**`Degiro`**, **`Seligson`**) within **`USER_ID`**.
- **`seligson_funds`:** Seligson products keyed by **`fid`** (unique); **`name`**, notes, active flag. Rows are created when adding a **`custom`** instrument ( **`POST /instruments`** with **`seligsonFid`** and a Seligson-type **`brokerId`** ) or reused if **`fid`** already exists.
- **`instruments`:** **`kind`** (`etf` | `stock` | `custom` | `cash_account`). **`broker_id`** is **null** for **`etf`/`stock`**, **required** for **`custom`** and **`cash_account`** (identifies which broker’s integration applies). **`custom`** rows may reference **`seligson_fund_id`** when that broker’s pipeline uses Seligson fund data.
- **`transactions`:** **`user_id`** → **`users`** (required; matches the broker’s user). **`trade_date`** is **`timestamptz`** (full instant). Trades with **`currency`** and optional **`unit_price_eur`** for EUR-side reporting; optional **`external_source`** / **`external_id`** for idempotent broker imports (e.g. Degiro **Order ID** UUID).
- **`distributions`:** one row per instrument; **`payload`** is **`{ countries, sectors }`**: **ISO 3166-1 alpha-2** country keys (uppercase) and **canonical sector ids** (**`db/src/distribution/sectors.ts`**). **`source`** distinguishes **`yahoo`**, **`seligson_scrape`**, **`manual`**, etc. Raw upstream data lives in **`yahoo_finance_cache`** (full **`quoteSummary`**-shaped JSON) and/or **`seligson_distribution_cache`** (**`country_html`** = FundViewer view=20 Maajakauma, **`other_distribution_html`** = view=40 sectors)—at most one “side” per instrument; the refresh path **clears** the opposite raw table when writing.
- **`prices`:** latest **quoted price** and **currency** per instrument (not a history table). Yahoo ETF/stock: extracted from **`quoteSummary.price`** when present; Seligson **`custom`**: NAV from **`FundValues_FI.html`** ( **`seligson_fund_value_cache`** holds scraped raw per fund). **Portfolio valuation** uses **`prices` only** ( **`valuePortfolioRowsEur`** ); non‑EUR/USD FX uses a **temporary stub** until a follow-up. Cash accounts have **no** **`prices`** row (nominal **`cash_currency`**).

**Positions** are derived from transactions (net quantity per instrument), not a separate persisted ledger unless you add one.

## Seligson fund name behavior (product contract)

The API **fetches Seligson HTML** to resolve **`name`** when inserting a new **`seligson_funds`** row ( **`fetchSeligsonFundName`** ). Failures are surfaced as HTTP errors with a message body. Exact routes and status codes are defined in **`api`**—read there before changing.

**FundValues NAV (`FundValues_FI.html`)** uses shorter link text than FundViewer in some rows; **`fundValuesRowMatchesDbName`** includes **aliases** (e.g. table **`Global Brands`** ↔ DB name containing **Top 25 Brands**) in **`FUND_VALUES_TABLE_LABEL_ALIASES`** in **`api/src/distributions/seligsonFundValues.ts`**.

## Caching and refresh

- **On create:** **`POST /instruments`** for ETF/stock (Yahoo) and **`custom`** (Seligson) **writes `distributions` + raw caches + `prices` (when data is available) immediately** (same fetch path as refresh). Create fails with **502** if the cache write fails (instrument row is not left behind).
- Automatic distribution refresh is **roughly daily**, not on every request.
- **API startup** may **async** refresh stale caches for instruments with **open positions** (must not block server listen).
- **`source = manual`** **`distributions`** rows must **not** be overwritten by automatic refresh or **`POST /instruments/:id/refresh-distribution`** (that route returns **`{ skipped: true, reason: "manual" }`** with 200).

## API and web (where to look)

- **HTTP routes, CORS, dev-only routes, validation:** **`api`** entrypoint / modules — single source of truth; **do not maintain a duplicate route list in this file.**
- **`GET/PATCH /settings`** returns or updates **`{ emergencyFundEur }`** for **`USER_ID`** ( **`portfolio_settings`** row); **`PATCH`** body **`emergencyFundEur`** ≥ **0**.
- **`GET /instruments`** returns each instrument row plus **`netQuantity`** (sum of buys minus sells), optional joined **`distribution`** (`fetchedAt`, `source`, **`payload`** with **`countries` / `sectors`**, optional **`yahooFinance`** / **`seligsonDistribution`** raw snapshots), optional **`broker`** summary (`id`, `name`, `brokerType`) when **`broker_id`** is set, and optional **`seligsonFund`** (`id`, `fid`, `name`) for **`custom`** Seligson-linked rows. Optional query **`brokerId`**: returns only instruments allowed for that broker’s **`broker_type`** (same rules as **`isInstrumentKindAllowedForBrokerType`**), and **`custom`** / **`cash_account`** rows must also match **`instruments.broker_id`** to that broker; **`400`** / **`404`** for invalid or missing broker id.
- **`POST /transactions`** validates **`broker_id`** + **`instrument_id`**: the instrument kind must be allowed for the broker type, and **`custom`** / **`cash_account`** instruments must belong to the same broker (**`instrument.broker_id`**).
- **`GET /instruments/:id`** returns the same shape as one list element; **`404`** if missing.
- **`PATCH /instruments/:id`** updates **only** **`cash_account`** instruments (display name, broker, **`cash_currency`**, country code **`cash_geo_key`**); **`400`** for other kinds (synced instruments are not editable). Duplicate cash display name (case-insensitive) returns **`409`**.
- **Degiro CSV:** **`POST /import/degiro`** with multipart field **`file`** (UTF-8 CSV). Parser lives in **`api/src/import/degiroTransactions.ts`** (`csv-parse`, **`relax_column_count`**). Data rows are normalized to **18 columns** (Degiro sometimes omits the empty field before the Order ID UUID). **Non-trade** lines (e.g. missing **ISIN**, missing **Reference exchange** / **Venue**, zero quantity) are **skipped** so fees and cash movements do not fail the import. **Lines sharing the same Order ID** (partial fills at different prices) are **merged into one transaction**: total signed quantity and **volume-weighted average** unit price; **ISIN**, date/time, product, exchange, and venue must match across those lines or the import **errors**. Rows are upserted on **`(broker_id, external_source, external_id)`** with **`external_source = 'degiro_csv'`** and **`external_id`** = lowercase **Order ID** UUID when present; if the Order ID cell is missing, **`external_id`** is a **sha256** of the canonical row. Only **EUR** trades; each CSV ISIN must resolve to exactly one **`etf`**, **`stock`**, or **`custom`**. Resolution: **`instruments.isin`** match first; otherwise **OpenFIGI** (`api/src/import/openFigi.ts`) maps the ISIN to Bloomberg listings and derives **Yahoo symbol** candidates (Bloomberg **`exchCode`** → Yahoo suffix) matched against **`instruments.yahoo_symbol`**. If still unmatched, the API returns **HTTP 200** with **`{ ok: false, needsInstruments: true, proposals }`** where **`proposals`** are built in **`api/src/import/degiroInstrumentProposals.ts`** (OpenFIGI + Yahoo `quoteSummary`, with Yahoo **search** fallback). The client can **`POST`** the same CSV again with optional multipart field **`createInstruments`** (JSON array of **`{ isin, yahooSymbol, kind }`**) to create instruments via **`insertEtfStockFromYahoo`** (`api/src/lib/createYahooInstrument.ts`) then import. Optional **`OPENFIGI_API_KEY`** in root **`.env`** (sent as **`X-OPENFIGI-APIKEY`**). Seligson-only instruments without a Yahoo ticker still need **`isin`** set (or no match). On success, **`{ ok: true, processed, changed, unchanged }`**: **`processed`** is merged CSV rows, **`changed`** is how many rows were inserted or updated with differing data (**`RETURNING`**), **`unchanged`** = **`processed` − `changed`** when data already matched. Web: **`/import`**.
- **Seligson TSV:** **`POST /import/seligson`** with multipart field **`file`** (UTF-8 tab-separated). Parser in **`api/src/import/seligsonTransactions.ts`**: **8 columns** matching the portfolio export header (`Salkku` … `Summa €`); **`Tyyppi`** may be empty—then **Merkintä** / **Lunastus** is inferred from **`Summa €`** sign. Rows upsert on **`(broker_id, external_source, external_id)`** with **`external_source = 'seligson_tsv'`** and **`external_id`** = join of ISO date, type label, **`Rahasto`** fund name, and **`Osuuksien määrä`**. Broker is the row named **`Seligson`** in **`brokers`**. **`Rahasto`** must match **`seligson_funds.name`** for exactly one **`custom`** instrument with that broker (trailing **`(A)`** / **`(B)`** Acc/Dst suffixes in the export are ignored for matching); otherwise **`400`** with **`missingFundNames`** or **`ambiguousFundNames`**. No automatic instrument creation. Success shape matches Degiro (**`processed`**, **`changed`**, **`unchanged`**). Web: **`/import`**.
- **`POST /instruments/:id/refresh-distribution`** refetches and upserts distribution cache for that instrument (502 on upstream error; 404 if missing; 200 **`{ ok: true }`** or **`{ skipped: true, reason }`** for cash or manual cache).
- **`DELETE /instruments/:id`** removes the instrument after deleting its **`transactions`** in one DB transaction; **`distributions`**, **`prices`**, and raw cache rows **CASCADE** from **`instruments`** (204). **`seligson_funds`** rows are not deleted.
- **`GET /portfolio/distributions`** returns value-weighted merged **`countries`** (raw keys from distributions, before geo bucketing), aggregated **`regions`** (geo buckets), **`sectors`**, **`totalValueEur`**, **`assetAllocation`** (equities vs bonds vs cash above/below **`portfolio_settings.emergency_fund_eur`**, using Yahoo cache / Seligson name heuristics for bond detection), and **`positions`**: each row includes **`quantity`** (net open units), **`unitPriceEur`** (EUR position value ÷ quantity when meaningful), **`weight`**, **`valueEur`**, **`valuationSource`**, plus **`instrumentId`** / **`displayName`** (see **`api/src/lib/portfolio.ts`**). Non‑cash holdings with no distribution cache (empty countries/sectors) are attributed to synthetic **`__portfolio_unknown__`** on **`countries`** / **`sectors`** and to geo bucket **`unknown`** on **`regions`** (value‑weighted share of non‑cash only).
- **Portfolio weighting and EUR valuation assumptions:** **`api`** `lib` (and related)—read before changing FX or valuation.
- **Web routes:** **`web`** source — same rule: discover from code.

## Tooling conventions

- **pnpm**; workspace packages **`@investments/db`**, **`@investments/api`**, **`@investments/web`**.
- **Biome** — [`biome.json`](biome.json).

## Practical instructions

### Code style

- **Reusable utilities:** small, pure or broadly reusable helper functions should live in separate **`lib/`** modules (e.g. **`api/src/lib`**, **`web/src/lib`**) rather than inlined in route handlers, pages, or feature files.
- **Web date/time display:** use **`web/src/lib/dateTimeFormat.ts`** — calendar dates **`YYYY-MM-DD`**; with time **`YYYY-MM-DD HH:mm`** (local 24h).

### Web UI polish

When changing **`web`** forms and flows, include small UX improvements when they are an obvious fit—**e.g. focus the primary input** after the user picks a type or advances a step, sensible defaults, tooltips when they add value, keyboard affordances. Keep scope tight: polish that ships with the feature, not unrelated refactors.

Do **not** generate extra UI copy texts **unless the user explicitly asks**. Only add the minimum amount of copy necessary for the feature to be usable.

Shared **primary** controls (`Button`, `ButtonLink`) and a minimal style reference: **[`web/design-system.md`](web/design-system.md)**.

### Before commit or sign-off

- **Lint:** always run **`pnpm lint`** (root **`biome check`**) and fix reported issues before **committing** or **treating work as complete**.
- **Tests:** run **affected** tests—packages, apps, or areas your change touches—before committing or signing off. Prefer the narrowest command that covers your edits (e.g. a package’s **`test`** script via **`pnpm --filter`** when present), not an unnecessary full-repo run unless the change warrants it. Root **`pnpm test`** runs Vitest in **`@investments/api`** (CSV import parser tests) then **`@investments/web`**.

### Git commits

- **Normal, readable one-line titles** describing the change.
- **No** Conventional Commit **prefixes** (`feat:`, `chore:`, `fix:`, `docs:`).
- **No** long bodies by default; extra lines only when truly useful (e.g. breaking changes).
- Prefer **small, well-scoped commits** when practical.

### When changing behavior

- **Schema:** edit Drizzle in `db`, **`pnpm db:generate`**, commit migrations, **`pnpm db:migrate`** locally. New tables must include **`created_at`** and **`updated_at`** with **`defaultNow()`** and a **`BEFORE UPDATE`** trigger to **`public.set_updated_at`** (see **`db/migrations`**).
- **Seligson HTML:** parsers are **brittle**—extend with care and prefer tests or fallbacks.
- **Yahoo:** tolerate missing data; avoid hard-failing the whole request for one empty module.

Keep changes **scoped** to the task; avoid drive-by refactors and unrelated new markdown unless requested.

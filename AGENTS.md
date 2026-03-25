# Agent instructions — investments tracker

This file is for **coding agents** (Cursor, etc.) working in this repository. Read it before making non-trivial changes.

When you change **architecture, conventions, env, API surface, or domain rules** in a way future agents would need to know, **update this file in the same change** (or a follow-up commit) so it stays accurate. Stale agent instructions are worse than none.

## What this project is

Personal **multi-broker portfolio tracker**: transactions are recorded per broker; **positions** are derived from buy/sell history. The main product goal is **aggregated geographic and sector/industry exposure** across the whole portfolio, not just per line item.

**Data sources for distributions** (implementation lives under `api`; details drift—read code when editing):

- **ETFs / stocks:** Yahoo Finance via **`yahoo-finance2`** (`quoteSummary` and related modules). Symbols are stored as **`yahooSymbol`**. Unofficial API—handle absence and schema changes gracefully; **caching** reduces repeated calls.
- **Seligson mutual funds:** **HTML scrape** of Seligson FundViewer (sector/region breakdown view; **`fid`** in the URL must match **`seligson_funds`** in the DB).
- **Cash (`cash_account`):** no external fetch—allocation is **synthetic** from **`cash_geo_key`** and **`cash_interest_type`** (and similar fields on `instruments` as modeled in schema).
- **Stocks:** sector/industry from Yahoo when present; geography is often **issuer-country-only** as a simplification, not economic exposure.

## Repo layout

pnpm workspace — see [`pnpm-workspace.yaml`](pnpm-workspace.yaml):

| Package | Role |
| --- | --- |
| [`db`](db) | Drizzle schema, SQL migrations, shared types |
| [`api`](api) | Hono API, valuation, distribution fetch/normalize, cache refresh |
| [`web`](web) | Vite + React + Tailwind; portfolio UI, React Admin (Seligson funds), dev data checks |

Scripts and tool versions: **root [`package.json`](package.json)**. Local setup, ports, and env keys: **[`README.md`](README.md)** and **[`.env.example`](.env.example)** — **do not duplicate** those here; they change often.

## Infrastructure (stable ideas only)

- **PostgreSQL** via Docker Compose; persistent data under **`.data/postgres`** (gitignored). Compose image, host port, and credentials belong in **compose + README**, not here.
- API loads **`.env` from the repository root** (see `api` DB bootstrap). **`DATABASE_URL`** is required for a real DB connection unless tests mock it—exact loading logic is in code.

## Domain model (mental map)

Authoritative detail is **`db/src/schema.ts`** and migrations. Conceptually:

- **`brokers`:** seeded broker codes (Seligson, Degiro, IBKR, Svea).
- **`seligson_funds`:** Seligson products keyed by **`fid`** (unique); **`name`**, notes, active flag. Edited via **React Admin** in the web app; REST shape must stay compatible with **react-admin** list semantics (e.g. pagination headers—see implementation).
- **`instruments`:** **`kind`** (`etf` | `stock` | `seligson_fund` | `cash_account`), identifiers and cash/Seligson fields as in schema; optional **`mark_price_eur`** when Yahoo quotes are not used.
- **`transactions`:** trades with **`currency`** and optional **`unit_price_eur`** for EUR-side reporting.
- **`distribution_cache`:** one row per instrument; **`payload`** is **`{ regions, sectors }`**-shaped normalized weights; **`source`** distinguishes Yahoo, Seligson scrape, manual, etc.

**Positions** are derived from transactions (net quantity per instrument), not a separate persisted ledger unless you add one.

## Seligson fund create/update behavior (product contract)

The API **may fetch Seligson HTML** to fill or refresh **`name`** when it is missing, cleared, or when **`fid`** changes—so clients can omit a display name in some cases. **Do not remove or silently break** that behavior without an explicit product decision; failures are surfaced as HTTP errors with a message body. Exact routes and status codes are defined in **`api`**—read there before changing.

## Caching and refresh

- Automatic distribution refresh is **roughly daily**, not on every request.
- **API startup** may **async** refresh stale caches for instruments with **open positions** (must not block server listen).
- **`source = manual`** cache rows must **not** be overwritten by automatic refresh.

## API and web (where to look)

- **HTTP routes, CORS, dev-only routes, validation:** **`api`** entrypoint / modules — single source of truth; **do not maintain a duplicate route list in this file.**
- **Portfolio weighting and EUR valuation assumptions:** **`api`** `lib` (and related)—read before changing FX or valuation.
- **Web routes and admin wiring:** **`web`** source — same rule: discover from code.

## Tooling conventions

- **pnpm**; workspace packages **`@investments/db`**, **`@investments/api`**, **`@investments/web`**.
- **Biome** — [`biome.json`](biome.json).

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

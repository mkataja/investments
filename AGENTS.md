# Agent instructions — investments tracker

For coding agents (Cursor, etc.) in this repo.

When architecture, conventions, env, API surface, or domain rules change in ways future agents need, update **`AGENTS.md`** (workflow/agent expectations) and the relevant **`docs/*.md`** or **[`README.md`](README.md)** in the same or a follow-up commit. Stale instructions are worse than none.

## What this project is

Multi-broker portfolio tracker: transactions per broker; positions from buy/sell; goal is aggregated geographic and sector/industry exposure. Setup and scripts: **[`README.md`](README.md)**.

## Where to read details (keep `AGENTS.md` thin)

| Topic | File |
| --- | --- |
| Distribution pipelines (Yahoo, provider files, Seligson incl. fund name/NAV/holdings, JPM, geo buckets, cash in charts) | [`docs/data-sources.md`](docs/data-sources.md), per-source in [`docs/data-sources/`](docs/data-sources/) |
| Packages, infra, DB tables, caching, positions | [`docs/architecture.md`](docs/architecture.md) |
| Routes, imports, portfolio response shapes | [`docs/api.md`](docs/api.md) |

HTTP behavior lives in **`api`** only; routes are not duplicated here. Data model: **`db/src/schema.ts`** + migrations.

## Tooling

- **`pnpm`** workspace: **`@investments/db`** (Drizzle schema + migrations), **`@investments/lib`** (shared domain / validation / helpers used by api + web), **`@investments/api`**, **`@investments/web`** — [`pnpm-workspace.yaml`](pnpm-workspace.yaml)
- Biome — [`biome.json`](biome.json)

## Practical instructions

### Code style

- Small reusable helpers belong in **`lib/`** (e.g. **`api/src/lib`**, **`web/src/lib`**) rather than inlined in handlers or pages. Code shared **only** between **`api`** and **`web`** (not Drizzle DDL) lives in **`@investments/lib`** (`lib/`).
- No copy-paste duplication: extract shared UI, validation, or logic.
- Web dates/times: **`web/src/lib/dateTimeFormat.ts`** — **`YYYY-MM-DD`**; with time **`YYYY-MM-DD HH:mm`** (local 24h).

### Web UI polish

When changing **`web`** forms/flows, add small UX wins when obvious (focus primary input, defaults, tooltips, keyboard). Keep scope tight.

Do not add extra UI copy unless the user asks. Minimum copy for usability.

Shared UI patterns: **[`web/design-system.md`](web/design-system.md)**. Layout and action styles are **named classes** in **`web/src/index.css`** (`@layer base` + `@layer components`); **`web/tailwind.config.js`** only extends **`heading-1`**–**`heading-4`** font sizes (no custom color palette). Merge classes with **`classNames`** from **`web/src/lib/css.ts`** when a component accepts **`className`**. **`Modal`** (**`web/src/components/Modal.tsx`**): optional **`confirmBeforeClose`**.

### Before commit or sign-off

- **`pnpm lint`** (root **`biome check`**)
- **`pnpm --filter @investments/web build`** and **`pnpm --filter @investments/api build`** when those packages change; lint may not catch **`tsc`** errors
- Run affected tests; root **`pnpm test`** runs **`@investments/api`** then **`@investments/web`**
- **`pnpm run ci`** — lint, test, parallel builds (bare **`pnpm ci`** is reserved by pnpm)

### Git commits

- Normal one-line titles
- No conventional prefixes (`feat:`, `chore:`, …)
- No long bodies unless useful
- Prefer small, scoped commits

### When changing behavior

- **Schema:** Drizzle in **`db`**, **`pnpm db:generate`**, commit migrations, **`pnpm db:migrate`** locally. New tables: **`created_at`** / **`updated_at`** with **`defaultNow()`** and **`BEFORE UPDATE`** → **`public.set_updated_at`** (see **`db/migrations`**). Indexes: every FK column; also columns used to filter, join, or order when not covered by PK/unique — see **[`docs/architecture.md`](docs/architecture.md)**.
- **Seligson HTML:** parsers are brittle; extend with care; prefer tests or fallbacks.
- **Yahoo:** tolerate missing data; do not fail the whole request for one empty module.

Keep changes scoped; avoid drive-by refactors and unrelated new markdown unless requested.

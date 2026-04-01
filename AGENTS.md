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

HTTP behavior lives in **`api`** only; routes are not duplicated here. Data model: **`db/src/schema.ts`** + migrations. Benchmark portfolios (`portfolios.kind`, `portfolio_benchmark_weights`, `benchmark_total_eur`) hold target instrument weights instead of transactions — see [`docs/architecture.md`](docs/architecture.md).

## Tooling

- **`pnpm`** workspace: **`@investments/db`** (Drizzle schema + migrations), **`@investments/lib`** (shared domain / validation / helpers used by api + web), **`@investments/api`**, **`@investments/web`** — [`pnpm-workspace.yaml`](pnpm-workspace.yaml)
- Biome — [`biome.json`](biome.json)

## Practical instructions

### No copy-paste duplication — extract shared code (required)

**Do not** "copy-paste" code or write identical chunks in multiple places. If the same (or nearly the same) logic, markup, or validation is needed in more than one place, **extract** it before landing the change:

- **Shared UI** → a **component** (or hook) in the right place depending on if it's a local or a global shared component
- **Shared logic or validation** → **functions or modules** in **`lib/`** - package-local **`api/src/lib`**, **`web/src/lib`**, or **`@investments/lib`** when **`api`** and **`web`** both need it (not Drizzle DDL).
- Be also mindful of not repeating CSS - extract common styles instead.

Duplicating code is a maintenance nightmare, makes files larger than necessary, and causes drift and bugs.

### Documentation and UI copy style

- Keep documentation and UI copy terse and to the point. Avoid repeating.
- Do not use the "…" character - use "...".
- Do not overuse **emphasis** in documentation.
- Put a space on both sides of en and em dashes in sentences.

### Code style

- Small reusable helpers belong in **`lib/`** (e.g. **`api/src/lib`**, **`web/src/lib`**) rather than inlined in handlers or pages. Code shared **only** between **`api`** and **`web`** (not Drizzle DDL) lives in **`@investments/lib`** (`lib/`).
- Obey **No copy-paste duplication** above: never paste big repeated blocks; extract components and functions instead.
- If a file starts to exceed 300-500 lines, take a careful look if some of the components in it should be separated into new modules/files.
- Web dates/times: **`web/src/lib/dateTimeFormat.ts`** — **`YYYY-MM-DD`**; with time **`YYYY-MM-DD HH:mm`** (local 24h).

### Web UI polish

When changing **`web`** forms/flows, add small UX wins when obvious (focus primary input, defaults, tooltips, keyboard). Keep scope tight.

Do not add extra UI copy unless the user asks. Minimum copy for usability.

Shared UI patterns: **[`web/design-system.md`](web/design-system.md)**. Layout and action styles are **named classes** in **`web/src/index.css`** (`@layer base` + `@layer components`); **`web/tailwind.config.js`** only extends **`heading-1`**–**`heading-4`** font sizes (no custom color palette). **Do not** define reusable Tailwind class lists as **`const`** strings in TypeScript — add a **named class** in **`web/src/index.css`** with **`@apply`** instead. Name those classes for **global reuse** (what the control looks like), not for a single screen or flow — e.g. **`form-control`**, not **`transaction-modal-form-control`**. Merge classes with **`classNames`** from **`web/src/lib/css.ts`** when a component accepts **`className`**. **`Modal`** (**`web/src/components/Modal.tsx`**): optional **`confirmBeforeClose`**.

Portfolio distribution charts (**`web/src/pages/home/portfolioCharts/`**) use **Chart.js** via **`react-chartjs-2`**; import **`web/src/lib/chart/registerChartJs.ts`** once from **`web/src/main.tsx`** (controllers/scales/tooltip plugins). External HTML tooltips (**`web/src/lib/chart/externalTooltip.tsx`**) render **`DistributionChartTooltip`** and **`PortfolioPieTooltip`**; layout classes are **`chart-tooltip`** / **`chart-tooltip__*`** in **`web/src/index.css`**.

### Before commit or sign-off

- **`pnpm lint`** (root **`biome check`**)
- **`pnpm --filter @investments/web build`** and **`pnpm --filter @investments/api build`** when those packages change; lint may not catch **`tsc`** errors
- Run affected tests; root **`pnpm test`** runs **`@investments/api`** then **`@investments/web`**
- **`pnpm run ci`** — lint, test, parallel builds (bare **`pnpm ci`** is reserved by pnpm)

### Git commits

- Normal one-line titles
- No conventional prefixes (`feat:`, `chore:`, ...)
- No long bodies unless useful
- Prefer small, scoped commits

### When changing behavior

- **Schema:** Drizzle in **`db`**, **`pnpm db:generate`**, commit migrations, **`pnpm db:migrate`** locally. New tables: **`created_at`** / **`updated_at`** with **`defaultNow()`** and **`BEFORE UPDATE`** → **`public.set_updated_at`** (see **`db/migrations`**). Indexes: every FK column; also columns used to filter, join, or order when not covered by PK/unique — see **[`docs/architecture.md`](docs/architecture.md)**.
- **Seligson HTML:** parsers are brittle; extend with care; prefer tests or fallbacks.
- **Yahoo:** tolerate missing data; do not fail the whole request for one empty module.

Keep changes scoped; avoid drive-by refactors and unrelated new markdown unless requested.

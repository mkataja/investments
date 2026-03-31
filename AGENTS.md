# Agent instructions — investments tracker

This file is for **coding agents** (Cursor, etc.) working in this repository.

When you change **architecture, conventions, env, API surface, or domain rules** in a way future agents would need to know, update **`AGENTS.md`** if **workflow or agent expectations** change, and update the relevant **`docs/*.md`** (or **[`README.md`](README.md)**) so reference material stays accurate—**same change or follow-up commit**. Stale instructions are worse than none.

## What this project is

Personal **multi-broker portfolio tracker**: transactions per broker; **positions** from buy/sell history; main goal is **aggregated geographic and sector/industry exposure** across the portfolio. See **[`README.md`](README.md)** for setup, scripts, and a short product overview.

## Where to read details (keep `AGENTS.md` thin!!)

| Topic | File |
| --- | --- |
| Distribution pipelines (Yahoo, provider files, Seligson incl. fund name/NAV/holdings, JPM, geo buckets, cash in charts) | [`docs/data-sources.md`](docs/data-sources.md) (per-source files in [`docs/data-sources/`](docs/data-sources/)) |
| Packages, infra, DB tables, caching / refresh, positions | [`docs/architecture.md`](docs/architecture.md) |
| Routes, imports, portfolio response shapes | [`docs/api.md`](docs/api.md) |

**Authoritative code:** HTTP behavior lives in **`api`**; routes are **not** duplicated here. **`db/src/schema.ts`** + migrations for the data model.

## Tooling

- **pnpm** workspace: **`@investments/db`**, **`@investments/api`**, **`@investments/web`** — see [`pnpm-workspace.yaml`](pnpm-workspace.yaml).
- **Biome** — [`biome.json`](biome.json).

## Practical instructions

### Code style

- **Reusable utilities:** small, pure or broadly reusable helpers belong in **`lib/`** (e.g. **`api/src/lib`**, **`web/src/lib`**) rather than inlined in handlers or pages.
- **No copy-paste duplication:** extract shared UI, validation, or logic instead of repeating blocks.
- **Web date/time display:** **`web/src/lib/dateTimeFormat.ts`** — dates **`YYYY-MM-DD`**; with time **`YYYY-MM-DD HH:mm`** (local 24h).

### Web UI polish

When changing **`web`** forms and flows, include small UX improvements when they are an obvious fit—e.g. focus the primary input after type selection or advancing a step, sensible defaults, tooltips when they add value, keyboard affordances. Keep scope tight.

Do **not** generate extra UI copy **unless the user explicitly asks**. Minimum copy for usability.

Shared **primary** controls and patterns: **[`web/design-system.md`](web/design-system.md)**. **`Modal`** (**`web/src/components/Modal.tsx`**): optional **`confirmBeforeClose`**. **Headings:** **`heading-1`…`heading-4`** in **`web/tailwind.config.js`**; base styles in **`web/src/index.css`**.

### Before commit or sign-off

- **Lint:** **`pnpm lint`** (root **`biome check`**).
- **Build:** **`pnpm --filter @investments/web build`** and **`pnpm --filter @investments/api build`** when those packages change; lint alone may not catch **`tsc`** errors.
- **Tests:** run affected package tests; root **`pnpm test`** runs **`@investments/api`** then **`@investments/web`**.
- **CI:** **`pnpm run ci`** — lint, test, and both builds in parallel (bare **`pnpm ci`** is reserved by pnpm).

### Git commits

- **Normal, readable one-line titles**
- **No** conventional prefixes (`feat:`, `chore:`, etc.).
- **No** long bodies by default; only when truly useful
- Prefer **small, well-scoped commits** when practical

### When changing behavior

- **Schema:** Drizzle in `db`, **`pnpm db:generate`**, commit migrations, **`pnpm db:migrate`** locally. New tables: **`created_at`** / **`updated_at`** with **`defaultNow()`** and **`BEFORE UPDATE`** trigger to **`public.set_updated_at`** (see **`db/migrations`**).
- **Seligson HTML:** parsers are **brittle**—extend with care; prefer tests or fallbacks.
- **Yahoo:** tolerate missing data; avoid hard-failing the whole request for one empty module.

Keep changes **scoped** to the task; avoid drive-by refactors and unrelated new markdown unless requested.

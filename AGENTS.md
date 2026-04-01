# Agent instructions — investments tracker

For coding agents in this repo.

When architecture, conventions, env, API surface, or domain rules change in ways future agents need, update `AGENTS.md` and the relevant `docs/*.md` or [`README.md`](README.md) in the same or a follow-up commit. Stale instructions are worse than none.


## What this project is

Multi-broker portfolio tracker: transactions per broker; positions from buy/sell; goal is aggregated geographic and sector/industry exposure. Setup and scripts: [`README.md`](README.md).


## Where to read details (keep `AGENTS.md` thin)

| Topic | File |
| --- | --- |
| Data pipelines (Yahoo, providers, Seligson, JPM, geo, cash in charts) | [`docs/data-sources.md`](docs/data-sources.md), [`docs/data-sources/`](docs/data-sources/) |
| Packages, DB, caching, positions, benchmark portfolios | [`docs/architecture.md`](docs/architecture.md) |
| Routes, imports, API shapes | [`docs/api.md`](docs/api.md) |

HTTP routes live in `api` only - they are not duplicated in any documentation.

Data model lives in `db/src/schema.ts` (and migrations).


## Tooling

`pnpm` monorepo — [`pnpm-workspace.yaml`](pnpm-workspace.yaml). Lint: Biome ([`biome.json`](biome.json), `pnpm lint`).


## Practical instructions

### Maintainability - no copy-paste duplication

IMPORTANT! Do not duplicate logic, markup, validation, or CSS. Extract shared UI to components/hooks, etc.

Duplicating code is a maintenance nightmare, makes files larger than necessary, and causes drift and bugs.


### Documentation and UI copy style

- Keep documentation and UI copy terse and to the point. Avoid repeating.
- Do not use the "…" character - use "...".
- Do NOT overuse **emphasis** in documentation.
- Put a space on both sides of en and em dashes in sentences.


### Code layout

- Split files that grow past ~300–500 lines when it helps clarity
- No barrel `index.ts` files
- `web/src/api/` — web-only HTTP/API contract helpers (transport in `client.ts`); real payload/parse/error work only, not thin wrappers. Backend-shared logic belongs in `@investments/lib`. Import domain types from the feature that owns them (e.g. `pages/home/types.ts`, `components/instrumentForm/types.ts`) rather than growing a generic `types/` tree.
- Other shared logic to `lib/` — package-local `api/src/lib` / `web/src/lib`, or `@investments/lib` when `api` and `web` both need it
- It's important to consider maintainability


### General bits

- Web date/time formatting: `web/src/lib/dateTimeFormat.ts` (`YYYY-MM-DD`, or with time `YYYY-MM-DD HH:mm` local 24h)


### Web UI

Small UX wins on forms/flows when obvious: default values, enter to submit, etc. quality of life improvements.

Minimal copy unless asked.

CSS/Tailwind patterns: [`web/design-system.md`](web/design-system.md).


### Before committing or signing off work

Consider as necessary:
- `pnpm lint`
- `pnpm --filter @investments/web build` and `pnpm --filter @investments/api build` when those packages change (lint may miss `tsc` errors)
- `pnpm test` when relevant
- `pnpm run ci` — run all above CI checks *in parallel*


### Git commits

- One-line titles
- NO commit prefixes (such as `feat:` or `db:`, etc.)
- NO message body unless necessary

Keep commits well-scoped: one logical whole in one commit. Avoid committing dependent code in separate commits. Avoid committing multiple separate wholes in one commit.


### When changing behavior

- Schema: Drizzle in `db`, `pnpm db:generate`, commit migrations, `pnpm db:migrate` locally. Timestamps, indexes, FKs: [`docs/architecture.md`](docs/architecture.md) and existing `db/migrations`.

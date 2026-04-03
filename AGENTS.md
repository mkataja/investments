# Agent instructions — investments tracker

For coding agents in this repo.

When architecture, conventions, env, API surface, or domain rules change in ways future agents need, update `AGENTS.md` and the relevant `docs/*.md` or [`README.md`](README.md) in the same or a follow-up commit. Stale instructions are worse than none.


## What this project is

Multi-broker portfolio tracker: transactions per broker; positions from buy/sell; goal is aggregated geographic and sector/industry exposure. Setup and scripts: [`README.md`](README.md).


## Where to read details (keep `AGENTS.md` thin)

| Topic | File |
| --- | --- |
| Data pipelines (Yahoo, providers, Seligson, JPM, geo, cash in charts) | [`docs/data-sources.md`](docs/data-sources.md), [`docs/data-sources/`](docs/data-sources/) |
| Packages, infrastructure, caching, distribution refresh | [`docs/architecture.md`](docs/architecture.md) |
| HTTP API entrypoint and where to document contracts | [`docs/api.md`](docs/api.md) |
| Known gaps and "lightweight project management" | [`docs/TODO.md`](docs/TODO.md) |

HTTP routes live in `api` code only. They are not to be listed in documentation; use JSDoc on handlers for documenting APIs if necessary.

Data model lives in `db/src/schema.ts` (and migrations).


## Code style, quality, and performance

IMPORTANT! Read and always follow good quality standards!

- Do not duplicate logic, markup, validation, or CSS. Extract shared UI to components/hooks, etc.
- Prefer reuse and clear abstractions - in logic, UI, styles, everything.
- ALWAYS prefer map/reduce over for-loops! For-loops only when there's a very clear benefit.
- Never do typecasts like `as` or `<>` without asking for permission. `satisfies` is good though!
- Avoid N+1 DB query pattern. Be mindful of DB performance.
- No need to consider accessibility issues in detail as the app is anyway very visual by design


## Documentation and UI copy (text) style

- Never change UI copy unless asked to do so. Only write new copy when copy is missing.
- Keep documentation and UI copy terse and to the point. Avoid repeating.
- Do not use the "…" character - use "...".
- Do NOT overuse **emphasis** in documentation.
- Put a space on both sides of en and em dashes in sentences.


## Code layout

- The project is a `pnpm` monorepo
- Split files that grow past ~300–500 lines when it helps clarity
- Put files in the right places. See [`architecture.md`](docs/architecture.md) for more detailed layout. E.g. service layer VS lib VS models etc.
- No barrel import files!
- Genrally define types within the feature/model/entity they belong to
- It's important to consider maintainability


## General bits

- Web date/time formatting: `web/src/lib/dateTimeFormat.ts` (`YYYY-MM-DD`, or with time `YYYY-MM-DD HH:mm` local 24h)


## Web UI

Small UX wins on forms/flows when obvious: default values, enter to submit, etc. quality of life improvements.

Minimal copy unless asked.

CSS/Tailwind patterns: [`web/design-system.md`](web/design-system.md).


## Before committing or signing off work

- `pnpm run ci` — run *all* CI checks *in parallel*

If necessary, you can run individual CI checks for faster output:
- `pnpm lint`
- `pnpm --filter @investments/web build` and `pnpm --filter @investments/api build`
- `pnpm test`
- `pnpm ts-prune`


## Git commits

Don't commit unless asked to. Only ever commit changes you have made.

- One-line titles
- NO commit prefixes (such as `feat:` or `db:`, etc.)
- NO message body unless necessary

Keep commits well-scoped: one logical whole in one commit. Avoid committing dependent code in separate commits. Avoid committing multiple separate wholes in one commit.


## When changing behavior

- Schema: Drizzle in `db`, `pnpm db:generate`, commit migrations, `pnpm db:migrate` locally. Timestamps, indexes, FKs: follow patterns in `db/src/schema.ts` and existing `db/migrations`.

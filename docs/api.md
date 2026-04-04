# HTTP API

**Routes** — [`api/src/index.ts`](../api/src/index.ts). Single source of truth; do not list endpoints elsewhere.

**Request/response shapes, status codes, and non-obvious rules** — document with **JSDoc** on the route handler (or on the `api/src/service/` / `api/src/import` helper the handler calls). That keeps contracts next to code and avoids a second copy in markdown.

**Where logic lives** (read before changing behavior):

- Import parsers and upsert keys — `api/src/import/`
- Web HTTP helpers — `web/src/api/` (transport; parsing belongs in `api`)

**Route handler entrypoints** — each `api/src/service/<area>/index.ts` registers HTTP handlers; the same folder usually holds domain code too (e.g. `service/portfolio/` has valuation and asset mix next to routes). Details stay in JSDoc:

| Module | Role |
| --- | --- |
| `brokers` | Brokers CRUD. |
| `transactions` | Transactions CRUD and intraday price seeding from trades. |
| `import` | Degiro, IBKR, and Seligson import uploads and instrument resolution. |
| `instrument` | Instruments CRUD, backfills, distribution refresh, Yahoo lookup, positions, and portfolio distribution or asset-mix history routes. |
| `portfolio` | Portfolios CRUD plus static/backtest synthetic weights and backtest creation. |

CORS and validation are in the same entrypoint as routes.

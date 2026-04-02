# HTTP API

**Routes** — [`api/src/index.ts`](../api/src/index.ts). Single source of truth; do not list endpoints elsewhere.

**Request/response shapes, status codes, and non-obvious rules** — document with **JSDoc** on the route handler (or on the `api/src/lib` / `api/src/import` helper the handler calls). That keeps contracts next to code and avoids a second copy in markdown.

**Where logic lives** (read before changing behavior):

- Import parsers and upsert keys — `api/src/import/`
- Portfolio merge and valuation — `api/src/lib/portfolio.ts`, `api/src/lib/portfolioAssetMix.ts`
- Web HTTP helpers — `web/src/api/` (transport; parsing belongs in `api`)

CORS and validation are in the same entrypoint as routes.

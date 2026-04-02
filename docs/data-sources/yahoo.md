# Yahoo Finance (ETFs / stocks)

`yahoo-finance2` v3; shared `YahooFinance` in `api`. `quoteSummary` only for distributions and price snapshots — no `quote()`. Symbols stored as `yahooSymbol`, trimmed/uppercased (`normalizeYahooSymbolForStorage` in `@investments/lib`).

Price snapshot: `quoteSummary.price.regularMarketPrice` with `price_type` `intraday` when `marketState` is `REGULAR`, else `close` (PRE, POST, CLOSED, missing, etc.). `prices.price_date` and Yahoo `distributions.snapshot_date` use the UTC calendar day of `price.regularMarketTime` when present (so a morning fetch before the session still stores the prior close under the quote day, not the fetch day); otherwise the fetch instant. Same calendar day: existing `close` is not overwritten by `intraday` (`upsertPriceForDate`).

Unofficial API — Yahoo may 429/block by IP; API maps to readable message and 503, retries with backoff on `quoteSummary`, staggers startup refresh for Yahoo rows (`YAHOO_MIN_INTERVAL_MS`, default ~900ms). Valuation uses latest `prices` row per instrument. Caching reduces repeat calls.

Historical backfill: `yahoo-finance2` `chart` (`interval` `1d`, one request per symbol for a date range), not `quoteSummary` per day. `POST /instruments/backfill-yahoo-prices` writes `prices` with `skipFxEnqueue` so bulk inserts do not enqueue `fx_backfill_queue`; FX `instruments` are filled from the same chart path.

FX cross rates to EUR (Yahoo forex symbols such as `EURUSD=X`) are fetched via the same `quoteSummary` path. Work is queued in `fx_backfill_queue` and drained soon after non-EUR asset prices are written; we assume the queue is consumed fast enough that the stored FX `fetched_at` is approximately the same time as the triggering asset price (same batch / request), not a separate delayed job hours later. For FX instruments, `prices.quoted_price` is **EUR per 1 unit of the foreign currency** (`prices.currency` EUR); mapping from Yahoo quotes and invert is in `@investments/lib` (`fxYahooEurLeg.ts`). All Yahoo `quoteSummary` calls share `acquireYahooIntervalSlot` in `api` (`YAHOO_MIN_INTERVAL_MS`).

Tolerate missing data; do not fail the whole request for one empty module.

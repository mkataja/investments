# Yahoo Finance (ETFs / stocks)

`yahoo-finance2` v3; shared `YahooFinance` in `api`. `quoteSummary` only for distributions and price snapshots — no `quote()`. Symbols stored as `yahooSymbol`, trimmed/uppercased (`normalizeYahooSymbolForStorage` in `@investments/lib`).

Price snapshot: `quoteSummary.price.regularMarketPrice` with `price_type` `intraday` when `marketState` is `REGULAR`, else `close` (PRE, POST, CLOSED, missing, etc.). `prices.price_date` and Yahoo `distributions.snapshot_date` use the UTC calendar day of `price.regularMarketTime` when present (so a morning fetch before the session still stores the prior close under the quote day, not the fetch day); otherwise the fetch instant. Same calendar day: existing `close` is not overwritten by `intraday` (`upsertPriceForDate`).

Unofficial API — Yahoo may 429/block by IP; API maps to readable message and 503, retries with backoff on `quoteSummary`, staggers startup refresh for Yahoo rows (`YAHOO_MIN_INTERVAL_MS`, default ~900ms). Valuation uses latest `prices` row per instrument. Caching reduces repeat calls.

Tolerate missing data; do not fail the whole request for one empty module.

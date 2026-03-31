# Yahoo Finance (ETFs / stocks)

`yahoo-finance2` v3; shared `YahooFinance` in `api`. `quoteSummary` only for distributions and price snapshots — no `quote()`. Symbols stored as `yahooSymbol`, trimmed/uppercased (`normalizeYahooSymbolForStorage` in `@investments/lib`).

Unofficial API — Yahoo may 429/block by IP; API maps to readable message and 503, retries with backoff on `quoteSummary`, staggers startup refresh for Yahoo rows (`YAHOO_MIN_INTERVAL_MS`, default ~900ms). Valuation uses `prices`, not live quotes. Caching reduces repeat calls.

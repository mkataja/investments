# J.P. Morgan daily ETF holdings XLSX

HTTPS on `am.jpmorgan.com`, e.g. `FundsMarketingHandler/excel?type=dailyETFHoldings&…`. Source key `jpm_holdings_xlsx`. Parser `api/src/distributions/parseJpmHoldingsXlsx.ts`.

Cash rows (Asset class) → `sectors.cash`, omitted from `countries`.

Optional sector weights from product-data JSON: [jpm-product-data.md](./jpm-product-data.md) (only when `holdings_distribution_url` is a JPM daily ETF XLSX URL). Caches: [Provider holdings overview](../data-sources.md#provider-holdings-overview).

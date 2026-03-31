# J.P. Morgan daily ETF holdings XLSX

**HTTPS** URL on **`am.jpmorgan.com`**, e.g. **`FundsMarketingHandler/excel?type=dailyETFHoldings&…`**. Distribution source key **`jpm_holdings_xlsx`**. Parser **`api/src/distributions/parseJpmHoldingsXlsx.ts`**.

Cash / cash-equivalent rows (**Asset class**) → **`sectors.cash`**, omitted from **`countries`**.

Optional **sector** weights from separate **product-data** JSON: [jpm-product-data.md](./jpm-product-data.md) (only valid when **`holdings_distribution_url`** is a JPM daily ETF XLSX URL). See [Provider holdings overview](../data-sources.md#provider-holdings-overview) for caches.

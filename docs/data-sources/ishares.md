# iShares holdings CSV

**HTTPS** CSV export on **`ishares.com`**. Distribution source key **`ishares_holdings_csv`**. Parser **`api/src/distributions/parseIsharesHoldingsCsv.ts`**.

Cash / cash-equivalent lines (e.g. **Asset Class** or **Sector** marking cash) → **`sectors.cash`**, omitted from **`countries`**. See [Provider holdings overview](../data-sources.md#provider-holdings-overview) for URL validation and cache tables.

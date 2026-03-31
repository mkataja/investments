# DWS Xtrackers constituent XLSX

**HTTPS** constituent XLSX export on **`dws.com`** (e.g. **`etf.dws.com/.../excel/product/constituent/…`**). Distribution source key **`xtrackers_holdings_xlsx`**. Parser **`api/src/distributions/parseXtrackersHoldingsXlsx.ts`**.

Cash / cash-equivalent rows (**Type of Security**) → **`sectors.cash`**, omitted from **`countries`**. See [Provider holdings overview](../data-sources.md#provider-holdings-overview).

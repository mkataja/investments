# iShares holdings CSV

HTTPS CSV on `ishares.com`. Source key `ishares_holdings_csv`. Parser `api/src/distributions/parseIsharesHoldingsCsv.ts`.

Cash / cash-equivalent lines (e.g. Asset Class or Sector marking cash) → `sectors.cash`, omitted from `countries`. URL validation and caches: [Provider holdings overview](../data-sources.md#provider-holdings-overview).

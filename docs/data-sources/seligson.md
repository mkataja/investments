# Seligson mutual funds

## Fund name and NAV

API fetches Seligson HTML to resolve `name` on new `seligson_funds` rows (`fetchSeligsonFundName`). On distribution refresh, `parseSeligsonFundName` runs on the same FundViewer HTML; `seligson_funds.name` updates. Instrument labels use `instruments.display_name` (set at create); refresh updates `display_name` when it still mirrors the old title or strips to the parsed name. Failures → HTTP errors with body; exact routes/status codes in `api`.

`FundValues_FI.html` uses shorter link text than FundViewer in some rows; `fundValuesRowMatchesDbName` includes aliases (e.g. table `Global Brands` ↔ DB name containing “Top 25 Brands”) in `FUND_VALUES_TABLE_LABEL_ALIASES` in `api/src/distributions/seligsonFundValues.ts`.

## Holdings distribution (HTML scrape)

**Bond funds:** When view=40 Allokaatio includes Korkosijoitukset and the “Korkosijoitusten jakauma” table has Pitkät korot (yrityslainat)/(valtionlainat)/Lyhyet korot, the API uses view=40 (allocation + bond-type split) and view=20 (long-bond maajakauma) instead of line-by-line holdings. Sector keys: `long_government_bonds`, `long_corporate_bonds`, `short_bonds`, plus `cash`. Raw HTML in `seligson_distribution_cache.allocation_html` and `country_html`; `holdings_html` null. Portfolio country merge scales by long govt + long corp weights (not short bonds or cash).

**Equity / mixed:** Scrape FundViewer holdings view=10; `fid` in URL must match `seligson_funds`. Users register via `/instruments/new` (FID + Seligson-type broker); rows are find-or-created by the API. Geo: each row’s Finnish `Maa` → ISO via `resolveRegionKeyToIso`. Sectors: line weights use Yahoo `quoteSummary` `assetProfile.sector` (fallback `industry`) via `mapSectorLabelToCanonicalId` when Yahoo/OpenFIGI resolution succeeds; else Finnish `Toimiala` → `SELIGSON_FINNISH_SECTOR_LABEL_MAP` (unknown → `sectors.other`). Resolution pipeline: `api/src/distributions/seligsonHoldingsResolve.ts` (search query expansion, legal-name normalization, `namesMatchSeligsonYahoo`, OpenFIGI + multiple Yahoo candidates, ISIN acceptance paths). Wrong ticker/name pairs are possible — manual validation of cached resolutions may be added later. Resolved lines cached in `seligson_holdings_resolution_cache` (normalized name + ISO, `ZZ` when Maa unmapped; Yahoo symbol/name when `source = yahoo`; no TTL). Cash / money-market lines (e.g. Käteinen, dash-only Maa/Toimiala) → `sectors.cash`, omitted from `countries`. Raw: `seligson_distribution_cache.holdings_html`. `YAHOO_MIN_INTERVAL_MS` spaces distinct unresolved lookup keys and OpenFIGI when ISIN fallback runs.

Modules: `api/src/distributions/seligson.ts` (holdings + bond views), `api/src/distributions/seligsonHoldingsResolve.ts` (view=10 Yahoo line resolution).

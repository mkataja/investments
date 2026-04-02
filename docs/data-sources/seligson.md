# Seligson mutual funds

## Fund name and NAV

`seligson_funds.price_history_csv_url` stores the absolute URL to each fund’s “Arvohistoria csv-muodossa” file (parsed from the public `rahes_*.htm` intro page when **inserting** a new `seligson_funds` row, or backfilled). The intro page URL itself is **not** stored. When create used **`seligsonFundPageUrl`**, the API also resolves **“Rahaston sijoitukset”** once and stores **`seligson_funds.public_allocation_page_url`** (the public allocation table page) when that link exists; an existing fund row is never overwritten by a later create. Legacy synthetic rows (negative `fid`) may use an empty CSV URL.

When that URL is non-empty, `POST /instruments` (custom Seligson) fetches the CSV once after distribution cache write and upserts historical `prices` (`source = seligson_csv_backfill`, EUR, `close`; `api/src/service/seligsonArvohistoriaCsv.ts`).

API fetches Seligson HTML to resolve `name` on new `seligson_funds` rows (`fetchSeligsonFundName`). On distribution refresh, `parseSeligsonFundName` runs on the same FundViewer HTML; `seligson_funds.name` updates. Instrument labels use `instruments.display_name` (set at create); refresh updates `display_name` when it still mirrors the old title or strips to the parsed name. Failures → HTTP errors with body; exact routes/status codes in `api`.

`FundValues_FI.html` uses shorter link text than FundViewer in some rows; `fundValuesRowMatchesDbName` includes aliases (e.g. table `Global Brands` ↔ DB name containing “Top 25 Brands”) in `FUND_VALUES_TABLE_LABEL_ALIASES` in `api/src/distributions/seligsonFundValues.ts`. Each row has `Pvm` (Finnish `d.m.yyyy`); `prices.price_date` uses that cell per fund, not the fetch instant.

## Allocation table (e.g. Pharos)

Some funds publish a **static HTML table** (“Osuus rahastosta”) linked from the fund intro page as **Rahaston sijoitukset** instead of FundViewer line-by-line holdings. When `public_allocation_page_url` is set, distribution refresh fetches **that** page and parses the table with `api/src/distributions/seligsonPharosAllocationTable.ts`, then merges **matched** child instruments’ latest distributions (same merge as portfolio weighting; cash lines map to pseudo `cash`). If the URL is missing or the page does not parse as that table format, refresh falls back to the bond or holdings FundViewer paths.

**Legacy:** instruments created with manual `instrument_composite_constituents` still refresh with `distributions.source = composite` (detection: at least one constituent row for `parent_instrument_id`).

## Holdings distribution (HTML scrape)

**Bond funds:** When view=40 Allokaatio includes Korkosijoitukset and the “Korkosijoitusten jakauma” table has Pitkät korot (yrityslainat)/(valtionlainat)/Lyhyet korot, the API uses view=40 (allocation + bond-type split) and view=20 (long-bond maajakauma) instead of line-by-line holdings. Sector keys: `long_government_bonds`, `long_corporate_bonds`, `short_bonds`, plus `cash`. Raw HTML in `seligson_distribution_cache.allocation_html` and `country_html`; `holdings_html` null. Portfolio country merge scales by long govt + long corp weights (not short bonds or cash).

**Equity / mixed:** Scrape FundViewer holdings view=10; `fid` in URL must match `seligson_funds`. Users register via `/instruments/new` (FID + Seligson-type broker); rows are find-or-created by the API. Geo: each row’s Finnish `Maa` → ISO via `resolveRegionKeyToIso`. Sectors: line weights use Yahoo `quoteSummary` `assetProfile.sector` (fallback `industry`) via `mapSectorLabelToCanonicalId` when Yahoo/OpenFIGI resolution succeeds; else Finnish `Toimiala` → `SELIGSON_FINNISH_SECTOR_LABEL_MAP` (unknown → `sectors.other`). Resolution pipeline: `api/src/distributions/seligsonHoldingsResolve.ts` (search query expansion, legal-name normalization, `namesMatchSeligsonYahoo`, OpenFIGI + multiple Yahoo candidates, ISIN acceptance paths). Wrong ticker/name pairs are possible — manual validation of cached resolutions may be added later. Resolved lines cached in `seligson_holdings_resolution_cache` (normalized name + ISO, `ZZ` when Maa unmapped; Yahoo symbol/name when `source = yahoo`; no TTL). Cash / money-market lines (e.g. Käteinen, dash-only Maa/Toimiala) → `sectors.cash`, omitted from `countries`. Raw: `seligson_distribution_cache.holdings_html`. `YAHOO_MIN_INTERVAL_MS` spaces distinct unresolved lookup keys and OpenFIGI when ISIN fallback runs.

Modules: `api/src/distributions/seligson.ts` (holdings + bond views), `api/src/distributions/seligsonHoldingsResolve.ts` (view=10 Yahoo line resolution).

## HTML parsers

Brittle; prefer tests or fallbacks.

# Distribution data sources

How geographic and sector weights are produced. Implementation under `api`; details drift — read code when editing.

## Index (per-source files)

| Topic | File |
| --- | --- |
| Yahoo Finance (`quoteSummary`) | [yahoo.md](./data-sources/yahoo.md) |
| iShares CSV | [ishares.md](./data-sources/ishares.md) |
| SSGA XLSX | [ssga.md](./data-sources/ssga.md) |
| DWS Xtrackers XLSX | [xtrackers.md](./data-sources/xtrackers.md) |
| J.P. Morgan daily ETF XLSX | [jpm-holdings.md](./data-sources/jpm-holdings.md) |
| SEC 13F information table XML | [sec-13f.md](./data-sources/sec-13f.md) |
| Vanguard UK GPX | [vanguard-uk.md](./data-sources/vanguard-uk.md) |
| J.P. Morgan product-data JSON (sectors) | [jpm-product-data.md](./data-sources/jpm-product-data.md) |
| Seligson (fund name, NAV, FundViewer scrape, Yahoo resolution) | [seligson.md](./data-sources/seligson.md) |

Shared concepts: [normalization](#shared-label-and-sector-normalization), [provider holdings](#provider-holdings-overview), [cash instruments](#cash-instruments), [listed stocks](#listed-stocks-single-names), [geo buckets](#geo-buckets-and-portfolio-chart-rules).

## Shared label and sector normalization

`resolveRegionKeyToIso`: region/country labels → ISO (`db/src/geo/countryIso.ts`, re-exported `@investments/db`). `mapSectorLabelToCanonicalId` and Seligson Finnish sector constants: `api/src/distributions/sectorMapping.ts`. `api/src/distributions/distributionNormalize.ts`: region ISO merge and sector mapping for Yahoo and iShares/SSGA/Xtrackers/JPM (extra `console.warn` on unmapped strings where appropriate). Allowed sector keys in JSON: `db/src/distribution/sectorIds.ts`; UI titles: `web/src/lib/sectorTitles.ts`.

## Provider holdings overview

`instruments.holdings_distribution_url` — HTTPS file or API-backed resource; format from hostname/path (`validateHoldingsDistributionUrl` / `resolveHoldingsProviderKind` in `@investments/db`). Unsupported hosts → 400 on `POST`/`PATCH`.

When set, `distributions` from parsed file or GPX; raw in `provider_holdings_cache`; `yahoo_finance_cache` cleared for that instrument; `prices` still from Yahoo `quoteSummary` when `yahoo_symbol` is set.

Cash / cash-equivalent rows → `sectors.cash`, omitted from `countries` (column names vary by provider — see each source). `GET /portfolio/distributions` scales merged country/region weights by `1 − sectors.cash` per instrument so ETF cash does not inflate geographic exposure.

| Source | Doc |
| --- | --- |
| iShares (CSV) | [ishares.md](./data-sources/ishares.md) |
| SSGA / State Street (daily XLSX) | [ssga.md](./data-sources/ssga.md) |
| DWS Xtrackers (constituent XLSX) | [xtrackers.md](./data-sources/xtrackers.md) |
| J.P. Morgan (daily ETF holdings XLSX) | [jpm-holdings.md](./data-sources/jpm-holdings.md) |
| SEC EDGAR Form 13F (information table XML) | [sec-13f.md](./data-sources/sec-13f.md) |
| Vanguard UK Professional (GPX GraphQL) | [vanguard-uk.md](./data-sources/vanguard-uk.md) |

Optional sector breakdown from J.P. Morgan product-data JSON (with JPM XLSX URL): [jpm-product-data.md](./data-sources/jpm-product-data.md).

## Cash instruments

No external valuation fetch beyond FX — nominal balance in `cash_currency` (`SUPPORTED_CASH_CURRENCY_CODES` in `db`). Country required: `cash_geo_key` (`instruments_cash_geo_required_ck`). `POST /instruments` validates ISO 3166-1 alpha-2 (`normalizeCashAccountIsoCountryCode` / `ISO_3166_1_ALPHA2_CODES` in `@investments/db`); stored uppercase. Legacy rows may predate this. `display_name` unique among cash instruments (case-insensitive, trimmed; partial unique `instruments_cash_account_display_name_uidx`); duplicate → 409 on `POST`. Not used for distribution chart weights — see [Geo buckets](#geo-buckets-and-portfolio-chart-rules).

## Listed stocks (single names)

Sector/industry from Yahoo when present; geography is often issuer-country-only, not full economic exposure. Typical single names lack fund-style sector/country weights in Yahoo (e.g. `BRK-B`: no `topHoldings` / `fundProfile`); use a 13F information table URL on `sec.gov` for holdings-weighted sector/geo (e.g. Berkshire). [yahoo.md](./data-sources/yahoo.md), [sec-13f.md](./data-sources/sec-13f.md).

## Geo buckets and portfolio chart rules

`cash_account` positions excluded from aggregated region and sector weights (non-cash renormalized to 100%).

`@investments/db` maps ISO codes to default buckets: `finland`, `europe` (excl. Finland, incl. Greenland), `north_america` (US, CA, PR/VI/GU/AS/MP/UM), `asia` (JP, KR, SG, TW, BN, AU, NZ — CN/HK/MO → `china`; other Asia → `emerging_markets`), `china` (CN+HK+MO), `emerging_markets` (LatAm, Caribbean, Mexico, Asian EM/frontier — see `db/src/geo/geoBuckets.ts`), `unknown`. `GET /portfolio/distributions` returns `regions` aggregated to these bucket ids (value-weighted). Per-instrument `distributions.payload.countries`: ISO weights (Seligson: view=10 per-line Maa, no macro fallback). Bucket display icons and ISO→flag emoji: `GEO_BUCKET_DISPLAY_ICONS`, `countryIsoToFlagEmoji` in `db/src/geo/geoBuckets.ts`.

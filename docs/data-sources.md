# Distribution data sources

How geographic and sector weights are produced. Implementation lives under `api`; details drift—read code when editing.

## Index (per-source detail files)

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

Shared concepts below: [normalization](#shared-label-and-sector-normalization), [provider holdings overview](#provider-holdings-overview), [cash instruments](#cash-instruments), [listed stocks](#listed-stocks-single-names), [geo buckets and charts](#geo-buckets-and-portfolio-chart-rules).

## Shared label and sector normalization

**`resolveRegionKeyToIso`** maps region/country labels to ISO keys (**`db/src/geo/countryIso.ts`**, re-exported from **`@investments/db`**). **`mapSectorLabelToCanonicalId`** and Seligson Finnish sector constants live in **`api/src/distributions/sectorMapping.ts`**. **`api/src/distributions/distributionNormalize.ts`** applies region ISO merging and sector mapping for Yahoo `quoteSummary` and iShares/SSGA/Xtrackers/J.P. Morgan (with extra **`console.warn`** on unmapped strings where appropriate). Allowed sector **keys** stored in JSON are listed in **`db/src/distribution/sectorIds.ts`**; **display titles** for the web UI are **`web/src/lib/sectorTitles.ts`**.

## Provider holdings overview

**`instruments.holdings_distribution_url`** points to an **HTTPS** file or API-backed resource; format is inferred from hostname/path (**`validateHoldingsDistributionUrl`** / **`resolveHoldingsProviderKind`** in **`@investments/db`**). Unsupported hosts **400** on **`POST`/`PATCH`**.

When set, **`distributions`** come from the parsed file or GPX response; raw text/base64/JSON is stored in **`provider_holdings_cache`**, and **`yahoo_finance_cache`** is cleared for that instrument; **`prices`** still use Yahoo **`quoteSummary`** when **`yahoo_symbol`** is set.

**Cash / cash-equivalent** rows in provider files are attributed to **`sectors.cash`** and **omitted** from **`countries`** (column names differ by provider—see each source). **`GET /portfolio/distributions`** scales merged **country/region** weights by **`1 − sectors.cash`** per instrument so ETF cash does not inflate geographic exposure.

Per-provider parsers and URL shapes:

| Source | Doc |
| --- | --- |
| iShares (CSV) | [ishares.md](./data-sources/ishares.md) |
| SSGA / State Street (daily XLSX) | [ssga.md](./data-sources/ssga.md) |
| DWS Xtrackers (constituent XLSX) | [xtrackers.md](./data-sources/xtrackers.md) |
| J.P. Morgan (daily ETF holdings XLSX) | [jpm-holdings.md](./data-sources/jpm-holdings.md) |
| SEC EDGAR Form 13F (information table XML) | [sec-13f.md](./data-sources/sec-13f.md) |
| Vanguard UK Professional (GPX GraphQL) | [vanguard-uk.md](./data-sources/vanguard-uk.md) |

Optional **sector** breakdown from J.P. Morgan **product-data** JSON (only with JPM XLSX URL): [jpm-product-data.md](./data-sources/jpm-product-data.md).

## Cash instruments

No external fetch for valuation beyond FX—nominal balance is in **`cash_currency`** (see **`SUPPORTED_CASH_CURRENCY_CODES`** in `db`); **country code** is **required** (DB column **`cash_geo_key`**, **`instruments_cash_geo_required_ck`**). **`POST /instruments`** validates it as **ISO 3166-1 alpha-2** (**`normalizeCashAccountIsoCountryCode`** / **`ISO_3166_1_ALPHA2_CODES`** in **`@investments/db`**); stored uppercase. Legacy rows may predate this. **`display_name`** is **unique among cash instruments** (case-insensitive, trimmed; partial unique index **`instruments_cash_account_display_name_uidx`**); **`POST /instruments`** returns **409** on duplicate name. **Not** used for portfolio distribution chart weights (see [Geo buckets and portfolio chart rules](#geo-buckets-and-portfolio-chart-rules)).

## Listed stocks (single names)

Sector/industry from Yahoo when present; geography is often **issuer-country-only** as a simplification, not economic exposure. **Yahoo does not expose fund-style sector/country weightings for typical single names** (e.g. **`BRK-B`**: no `topHoldings` / `fundProfile`); use a **13F information table URL** on **`sec.gov`** when you need holdings-weighted sector/geo (e.g. Berkshire). See [yahoo.md](./data-sources/yahoo.md) and [sec-13f.md](./data-sources/sec-13f.md).

## Geo buckets and portfolio chart rules

`cash_account` positions are **excluded** from aggregated **region** and **sector** distribution weights (non-cash holdings are renormalized to sum to 100%).

Shared logic in **`@investments/db`** maps ISO codes into default buckets: **`finland`**, **`europe`** (Europe excl. Finland, incl. **Greenland**), **`north_america`** (**US, CA**, U.S. insular areas **PR/VI/GU/AS/MP/UM**), **`asia`** (developed APAC: JP, KR, SG, TW, BN, AU, NZ — **CN/HK/MO** go to **`china`**; other Asia → **`emerging_markets`**), **`china`** (CN + HK + MO), **`emerging_markets`** (Latin America, Caribbean, Mexico, and Asian EM/frontier — see **`db/src/geo/geoBuckets.ts`**), **`unknown`** (region string could not be mapped to ISO — extend **`db/src/geo/countryIso.ts`**). **`GET /portfolio/distributions`** returns **`regions`** already aggregated to these bucket ids (value-weighted across open positions). Instrument **`distributions.payload.countries`** hold **per-instrument** ISO country weights (Seligson: **view=10 per-line Maa**, no macro fallback). **Bucket display icons** and **ISO→flag emoji** (`GEO_BUCKET_DISPLAY_ICONS`, `countryIsoToFlagEmoji`) live in **`db/src/geo/geoBuckets.ts`**.

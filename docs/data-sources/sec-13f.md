# SEC EDGAR Form 13F (information table XML)

HTTPS information table XML on `sec.gov`, e.g. `…/Archives/edgar/data/<cik>/<accession>/…xml` from a filing’s INFORMATION TABLE document. Source key `sec_13f_infotable_xml`. Parse `api/src/distributions/parseSec13FInfoTableXml.ts`; build `api/src/distributions/buildSec13fDistribution.ts`.

Flow: parse `infoTable` rows (CUSIP, value); skip puts/calls; keep lines with value ≥ 0.25% of filing total (renormalize weights; if none qualify, use all lines). Resolve each kept line via OpenFIGI (CUSIP, 10 jobs per request) and Yahoo `assetProfile` (sector + country) with `YAHOO_MIN_INTERVAL_MS` spacing. Set `SEC_EDGAR_USER_AGENT` (org + contact email) for `sec.gov` per SEC policy. When `holdings_distribution_url` is unset, distributions stay Yahoo-only.

[Provider holdings overview](../data-sources.md#provider-holdings-overview).

# SEC EDGAR Form 13F (information table XML)

**HTTPS** **information table** XML on **`sec.gov`**, e.g. **`…/Archives/edgar/data/<cik>/<accession>/…xml`** from a filing’s **INFORMATION TABLE** document. Distribution source key **`sec_13f_infotable_xml`**. Parsing **`api/src/distributions/parseSec13FInfoTableXml.ts`**; distribution build **`api/src/distributions/buildSec13fDistribution.ts`**.

**13F path:** parse **`infoTable`** rows (CUSIP, value), skip puts/calls; keep only lines with value **≥ 0.25%** of the filing total (sum of `value`) for OpenFIGI/Yahoo (weights renormalize over that subset; if nothing qualifies, all lines are used); resolve each kept line via **OpenFIGI** (CUSIP, **10** mapping jobs per HTTP request) and **Yahoo `assetProfile`** (sector + country) with **`YAHOO_MIN_INTERVAL_MS`** spacing; set **`SEC_EDGAR_USER_AGENT`** (org + contact email) for **`sec.gov`** downloads per SEC fair-use policy. When **`holdings_distribution_url`** is unset, distributions remain Yahoo-only for that instrument.

See [Provider holdings overview](../data-sources.md#provider-holdings-overview) for shared cache behavior.

# Amundi ETF product page (composition API)

HTTPS **Amundi ETF country site** product URL (`www.amundietf.{tld}`, not bare `amundietf.com`). Path must include `/products/` and end with the fund **ISIN** (same pattern as the public product page).

Source key `amundi_etf_composition_api`. Parser `api/src/distributions/parseAmundiHoldingsComposition.ts`. Fetch `api/src/distributions/fetchAmundiHoldingsComposition.ts` — `POST {origin}/mapi/ProductAPI/getProductsData` with `composition.compositionFields` (same JSON as the on-site full holdings XLSX).

Context (`countryCode`, language, retail vs professional) is inferred from hostname and path (`api/src/distributions/inferAmundiApiContext.ts`).

Geography uses `countryOfRisk` (fallback `country`); sectors from GICS-style `sector` strings. Cash-like rows → `sectors.cash`, omitted from `countries` (see `parseAmundiHoldingsComposition.ts`).

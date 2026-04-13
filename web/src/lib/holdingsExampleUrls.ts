/** Example HTTPS URLs accepted by `validateHoldingsDistributionUrl` (see `api` providerHoldings tests). */

/** Vanguard UK Professional fund page (GPX GraphQL holdings; port id in path). */
export const VANGUARD_UK_HOLDINGS_EXAMPLE_URL =
  "https://www.vanguard.co.uk/professional/product/etf/equity/9678/ftse-emerging-markets-ucits-etf-usd-accumulating";

export const ISHARES_HOLDINGS_EXAMPLE_URL =
  "https://www.ishares.com/uk/individual/en/products/253743/ishares-sp-500-b-ucits-etf-acc-fund/1506575576011.ajax?fileType=csv&fileName=CSPX_holdings&dataType=fund";

export const SPDR_HOLDINGS_EXAMPLE_URL =
  "https://www.ssga.com/fi/en_gb/intermediary/library-content/products/fund-data/etfs/emea/holdings-daily-emea-en-spyi-gy.xlsx";

export const XTRACKERS_HOLDINGS_EXAMPLE_URL =
  "https://etf.dws.com/etfdata/export/GBR/ENG/excel/product/constituent/IE00BLNMYC90/";

export const JPM_HOLDINGS_EXAMPLE_URL =
  "https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip=IE00BJRCLL96&country=gb&role=per&fundType=N_ETF&locale=en-GB&isUnderlyingHolding=false&isProxyHolding=false";

/** Example product-data URL for `provider_breakdown_data_url` (J.P. Morgan; use with JPM daily ETF holdings XLSX URL). */
export const JPM_PRODUCT_DATA_BREAKDOWN_EXAMPLE_URL =
  "https://am.jpmorgan.com/FundsMarketingHandler/product-data?cusip=IE00BJRCLL96&country=gb&role=per&fundType=N_ETF&locale=en-GB";

/** SEC EDGAR 13F information table XML (filename varies per filing). */
export const SEC_13F_HOLDINGS_EXAMPLE_URL =
  "https://www.sec.gov/Archives/edgar/data/1067983/000119312526054580/50240.xml";

/** Amundi ETF product page (composition from `getProductsData`; any amundietf.* country site). */
export const AMUNDI_ETF_HOLDINGS_EXAMPLE_URL =
  "https://www.amundietf.nl/en/individual/products/equity/amundi-prime-all-country-world-ucits-etf-acc/ie0003xja0j9";

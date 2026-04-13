import { describe, expect, it } from "vitest";
import {
  assertProviderDocumentMatchesInstrument,
  documentMatchesInstrument,
  extractHoldingsUrlIdentifiers,
  mergeProviderDocumentIdentifiers,
  vanguardIdentifiersFromFundName,
} from "./providerDocumentIdentity.js";

describe("extractHoldingsUrlIdentifiers", () => {
  it("reads JPM cusip query param as ISIN", () => {
    const ids = extractHoldingsUrlIdentifiers(
      "https://am.jpmorgan.com/FundsMarketingHandler/excel?type=dailyETFHoldings&cusip=IE00BJRCLL96&country=gb",
      "jpm_xlsx",
    );
    expect(ids.isins).toContain("IE00BJRCLL96");
  });

  it("adds Vanguard slug as a name phrase", () => {
    const ids = extractHoldingsUrlIdentifiers(
      "https://www.vanguard.co.uk/professional/product/etf/equity/9678/ftse-emerging-markets-ucits-etf-usd-accumulating",
      "vanguard_uk_gpx",
    );
    expect(ids.names.some((n) => n.includes("emerging"))).toBe(true);
  });

  it("adds Amundi product slug as a name phrase", () => {
    const ids = extractHoldingsUrlIdentifiers(
      "https://www.amundietf.nl/en/individual/products/equity/amundi-prime-all-country-world-ucits-etf-acc/ie0003xja0j9",
      "amundi_etf_api",
    );
    expect(ids.isins).toContain("IE0003XJA0J9");
    expect(
      ids.names.some((n) => n.toLowerCase().includes("prime all country")),
    ).toBe(true);
  });
});

describe("assertProviderDocumentMatchesInstrument", () => {
  it("passes when document ISIN matches instrument ISIN", () => {
    assertProviderDocumentMatchesInstrument(
      {
        displayName: "JPM USD ETF",
        yahooSymbol: null,
        isin: "IE00BJRCLL96",
      },
      mergeProviderDocumentIdentifiers({
        isins: ["IE00BJRCLL96"],
        tickers: [],
        names: [],
      }),
    );
  });

  it("throws when document ISIN contradicts instrument ISIN", () => {
    expect(() =>
      assertProviderDocumentMatchesInstrument(
        {
          displayName: "Other Fund",
          yahooSymbol: null,
          isin: "IE00AAAAAAAA",
        },
        mergeProviderDocumentIdentifiers({
          isins: ["IE00BJRCLL96"],
          tickers: [],
          names: [],
        }),
      ),
    ).toThrow(/does not match/);
  });

  it("no-ops when there are no extracted identifiers", () => {
    assertProviderDocumentMatchesInstrument(
      {
        displayName: "Anything",
        yahooSymbol: "SPY",
        isin: null,
      },
      { isins: [], tickers: [], names: [] },
    );
  });
});

describe("documentMatchesInstrument", () => {
  it("matches Amundi URL to instrument when Yahoo ISIN differs but name matches slug", () => {
    const doc = extractHoldingsUrlIdentifiers(
      "https://www.amundietf.nl/en/individual/products/equity/amundi-prime-all-country-world-ucits-etf-acc/ie0003xja0j9",
      "amundi_etf_api",
    );
    const ok = documentMatchesInstrument(
      {
        displayName: "Amundi Prime All Country World UCITS ETF Acc",
        yahooSymbol: "WEBN.DE",
        isin: "IE00BBBBBBBB",
      },
      doc,
    );
    expect(ok).toBe(true);
  });

  it("matches on fund name overlap", () => {
    const ok = documentMatchesInstrument(
      {
        displayName: "Vanguard FTSE Emerging Markets UCITS ETF",
        yahooSymbol: null,
        isin: null,
      },
      mergeProviderDocumentIdentifiers(
        vanguardIdentifiersFromFundName(
          "Vanguard FTSE Emerging Markets UCITS ETF (USD) Accumulating",
        ),
        extractHoldingsUrlIdentifiers(
          "https://www.vanguard.co.uk/professional/product/etf/equity/9678/ftse-emerging-markets-ucits-etf-usd-accumulating",
          "vanguard_uk_gpx",
        ),
      ),
    );
    expect(ok).toBe(true);
  });
});

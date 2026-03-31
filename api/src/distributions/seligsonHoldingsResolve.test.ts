import { describe, expect, it } from "vitest";
import {
  SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO,
  buildSeligsonResolutionCacheKey,
  extractIsinFromText,
} from "./seligson.js";
import {
  namesMatchSeligsonYahoo,
  normalizeIsin12,
} from "./seligsonHoldingsResolve.js";

describe("extractIsinFromText", () => {
  it("returns first valid ISIN in markup", () => {
    expect(extractIsinFromText("foo US0378331005 bar")).toBe("US0378331005");
  });
});

describe("buildSeligsonResolutionCacheKey", () => {
  it("uses normalized name and parsed ISO country", () => {
    expect(
      buildSeligsonResolutionCacheKey({
        companyName: "ACME CORP",
        countryFi: "Yhdysvallat",
        toimialaFi: "Teknologia",
        weight: 0.1,
        isin: null,
      }),
    ).toEqual({
      seligsonCompanyName: "acme corp",
      countryIso: "US",
    });
  });

  it("uses ZZ when Maa does not map to ISO", () => {
    expect(
      buildSeligsonResolutionCacheKey({
        companyName: "Foo",
        countryFi: "not-a-real-seligson-label-xyz",
        toimialaFi: "Teknologia",
        weight: 0.1,
        isin: null,
      }),
    ).toEqual({
      seligsonCompanyName: "foo",
      countryIso: SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO,
    });
  });
});

describe("normalizeIsin12", () => {
  it("uppercases valid ISINs for OpenFIGI and Yahoo suffix rules", () => {
    expect(normalizeIsin12("us0378331005")).toBe("US0378331005");
    expect(normalizeIsin12(" US0378331005 ")).toBe("US0378331005");
  });

  it("returns null for invalid input", () => {
    expect(normalizeIsin12(null)).toBe(null);
    expect(normalizeIsin12("short")).toBe(null);
  });
});

describe("namesMatchSeligsonYahoo", () => {
  it("matches substring names", () => {
    expect(
      namesMatchSeligsonYahoo("Microsoft Corporation", "Microsoft Corporation"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("Microsoft Corp", "Microsoft Corporation"),
    ).toBe(true);
  });

  it("rejects short strings", () => {
    expect(namesMatchSeligsonYahoo("AB", "AB")).toBe(false);
  });

  it("matches when only trailing legal form differs (AG vs Aktiengesellschaft)", () => {
    expect(
      namesMatchSeligsonYahoo(
        "bayerische motoren werke ag",
        "Bayerische Motoren Werke Aktiengesellschaft",
      ),
    ).toBe(true);
  });

  it("matches after stripping both sides to the same core name", () => {
    expect(namesMatchSeligsonYahoo("Volvo AB", "Volvo Aktiebolag")).toBe(true);
  });

  it("matches when Yahoo S.A. / S.p.A. became s a / s p a after punctuation normalize", () => {
    expect(namesMatchSeligsonYahoo("danone sa", "Danone S.A.")).toBe(true);
    expect(namesMatchSeligsonYahoo("l'oreal sa", "L'Oréal S.A.")).toBe(true);
    expect(namesMatchSeligsonYahoo("prada spa", "Prada S.p.A.")).toBe(true);
  });

  it("matches US co/the and The … Company with Yahoo", () => {
    expect(
      namesMatchSeligsonYahoo("coca-cola co/the", "The Coca-Cola Company"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "procter & gamble co/the",
        "The Procter & Gamble Company",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("walt disney co/the", "The Walt Disney Company"),
    ).toBe(true);
  });

  it("matches LVMH when Seligson uses SE and Yahoo spells Société Européenne", () => {
    expect(
      namesMatchSeligsonYahoo(
        "lvmh moet hennessy louis vuitton se",
        "LVMH Moët Hennessy - Louis Vuitton, Société Européenne",
      ),
    ).toBe(true);
  });

  it("matches Seligson cos to Yahoo Companies and common US suffixes", () => {
    expect(
      namesMatchSeligsonYahoo("lowe's cos inc", "Lowe's Companies, Inc."),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "marsh & mclennan cos inc",
        "Marsh & McLennan Companies, Inc.",
      ),
    ).toBe(true);
    expect(namesMatchSeligsonYahoo("ge vernova llc", "GE Vernova Inc.")).toBe(
      true,
    );
    expect(
      namesMatchSeligsonYahoo(
        "goldman sachs group inc/the",
        "The Goldman Sachs Group, Inc.",
      ),
    ).toBe(true);
  });

  it("matches & with and (e.g. Hong Kong Exchanges)", () => {
    expect(
      namesMatchSeligsonYahoo(
        "hong kong exchanges & clearing",
        "Hong Kong Exchanges and Clearing Limited",
      ),
    ).toBe(true);
  });

  it("matches short first-token tickers to spelled-out Yahoo names (e.g. ANZ)", () => {
    expect(
      namesMatchSeligsonYahoo(
        "anz group holdings ltd",
        "Australia and New Zealand Banking Group Limited",
      ),
    ).toBe(true);
  });

  it("strips /Japan suffix before matching", () => {
    expect(
      namesMatchSeligsonYahoo(
        "oriental land co ltd/japan",
        "Oriental Land Co., Ltd.",
      ),
    ).toBe(true);
  });

  it("matches Japanese KK and kabushiki kaisha tails", () => {
    expect(
      namesMatchSeligsonYahoo(
        "nippon yusen kk",
        "Nippon Yusen Kabushiki Kaisha",
      ),
    ).toBe(true);
  });

  it("matches short REIT names to long Yahoo trust names via significant words", () => {
    expect(
      namesMatchSeligsonYahoo("link reit", "Link Real Estate Investment Trust"),
    ).toBe(true);
  });

  it("matches seven and i style names", () => {
    expect(
      namesMatchSeligsonYahoo(
        "seven and i holdings co ltd",
        "Seven & i Holdings Co., Ltd.",
      ),
    ).toBe(true);
  });

  it("matches Finnish Oyj and two-letter tickers (e.g. EQ)", () => {
    expect(
      namesMatchSeligsonYahoo("metso outotec oyj", "Metso Outotec Oyj"),
    ).toBe(true);
    expect(namesMatchSeligsonYahoo("eq oyj", "EQ Oyj")).toBe(true);
  });

  it("strips /Canada and /Delaware and Danish a/s", () => {
    expect(namesMatchSeligsonYahoo("atco ltd/canada", "ATCO Ltd.")).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "cisco systems inc/delaware",
        "Cisco Systems, Inc.",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("dsv panalpina a/s", "DSV Panalpina A/S"),
    ).toBe(true);
  });

  it("normalizes Spanish y to and (Vina Concha y Toro)", () => {
    expect(
      namesMatchSeligsonYahoo(
        "vina concha y toro sa",
        "Viña Concha y Toro S.A.",
      ),
    ).toBe(true);
  });
});

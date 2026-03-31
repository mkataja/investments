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
});

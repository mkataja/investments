import { describe, expect, it } from "vitest";
import {
  SELIGSON_RESOLUTION_UNKNOWN_COUNTRY_ISO,
  buildSeligsonResolutionCacheKey,
  extractIsinFromText,
} from "./seligson.js";
import {
  buildYahooSearchQueriesForSeligson,
  expandCoTheStyleSearchQueries,
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

describe("expandCoTheStyleSearchQueries", () => {
  it("rewrites cos inc/the and co/the for Yahoo search", () => {
    expect(expandCoTheStyleSearchQueries("williams cos inc/the")).toEqual([
      "williams companies",
    ]);
    expect(expandCoTheStyleSearchQueries("southern co/the")).toEqual([
      "southern company",
    ]);
    expect(expandCoTheStyleSearchQueries("ge vernova llc")).toEqual([
      "ge vernova",
    ]);
  });

  it("drops companies after hyphenated cos inc/the (Sherwin-Williams)", () => {
    expect(
      expandCoTheStyleSearchQueries("sherwin-williams cos inc/the"),
    ).toEqual([
      "sherwin-williams",
      "sherwin williams",
      "sherwin-williams companies",
      "sherwin williams companies",
    ]);
  });

  it("prepends Carrefour and Canadian mining names before long literals", () => {
    expect(
      expandCoTheStyleSearchQueries("cie generale des etablissement"),
    ).toEqual(["carrefour"]);
    expect(expandCoTheStyleSearchQueries("barrick gold corp")).toEqual([
      "ABX.TO",
      "Barrick Mining",
    ]);
    expect(expandCoTheStyleSearchQueries("agnico eagle mines ltd")).toEqual([
      "AEM",
      "agnico eagle",
    ]);
  });
});

describe("buildYahooSearchQueriesForSeligson", () => {
  it("prepends FI queries that match Yahoo listing names (Metso Outotec, Aktia Pankki)", () => {
    expect(
      buildYahooSearchQueriesForSeligson("metso outotec oyj", "FI"),
    ).toEqual(["metso oyj", "metso outotec oyj", "metso outotec"]);
    expect(buildYahooSearchQueriesForSeligson("aktia oyj", "FI")).toEqual([
      "aktia pankki",
      "aktia oyj",
      "aktia",
    ]);
  });

  it("prepends co/the-style expansions before raw Seligson strings (US names)", () => {
    expect(
      buildYahooSearchQueriesForSeligson("williams cos inc/the", "US"),
    ).toEqual(["williams companies", "williams cos inc/the"]);
  });

  it("prepends CA.PA for truncated Carrefour legal name when country is France", () => {
    expect(
      buildYahooSearchQueriesForSeligson(
        "cie generale des etablissement",
        "FR",
      ),
    ).toEqual(["CA.PA", "carrefour", "cie generale des etablissement"]);
  });

  it("prepends NSIS-B.CO for Novonesis when country is Denmark", () => {
    expect(buildYahooSearchQueriesForSeligson("novonesis", "DK")).toEqual([
      "NSIS-B.CO",
      "novonesis group",
      "novonesis",
    ]);
  });

  it("prepends JP and HK Yahoo search queries (kk strip, HKEX / exchange wording)", () => {
    expect(buildYahooSearchQueriesForSeligson("nippon yusen kk", "JP")).toEqual(
      ["nippon yusen", "nippon yusen kk"],
    );
    expect(
      buildYahooSearchQueriesForSeligson(
        "hong kong exchanges & clearing",
        "HK",
      ),
    ).toEqual([
      "hong kong exchange and clearing",
      "HKEX",
      "hong kong exchanges & clearing",
    ]);
  });

  it("falls back to primary and Oyj-stripped query only when not FI", () => {
    expect(buildYahooSearchQueriesForSeligson("aktia oyj", "SE")).toEqual([
      "aktia oyj",
      "aktia",
    ]);
    expect(buildYahooSearchQueriesForSeligson("aktia oyj", null)).toEqual([
      "aktia oyj",
      "aktia",
    ]);
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
    expect(
      namesMatchSeligsonYahoo(
        "lvmh moet hennessy louis vuitton se",
        "LVMH Moët Hennessy Louis Vuitton SE",
      ),
    ).toBe(true);
  });

  it("matches Munich Re ASCII (ue) and truncated hyphen before Yahoo umlauts", () => {
    expect(
      namesMatchSeligsonYahoo(
        "muenchener rueckversicherungs-",
        "Münchener Rückversicherungs-Gesellschaft AG",
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
    expect(
      namesMatchSeligsonYahoo(
        "williams cos inc/the",
        "The Williams Companies, Inc.",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("tjx cos inc/the", "TJX Companies, Inc."),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("southern co/the", "The Southern Company"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "sherwin-williams cos inc/the",
        "The Sherwin-Williams Company",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "marriott international inc/md",
        "Marriott International, Inc.",
      ),
    ).toBe(true);
    expect(namesMatchSeligsonYahoo("kroger co/the", "The Kroger Co.")).toBe(
      true,
    );
    expect(
      namesMatchSeligsonYahoo("home depot inc/the", "The Home Depot, Inc."),
    ).toBe(true);
    expect(namesMatchSeligsonYahoo("boeing co/the", "The Boeing Company")).toBe(
      true,
    );
    expect(
      namesMatchSeligsonYahoo(
        "charles schwab corp/the",
        "The Charles Schwab Corporation",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("barrick gold corp", "Barrick Gold Corporation"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "barrick gold corp",
        "Barrick Mining Corporation",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("bank of nova scotia/the", "Bank of Nova Scotia"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "agnico eagle mines ltd",
        "Agnico Eagle Mines Limited",
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
    expect(namesMatchSeligsonYahoo("aktia oyj", "Aktia Bank Oyj")).toBe(true);
    expect(namesMatchSeligsonYahoo("aktia oyj", "Aktia Pankki Oyj")).toBe(true);
    expect(namesMatchSeligsonYahoo("aktia oyj", "Aktia Bank Pc")).toBe(true);
    expect(namesMatchSeligsonYahoo("metso outotec oyj", "Metso Oyj")).toBe(
      true,
    );
    expect(
      namesMatchSeligsonYahoo("metso outotec oyj", "Metso Corporation"),
    ).toBe(true);
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

  it("normalizes German boerse vs Yahoo ö (Deutsche Börse)", () => {
    expect(
      namesMatchSeligsonYahoo("deutsche boerse ag", "Deutsche Börse AG"),
    ).toBe(true);
  });

  it("maps French Cie to compagnie (Saint-Gobain)", () => {
    expect(
      namesMatchSeligsonYahoo(
        "cie de saint-gobain",
        "Compagnie de Saint-Gobain",
      ),
    ).toBe(true);
  });

  it("maps truncated Carrefour legal name to Carrefour SA", () => {
    expect(
      namesMatchSeligsonYahoo("cie generale des etablissement", "Carrefour SA"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo(
        "cie generale des etablissement",
        "Compagnie générale des établissements Carrefour",
      ),
    ).toBe(true);
  });

  it("maps Hong Kong Exchanges to Exchange for HKEX-style names", () => {
    expect(
      namesMatchSeligsonYahoo(
        "hong kong exchanges & clearing",
        "Hong Kong Exchange and Clearing Limited",
      ),
    ).toBe(true);
  });

  it("matches Yahoo ticker-only display names HKEX and NYK to Seligson legal strings", () => {
    expect(
      namesMatchSeligsonYahoo("hong kong exchanges & clearing", "HKEX"),
    ).toBe(true);
    expect(namesMatchSeligsonYahoo("nippon yusen kk", "NYK")).toBe(true);
    expect(namesMatchSeligsonYahoo("nippon yusen kk", "NYK Line")).toBe(true);
  });

  it("maps Corp to Corporation and matches US co/the names", () => {
    expect(
      namesMatchSeligsonYahoo(
        "progressive corp/the",
        "The Progressive Corporation",
      ),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("kraft heinz co/the", "The Kraft Heinz Company"),
    ).toBe(true);
    expect(
      namesMatchSeligsonYahoo("coca-cola co/the", "The Coca-Cola Company"),
    ).toBe(true);
  });

  it("matches Power Corporation of Canada (corp vs corporation)", () => {
    expect(
      namesMatchSeligsonYahoo(
        "power corp of canada",
        "Power Corporation of Canada",
      ),
    ).toBe(true);
  });

  it("folds Turkish dotless i for Sabancı-style names", () => {
    expect(
      namesMatchSeligsonYahoo(
        "haci omer sabanci holding as",
        "Hacı Ömer Sabancı Holding A.Ş.",
      ),
    ).toBe(true);
  });

  it("matches short single-word names against longer Yahoo titles", () => {
    expect(namesMatchSeligsonYahoo("novonesis", "Novonesis A/S")).toBe(true);
    expect(namesMatchSeligsonYahoo("novonesis", "Novozymes A/S")).toBe(true);
    expect(namesMatchSeligsonYahoo("serkland", "Serkland Capital AB")).toBe(
      true,
    );
  });
});

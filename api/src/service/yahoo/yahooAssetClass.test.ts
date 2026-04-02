import { describe, expect, it } from "vitest";
import { isBondLikeFromYahooQuoteSummaryRaw } from "./yahooAssetClass.js";

describe("isBondLikeFromYahooQuoteSummaryRaw", () => {
  it("detects bond fund category", () => {
    expect(
      isBondLikeFromYahooQuoteSummaryRaw({
        fundProfile: { categoryName: "Intermediate Core Bond" },
      }),
    ).toBe(true);
  });

  it("detects fixed income", () => {
    expect(
      isBondLikeFromYahooQuoteSummaryRaw({
        fundProfile: { categoryName: "Global Fixed Income" },
      }),
    ).toBe(true);
  });

  it("returns false for equity ETF category", () => {
    expect(
      isBondLikeFromYahooQuoteSummaryRaw({
        fundProfile: { categoryName: "Large Blend" },
        assetProfile: { industry: "Software" },
      }),
    ).toBe(false);
  });

  it("returns false for invalid input", () => {
    expect(isBondLikeFromYahooQuoteSummaryRaw(null)).toBe(false);
    expect(isBondLikeFromYahooQuoteSummaryRaw(undefined)).toBe(false);
  });
});

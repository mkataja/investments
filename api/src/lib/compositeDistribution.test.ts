import { compositePseudoKeyToSyntheticPayload } from "@investments/db";
import { describe, expect, it } from "vitest";
import { mergeCompositeDistributionPayload } from "./compositeDistribution.js";

describe("mergeCompositeDistributionPayload", () => {
  it("merges known child payloads and empty slice (unknown sector)", () => {
    const out = mergeCompositeDistributionPayload([
      {
        weight: 0.5,
        payload: {
          countries: { FI: 1 },
          sectors: { technology: 1 },
        },
      },
      { weight: 0.5, payload: null },
    ]);
    expect(out.countries.FI).toBeDefined();
    expect(out.countries.__portfolio_unknown__).toBeDefined();
    expect(out.sectors.__portfolio_unknown__).toBeDefined();
  });

  it("merges pseudo other_ultrashort_bonds into ultrashort_bonds sector", () => {
    const out = mergeCompositeDistributionPayload([
      {
        weight: 1,
        payload: compositePseudoKeyToSyntheticPayload("other_ultrashort_bonds"),
      },
    ]);
    expect(out.sectors.ultrashort_bonds).toBeCloseTo(1, 5);
    expect(out.sectors.__portfolio_unknown__).toBeUndefined();
    expect(out.countries.__portfolio_unknown__).toBeDefined();
  });
});

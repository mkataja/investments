import { describe, expect, it } from "vitest";
import { mergeCompositeDistributionPayload } from "./compositeDistribution.js";

describe("mergeCompositeDistributionPayload", () => {
  it("merges known child payloads and unknown pseudo slice", () => {
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
});

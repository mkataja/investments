import { describe, expect, it } from "vitest";
import { normalizeRawBenchmarkWeights } from "./benchmarkPortfolio.js";

describe("normalizeRawBenchmarkWeights", () => {
  it("normalizes 60 and 40 to 0.6 and 0.4", () => {
    expect(normalizeRawBenchmarkWeights([60, 40])).toEqual([0.6, 0.4]);
  });

  it("returns null when sum is zero", () => {
    expect(normalizeRawBenchmarkWeights([0, 0])).toBeNull();
  });
});

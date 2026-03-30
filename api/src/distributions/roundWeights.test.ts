import { describe, expect, it } from "vitest";
import { roundWeights } from "./roundWeights.js";

describe("roundWeights", () => {
  it("normalizes and forces sum to 1", () => {
    const out = roundWeights({ a: 0.3, b: 0.3, c: 0.4 });
    const sum = Object.values(out).reduce((s, v) => s + v, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("returns empty for empty input", () => {
    expect(roundWeights({})).toEqual({});
  });
});

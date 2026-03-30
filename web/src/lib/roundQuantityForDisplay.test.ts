import { describe, expect, it } from "vitest";
import { roundQuantityForDisplay } from "./roundQuantityForDisplay";

describe("roundQuantityForDisplay", () => {
  it("parses visually whole decimal strings via integer part (no float drift)", () => {
    expect(roundQuantityForDisplay("10")).toBe(10);
    expect(roundQuantityForDisplay("10.0")).toBe(10);
    expect(roundQuantityForDisplay("-3.000")).toBe(-3);
    expect(roundQuantityForDisplay("  42  ")).toBe(42);
  });

  it("rounds fractional values (nearest integer, not truncation)", () => {
    expect(roundQuantityForDisplay("10.7")).toBe(11);
    expect(roundQuantityForDisplay("10.4")).toBe(10);
    expect(roundQuantityForDisplay("10.5")).toBe(11);
    expect(roundQuantityForDisplay("-2.5")).toBe(-2);
  });

  it("handles non-decimal numeric strings", () => {
    expect(roundQuantityForDisplay("1e2")).toBe(100);
  });

  it("returns 0 for non-finite numbers", () => {
    expect(roundQuantityForDisplay("")).toBe(0);
    expect(roundQuantityForDisplay("not a number")).toBe(0);
    expect(roundQuantityForDisplay("Infinity")).toBe(0);
    expect(roundQuantityForDisplay("-Infinity")).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { formatUnitPriceForDisplay } from "./formatUnitPriceForDisplay";

describe("formatUnitPriceForDisplay", () => {
  it("rounds to at most three decimal places", () => {
    expect(formatUnitPriceForDisplay("12.34567")).toBe("12.346");
    expect(formatUnitPriceForDisplay("1.2345")).toBe("1.235");
  });

  it("drops unnecessary fraction zeros", () => {
    expect(formatUnitPriceForDisplay("10")).toBe("10");
    expect(formatUnitPriceForDisplay("10.5")).toBe("10.5");
    expect(formatUnitPriceForDisplay("10.500")).toBe("10.5");
  });

  it("returns trimmed input when not a finite number", () => {
    expect(formatUnitPriceForDisplay("  n/a  ")).toBe("n/a");
  });
});

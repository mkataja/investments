import { NEAR_WHOLE_EPSILON } from "@investments/lib/float";
import { describe, expect, it } from "vitest";
import {
  formatEurAmountForInput,
  parseDecimalInputLoose,
} from "./decimalInput";

describe("parseDecimalInputLoose", () => {
  it("parses comma decimals", () => {
    expect(parseDecimalInputLoose("1,5")).toBe(1.5);
  });
});

describe("formatEurAmountForInput", () => {
  it("drops fractional part when cents are zero", () => {
    expect(formatEurAmountForInput(10_000)).toBe("10000");
  });

  it("uses two decimal places for cents", () => {
    expect(formatEurAmountForInput(12.3)).toBe("12.30");
    expect(formatEurAmountForInput(0.01)).toBe("0.01");
  });

  it("avoids binary float noise in the string", () => {
    expect(formatEurAmountForInput(0.1 + 0.2)).toBe("0.30");
    expect(formatEurAmountForInput(12345.67 + NEAR_WHOLE_EPSILON)).toBe(
      "12345.67",
    );
  });

  it("handles negatives", () => {
    expect(formatEurAmountForInput(-42.5)).toBe("-42.50");
  });

  it("maps non-finite to 0", () => {
    expect(formatEurAmountForInput(Number.NaN)).toBe("0");
    expect(formatEurAmountForInput(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

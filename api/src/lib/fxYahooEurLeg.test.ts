import {
  eurPerUnitOfForeignFromYahooPrice,
  fxYahooPairConfigForForeign,
} from "@investments/lib/fxYahooEurLeg";
import { describe, expect, it } from "vitest";

describe("fxYahooPairConfigForForeign", () => {
  it("returns USD pair with invert", () => {
    const c = fxYahooPairConfigForForeign("usd");
    expect(c?.yahooSymbol).toBe("EURUSD=X");
    expect(c?.invertToEurPerUnit).toBe(true);
  });

  it("returns null for EUR", () => {
    expect(fxYahooPairConfigForForeign("EUR")).toBeNull();
  });

  it("returns null for unknown code", () => {
    expect(fxYahooPairConfigForForeign("XXX")).toBeNull();
  });
});

describe("eurPerUnitOfForeignFromYahooPrice", () => {
  it("inverts USD leg (USD per EUR from Yahoo)", () => {
    expect(eurPerUnitOfForeignFromYahooPrice(1.25, true)).toBeCloseTo(0.8);
  });

  it("passes through when invert false", () => {
    expect(eurPerUnitOfForeignFromYahooPrice(1.17, false)).toBeCloseTo(1.17);
  });
});

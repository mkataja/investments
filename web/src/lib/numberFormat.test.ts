import { describe, expect, it } from "vitest";
import { APP_LOCALE } from "./locale";
import {
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "./numberFormat";

describe("formatUnitPriceForDisplay", () => {
  const unitPriceFormatter = new Intl.NumberFormat(APP_LOCALE, {
    useGrouping: false,
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });

  it("rounds to at most three decimal places", () => {
    expect(formatUnitPriceForDisplay("12.34567")).toBe(
      unitPriceFormatter.format(12.34567),
    );
    expect(formatUnitPriceForDisplay("1.2345")).toBe(
      unitPriceFormatter.format(1.2345),
    );
  });

  it("drops unnecessary fraction zeros", () => {
    expect(formatUnitPriceForDisplay("10")).toBe(unitPriceFormatter.format(10));
    expect(formatUnitPriceForDisplay("10.5")).toBe(
      unitPriceFormatter.format(10.5),
    );
    expect(formatUnitPriceForDisplay("10.500")).toBe(
      unitPriceFormatter.format(10.5),
    );
  });

  it("returns trimmed input when not a finite number", () => {
    expect(formatUnitPriceForDisplay("  n/a  ")).toBe("n/a");
  });
});

describe("formatTransactionUnitPriceForDisplay", () => {
  it("shows buy prices as negative and sell prices as stored", () => {
    expect(formatTransactionUnitPriceForDisplay("buy", "10.5")).toBe(
      formatUnitPriceForDisplay("-10.5"),
    );
    expect(formatTransactionUnitPriceForDisplay("sell", "10.5")).toBe(
      formatUnitPriceForDisplay("10.5"),
    );
  });

  it("returns trimmed input when not a finite number", () => {
    expect(formatTransactionUnitPriceForDisplay("buy", "  x  ")).toBe("x");
  });
});

describe("formatTransactionTotalValueForDisplay", () => {
  it("uses signed notional for non-cash (buy outflow, sell inflow)", () => {
    expect(
      formatTransactionTotalValueForDisplay("buy", "10", "5.5", "EUR"),
    ).toBe(`${formatUnitPriceForDisplay("-55")} EUR`);
    expect(
      formatTransactionTotalValueForDisplay("sell", "10", "5.5", "EUR"),
    ).toBe(`${formatUnitPriceForDisplay("55")} EUR`);
  });

  it("uses unsigned sum for cash_account", () => {
    expect(
      formatTransactionTotalValueForDisplay(
        "sell",
        "100",
        "1",
        "USD",
        "cash_account",
      ),
    ).toBe(`${formatUnitPriceForDisplay("100")} USD`);
  });

  it("returns em dash when notional is not finite", () => {
    expect(formatTransactionTotalValueForDisplay("buy", "x", "1", "EUR")).toBe(
      "-",
    );
  });
});

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

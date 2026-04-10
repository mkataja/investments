import { describe, expect, it } from "vitest";
import { APP_LOCALE } from "./locale";
import {
  QUANTITY_NEAR_INTEGER_EPSILON,
  formatPercentageValueForDisplay,
  formatQuantityForDisplay,
  formatToPercentage,
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
} from "./numberFormat";

function formatPercentIntl(v: number, fractionDigits: number): string {
  return new Intl.NumberFormat(APP_LOCALE, {
    style: "percent",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(v);
}

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

describe("formatQuantityForDisplay", () => {
  it("formats as an integer when within eps of a whole number", () => {
    expect(formatQuantityForDisplay("10")).toBe("10");
    expect(formatQuantityForDisplay("3")).toBe("3");
    expect(formatQuantityForDisplay("10.00001")).toBe("10");
    expect(
      formatQuantityForDisplay(String(10 + QUANTITY_NEAR_INTEGER_EPSILON)),
    ).toBe("10");
  });

  it("keeps fraction digits just outside the integer tolerance", () => {
    expect(formatQuantityForDisplay("10.000015")).toBe(
      formatUnitPriceForDisplay("10.000015"),
    );
  });

  it("keeps fraction digits when not near a whole number", () => {
    expect(formatQuantityForDisplay("12.3456")).toBe(
      formatUnitPriceForDisplay("12.3456"),
    );
    expect(formatQuantityForDisplay("10.7")).toBe(
      formatUnitPriceForDisplay("10.7"),
    );
    expect(formatQuantityForDisplay("0.25")).toBe(
      formatUnitPriceForDisplay("0.25"),
    );
  });

  it("returns trimmed input when not a finite number", () => {
    expect(formatQuantityForDisplay("  n/a  ")).toBe("n/a");
  });
});

describe("formatToPercentage", () => {
  it("adds one fraction digit when the magnitude would round to zero but the value is not near zero", () => {
    expect(formatToPercentage(0.03 / 100)).toBe(
      formatPercentIntl(0.03 / 100, 2),
    );
    expect(formatPercentageValueForDisplay(0.03)).toBe(
      formatPercentIntl(0.03 / 100, 2),
    );
  });

  it("keeps one fraction digit when the value already formats to 0.1% or more", () => {
    expect(formatToPercentage(0.05 / 100)).toBe(
      formatPercentIntl(0.05 / 100, 1),
    );
    expect(formatPercentageValueForDisplay(0.1)).toBe(
      formatPercentIntl(0.001, 1),
    );
  });

  it("formats within QUANTITY_NEAR_INTEGER_EPS of zero as a plain percent zero", () => {
    const half = QUANTITY_NEAR_INTEGER_EPSILON / 2;
    expect(formatPercentageValueForDisplay(half)).toBe(formatPercentIntl(0, 0));
    expect(formatToPercentage(0)).toBe(formatPercentIntl(0, 0));
  });

  it("extends negative values when the magnitude still rounds to zero", () => {
    expect(formatPercentageValueForDisplay(-0.04)).toBe(
      formatPercentIntl(-0.0004, 2),
    );
  });
});

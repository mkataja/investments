import { describe, expect, it } from "vitest";
import { APP_LOCALE } from "./locale";
import {
  QUANTITY_NEAR_INTEGER_EPS,
  formatQuantityForDisplay,
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
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

describe("formatQuantityForDisplay", () => {
  it("formats as an integer when within eps of a whole number", () => {
    expect(formatQuantityForDisplay("10")).toBe("10");
    expect(formatQuantityForDisplay("3")).toBe("3");
    expect(formatQuantityForDisplay("10.00001")).toBe("10");
    expect(
      formatQuantityForDisplay(String(10 + QUANTITY_NEAR_INTEGER_EPS)),
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

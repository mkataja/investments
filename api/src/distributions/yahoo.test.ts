import { describe, expect, it } from "vitest";
import {
  extractYahooPriceFromQuoteSummaryRaw,
  yahooPriceTypeFromMarketState,
} from "./yahoo.js";

describe("yahooPriceTypeFromMarketState", () => {
  it("treats REGULAR as intraday", () => {
    expect(yahooPriceTypeFromMarketState("REGULAR")).toBe("intraday");
    expect(yahooPriceTypeFromMarketState("regular")).toBe("intraday");
    expect(yahooPriceTypeFromMarketState(" Regular ")).toBe("intraday");
  });

  it("treats other states and missing as close", () => {
    expect(yahooPriceTypeFromMarketState("CLOSED")).toBe("close");
    expect(yahooPriceTypeFromMarketState("PRE")).toBe("close");
    expect(yahooPriceTypeFromMarketState("POST")).toBe("close");
    expect(yahooPriceTypeFromMarketState(undefined)).toBe("close");
    expect(yahooPriceTypeFromMarketState(null)).toBe("close");
    expect(yahooPriceTypeFromMarketState(1)).toBe("close");
  });
});

describe("extractYahooPriceFromQuoteSummaryRaw", () => {
  it("returns priceType from marketState", () => {
    const out = extractYahooPriceFromQuoteSummaryRaw({
      price: {
        regularMarketPrice: 100,
        currency: "USD",
        marketState: "REGULAR",
      },
    } as never);
    expect(out).toEqual({
      price: 100,
      currency: "USD",
      priceType: "intraday",
    });
  });

  it("defaults to close when marketState is absent", () => {
    const out = extractYahooPriceFromQuoteSummaryRaw({
      price: {
        regularMarketPrice: 50.25,
        currency: "EUR",
      },
    } as never);
    expect(out?.priceType).toBe("close");
  });
});

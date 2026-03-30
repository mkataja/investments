import { mapYahooSectorToCanonicalId } from "@investments/db";
import { describe, expect, it } from "vitest";

describe("mapYahooSectorToCanonicalId", () => {
  it("maps common GICS-style labels", () => {
    expect(mapYahooSectorToCanonicalId("Technology")).toBe("technology");
    expect(mapYahooSectorToCanonicalId("Financial Services")).toBe(
      "financials",
    );
    expect(mapYahooSectorToCanonicalId("Consumer Cyclical")).toBe(
      "consumer_cyclical",
    );
  });

  it("maps unknown to other", () => {
    expect(mapYahooSectorToCanonicalId("")).toBe("other");
    expect(mapYahooSectorToCanonicalId("Weird Sector XYZ")).toBe("other");
  });

  it("maps cash-like labels to cash", () => {
    expect(mapYahooSectorToCanonicalId("Cash")).toBe("cash");
    expect(mapYahooSectorToCanonicalId("Money Market")).toBe("cash");
  });
});

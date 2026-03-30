import { describe, expect, it } from "vitest";
import { mapSectorLabelToCanonicalId } from "./sectorMapping.js";

describe("mapSectorLabelToCanonicalId", () => {
  it("maps common GICS-style labels", () => {
    expect(mapSectorLabelToCanonicalId("Technology")).toBe("technology");
    expect(mapSectorLabelToCanonicalId("Financial Services")).toBe(
      "financials",
    );
    expect(mapSectorLabelToCanonicalId("Consumer Cyclical")).toBe(
      "consumer_cyclical",
    );
  });

  it("maps unknown to other", () => {
    expect(mapSectorLabelToCanonicalId("")).toBe("other");
    expect(mapSectorLabelToCanonicalId("Weird Sector XYZ")).toBe("other");
  });

  it("maps cash-like labels to cash", () => {
    expect(mapSectorLabelToCanonicalId("Cash")).toBe("cash");
    expect(mapSectorLabelToCanonicalId("Money Market")).toBe("cash");
  });
});

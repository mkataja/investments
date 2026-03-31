import { aggregateRegionsToGeoBuckets } from "@investments/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sectorRefreshStorage } from "../lib/sectorRefreshContext.js";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";

describe("normalizeRegionWeightsToIsoKeys", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not warn for Unassigned or European Union", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = normalizeRegionWeightsToIsoKeys({
      Unassigned: 0.1,
      "European Union": 0.2,
      Germany: 0.7,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(out.DE).toBeCloseTo(0.7, 6);
    expect(out.Unassigned).toBeCloseTo(0.1, 6);
    expect(out["European Union"]).toBeCloseTo(0.2, 6);
  });
});

describe("aggregateRegionsToGeoBuckets (European Union)", () => {
  it("maps European Union label to europe bucket", () => {
    const r = aggregateRegionsToGeoBuckets({ "European Union": 1 });
    expect(r.europe).toBeCloseTo(1, 6);
    expect(r.unknown).toBe(0);
  });
});

describe("mapSectorLabelToCanonicalIdWithWarn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not warn for Unassigned", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapSectorLabelToCanonicalIdWithWarn("Unassigned")).toBe("other");
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not warn for Other", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapSectorLabelToCanonicalIdWithWarn("Other")).toBe("other");
    expect(warn).not.toHaveBeenCalled();
  });

  it("includes instrument context when sector refresh AsyncLocalStorage is set", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sectorRefreshStorage.run(
      { instrumentId: 42, displayName: "Test ETF" },
      () => {
        mapSectorLabelToCanonicalIdWithWarn("Weird Sector XYZ");
      },
    );
    expect(warn).toHaveBeenCalledWith(
      `[refresh-distribution] Instrument id=42 (Test ETF) could not map sector label to known sector: ${JSON.stringify("Weird Sector XYZ")}`,
    );
  });
});

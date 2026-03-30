import { describe, expect, it, vi } from "vitest";
import type { InstrumentRow } from "../lib/valuation.js";
import { resolveDegiroInstrumentIds } from "./degiroResolveInstruments.js";
import * as openFigi from "./openFigi.js";

vi.mock("./openFigi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openFigi.js")>();
  return {
    ...actual,
    fetchOpenFigiMapping: vi.fn(),
  };
});

const fetchOpenFigiMapping = vi.mocked(openFigi.fetchOpenFigiMapping);

describe("resolveDegiroInstrumentIds", () => {
  it("uses database ISIN when unique", async () => {
    fetchOpenFigiMapping.mockReset();
    const inst: InstrumentRow[] = [
      {
        id: 1,
        kind: "etf",
        displayName: "Test",
        yahooSymbol: "SXR8.DE",
        isin: "IE00B5BMR087",
        seligsonFundId: null,
        brokerId: null,
        cashGeoKey: null,
        cashCurrency: null,
        cashInterestType: null,
        holdingsDistributionUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const r = await resolveDegiroInstrumentIds(["IE00B5BMR087"], inst);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.instrumentIdByIsin.get("IE00B5BMR087")).toBe(1);
    expect(fetchOpenFigiMapping).not.toHaveBeenCalled();
  });

  it("matches OpenFIGI Yahoo candidates when ISIN is missing in DB", async () => {
    fetchOpenFigiMapping.mockReset();
    fetchOpenFigiMapping.mockResolvedValueOnce([
      { ticker: "SXR8", exchCode: "GR" },
    ]);
    const inst: InstrumentRow[] = [
      {
        id: 2,
        kind: "etf",
        displayName: "Core S&P 500",
        yahooSymbol: "SXR8.DE",
        isin: null,
        seligsonFundId: null,
        brokerId: null,
        cashGeoKey: null,
        cashCurrency: null,
        cashInterestType: null,
        holdingsDistributionUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const r = await resolveDegiroInstrumentIds(["IE00B5BMR087"], inst);
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.instrumentIdByIsin.get("IE00B5BMR087")).toBe(2);
    expect(fetchOpenFigiMapping).toHaveBeenCalledWith("IE00B5BMR087");
  });
});

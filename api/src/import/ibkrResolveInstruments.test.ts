import { describe, expect, it } from "vitest";
import type { InstrumentRow } from "../lib/valuation.js";
import { resolveIbkrInstrumentRows } from "./ibkrResolveInstruments.js";

function row(
  id: number,
  kind: "etf" | "stock",
  yahooSymbol: string | null,
  isin: string | null,
): InstrumentRow {
  return {
    id,
    kind,
    displayName: `x${id}`,
    yahooSymbol,
    isin,
    seligsonFundId: null,
    brokerId: null,
    cashGeoKey: null,
    cashCurrency: null,
    cashInterestType: null,
    holdingsDistributionUrl: null,
    providerBreakdownDataUrl: null,
    commoditySector: null,
    commodityCountryIso: null,
    fxForeignCurrency: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("resolveIbkrInstrumentRows", () => {
  it("prefers ISIN over Yahoo symbol when both match", () => {
    const instRows = [
      row(1, "etf", "SPYI", "IE00B3YLTY66"),
      row(2, "etf", "SPYI", "IE00OTHER"),
    ];
    const r = resolveIbkrInstrumentRows(
      [{ symbolRaw: "SPYI", isin: "IE00B3YLTY66" }],
      instRows,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.instrumentIds).toEqual([1]);
  });

  it("falls back to Yahoo symbol when ISIN is absent", () => {
    const instRows = [row(1, "stock", "BRK-B", null)];
    const r = resolveIbkrInstrumentRows(
      [{ symbolRaw: "BRK B", isin: null }],
      instRows,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.instrumentIds).toEqual([1]);
  });

  it("falls back to Yahoo when CSV ISIN is not in the database", () => {
    const instRows = [row(1, "etf", "SPYI", "IE00OTHER")];
    const r = resolveIbkrInstrumentRows(
      [{ symbolRaw: "SPYI", isin: "IE00B3YLTY66" }],
      instRows,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.instrumentIds).toEqual([1]);
  });

  it("matches IBKR short symbol to Yahoo listing with exchange suffix", () => {
    const instRows = [row(1, "etf", "SPYI.DE", "IE00B3YLTY66")];
    const r = resolveIbkrInstrumentRows(
      [{ symbolRaw: "SPYI", isin: null }],
      instRows,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.instrumentIds).toEqual([1]);
  });

  it("reports ambiguous ISIN", () => {
    const instRows = [
      row(1, "etf", "A", "IE00B3YLTY66"),
      row(2, "etf", "B", "IE00B3YLTY66"),
    ];
    const r = resolveIbkrInstrumentRows(
      [{ symbolRaw: "SPYI", isin: "IE00B3YLTY66" }],
      instRows,
    );
    expect(r.ok).toBe(false);
    if (r.ok) {
      return;
    }
    expect(r.ambiguousIsins).toContain("IE00B3YLTY66");
  });
});

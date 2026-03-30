import type { InstrumentRow } from "./valuation.js";
import { isBondLikeFromYahooQuoteSummaryRaw } from "./yahooAssetClass.js";

function isBondLikeSeligsonName(
  displayName: string,
  fundName: string | null,
): boolean {
  const t = `${displayName}\n${fundName ?? ""}`.toLowerCase();
  return (
    /\b(bond|obligaatio|laina|korkosijoitus|fixed income|treasury|government)\b/.test(
      t,
    ) || /\b(valtion|govt|high yield|hybrid)\b/.test(t)
  );
}

/**
 * Value-weighted split for portfolio asset-mix: bond ETFs/funds vs equities.
 * Defaults to equity when classification data is missing.
 */
export function classifyNonCashInstrument(
  inst: InstrumentRow,
  yahooRaw: unknown | null,
  seligsonFundName: string | null,
): "equity" | "bond" {
  if (inst.kind === "etf" || inst.kind === "stock") {
    if (yahooRaw != null && isBondLikeFromYahooQuoteSummaryRaw(yahooRaw)) {
      return "bond";
    }
    return "equity";
  }
  if (inst.kind === "custom") {
    if (isBondLikeSeligsonName(inst.displayName, seligsonFundName)) {
      return "bond";
    }
    return "equity";
  }
  return "equity";
}

import type { BenchmarkWeightFormRow } from "../lib/portfolioBenchmarkWeights";

export function buildCreatePortfolioBody(args: {
  name: string;
  kind: "live" | "benchmark";
  emergencyFundEur: number;
  benchmarkTotalEur?: number;
}): Record<string, unknown> {
  return {
    name: args.name,
    kind: args.kind,
    emergencyFundEur: args.emergencyFundEur,
    ...(args.benchmarkTotalEur != null
      ? { benchmarkTotalEur: args.benchmarkTotalEur }
      : {}),
  };
}

export function buildPatchPortfolioBody(args: {
  name: string;
  emergencyFundEur: number;
  benchmarkTotalEur?: number;
}): Record<string, unknown> {
  return {
    name: args.name,
    emergencyFundEur: args.emergencyFundEur,
    ...(args.benchmarkTotalEur != null
      ? { benchmarkTotalEur: args.benchmarkTotalEur }
      : {}),
  };
}

/**
 * Turns form rows into the payload for PUT benchmark weights. Skips blank
 * instrument lines and non-positive weights; parses localized decimals; rejects
 * duplicate instruments so the API never gets ambiguous rows.
 */
export function normalizeWeightRowsForApi(
  rows: BenchmarkWeightFormRow[],
): Array<{ instrumentId: number; weight: number }> {
  const out: Array<{ instrumentId: number; weight: number }> = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (r.instrumentId === "") {
      continue;
    }
    const w = Number.parseFloat(r.weightStr.trim().replace(",", "."));
    if (!Number.isFinite(w) || w <= 0) {
      continue;
    }
    if (seen.has(r.instrumentId)) {
      throw new Error("Each instrument can only appear once.");
    }
    seen.add(r.instrumentId);
    out.push({ instrumentId: r.instrumentId, weight: w });
  }
  return out;
}

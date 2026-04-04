import type { BenchmarkWeightFormRow } from "../pages/home/types";

export function buildCreatePortfolioBody(args: {
  name: string;
  kind: "live" | "static" | "backtest";
  emergencyFundEur: number;
  benchmarkTotalEur?: number;
  simulationStartDate?: string;
}): Record<string, unknown> {
  return {
    name: args.name,
    kind: args.kind,
    emergencyFundEur: args.emergencyFundEur,
    ...(args.benchmarkTotalEur != null
      ? { benchmarkTotalEur: args.benchmarkTotalEur }
      : {}),
    ...(args.simulationStartDate != null
      ? { simulationStartDate: args.simulationStartDate }
      : {}),
  };
}

export function buildPatchPortfolioBody(args: {
  name: string;
  emergencyFundEur: number;
  benchmarkTotalEur?: number;
  simulationStartDate?: string;
  kind?: "live" | "static" | "backtest";
}): Record<string, unknown> {
  return {
    name: args.name,
    emergencyFundEur: args.emergencyFundEur,
    ...(args.kind != null ? { kind: args.kind } : {}),
    ...(args.benchmarkTotalEur != null
      ? { benchmarkTotalEur: args.benchmarkTotalEur }
      : {}),
    ...(args.simulationStartDate != null
      ? { simulationStartDate: args.simulationStartDate }
      : {}),
  };
}

export function buildCreateBacktestPortfolioBody(args: {
  name: string;
  emergencyFundEur: number;
  benchmarkTotalEur: number;
  simulationStartDate: string;
  weights: Array<{ instrumentId: number; weight: number }>;
}): Record<string, unknown> {
  return {
    name: args.name,
    emergencyFundEur: args.emergencyFundEur,
    benchmarkTotalEur: args.benchmarkTotalEur,
    simulationStartDate: args.simulationStartDate,
    weights: args.weights,
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

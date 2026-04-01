import { instruments, portfolioBenchmarkWeights } from "@investments/db";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db.js";
import type { InstrumentRow } from "./valuation.js";

/** Fallback when DB value is missing or invalid (must match schema default). */
export const BENCHMARK_TOTAL_EUR_DEFAULT = 10000;

/** @internal Positive weights → fractions summing to 1; null if sum is negligible. */
export function normalizeRawBenchmarkWeights(
  rawPositive: number[],
): number[] | null {
  const sum = rawPositive.reduce((a, b) => a + b, 0);
  if (sum < MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    return null;
  }
  return rawPositive.map((w) => w / sum);
}

export type ValuedPortfolioRow = {
  inst: InstrumentRow;
  qty: number;
  valueEur: number;
  source: "benchmark";
};

export async function loadBenchmarkValuedRows(
  portfolioId: number,
  totalEurNotional: number,
): Promise<ValuedPortfolioRow[]> {
  const notion =
    Number.isFinite(totalEurNotional) && totalEurNotional > 0
      ? totalEurNotional
      : BENCHMARK_TOTAL_EUR_DEFAULT;
  const wRows = await db
    .select()
    .from(portfolioBenchmarkWeights)
    .where(eq(portfolioBenchmarkWeights.portfolioId, portfolioId))
    .orderBy(asc(portfolioBenchmarkWeights.sortOrder));

  if (wRows.length === 0) {
    return [];
  }

  const instIds = [...new Set(wRows.map((r) => r.instrumentId))];
  const instRows = await db
    .select()
    .from(instruments)
    .where(inArray(instruments.id, instIds));

  const byId = new Map(instRows.map((i) => [i.id, i] as const));

  const parsed: Array<{ inst: InstrumentRow; rawW: number }> = [];
  for (const row of wRows) {
    const w = Number.parseFloat(String(row.weight));
    if (!Number.isFinite(w) || w <= 0) {
      continue;
    }
    const inst = byId.get(row.instrumentId);
    if (!inst) {
      continue;
    }
    parsed.push({ inst, rawW: w });
  }

  const rawList = parsed.map((p) => p.rawW);
  const norm = normalizeRawBenchmarkWeights(rawList);
  if (norm == null) {
    return [];
  }

  const out: ValuedPortfolioRow[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const nw = norm[i];
    if (p === undefined || nw === undefined) {
      continue;
    }
    out.push({
      inst: p.inst,
      qty: nw,
      valueEur: nw * notion,
      source: "benchmark",
    });
  }
  return out;
}

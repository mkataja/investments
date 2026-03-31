import type { DistributionSectorId } from "@investments/db";
import { mapSectorLabelToCanonicalIdWithWarn } from "./distributionNormalize.js";

function parsePercentLike(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return null;
  }
  const a = Math.abs(v);
  return a > 1 ? a / 100 : a;
}

/** Sum / total lines duplicate sector weights and map to `other`; skip them. */
function isJpmSectorBreakdownAggregateRow(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === "total" || n === "grand total";
}

/**
 * Portfolio weight comes from **`value`** (or numeric **`secondaryValueMap`** keys in tests).
 * **`secondaryValue`** is benchmark / comparison only — never used here.
 */
function resolveJpmSectorPortfolioPercent(
  row: Record<string, unknown>,
): number | null {
  const svm = row.secondaryValueMap;
  if (svm != null && typeof svm === "object") {
    const map = svm as Record<string, unknown>;
    const legacy =
      map.PORTFOLIO_MARKET_VALUE_PC ??
      map.BENCHMARK_MARKET_VALUE_PC ??
      map.portfolio_market_value_pc;
    if (typeof legacy === "number" && Number.isFinite(legacy)) {
      return parsePercentLike(legacy);
    }
  }
  return parsePercentLike(row.value);
}

function resolveEmeaSectorBreakdown(
  root: Record<string, unknown>,
): Record<string, unknown> | null {
  const direct = root.emeaSectorBreakdown;
  if (direct != null && typeof direct === "object") {
    return direct as Record<string, unknown>;
  }
  const fundData = root.fundData;
  if (fundData != null && typeof fundData === "object") {
    const nested = (fundData as Record<string, unknown>).emeaSectorBreakdown;
    if (nested != null && typeof nested === "object") {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Sector weights from JPM AM `FundsMarketingHandler/product-data` JSON (`emeaSectorBreakdown.data`).
 * Responses may nest this under `fundData` (current) or at the root (legacy).
 */
export function parseJpmProductDataSectorBreakdown(
  json: unknown,
): Record<DistributionSectorId, number> {
  if (json == null || typeof json !== "object") {
    throw new Error("JPM product-data: invalid root");
  }
  const root = json as Record<string, unknown>;
  const emb = resolveEmeaSectorBreakdown(root);
  if (emb == null) {
    throw new Error("JPM product-data: missing emeaSectorBreakdown");
  }
  const data = emb.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      "JPM product-data: emeaSectorBreakdown.data missing or empty",
    );
  }

  const sectorAgg: Record<string, number> = {};

  for (const row of data) {
    if (row == null || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    if (!name) {
      continue;
    }
    if (isJpmSectorBreakdownAggregateRow(name)) {
      continue;
    }

    const pct = resolveJpmSectorPortfolioPercent(r);
    if (pct == null) {
      continue;
    }

    const sid = mapSectorLabelToCanonicalIdWithWarn(name);
    sectorAgg[sid] = (sectorAgg[sid] ?? 0) + pct;
  }

  if (Object.keys(sectorAgg).length === 0) {
    throw new Error(
      "JPM product-data: no sector weights parsed from emeaSectorBreakdown",
    );
  }

  return sectorAgg as Record<DistributionSectorId, number>;
}

/**
 * Raw `name` fields from `emeaSectorBreakdown.data` (excludes Total / Grand total rows).
 * Used for reporting; sector weights are not applied.
 */
export function extractJpmProductDataRawSectorNames(json: unknown): string[] {
  if (json == null || typeof json !== "object") {
    return [];
  }
  const root = json as Record<string, unknown>;
  const emb = resolveEmeaSectorBreakdown(root);
  if (emb == null) {
    return [];
  }
  const data = emb.data;
  if (!Array.isArray(data)) {
    return [];
  }
  const names: string[] = [];
  for (const row of data) {
    if (row == null || typeof row !== "object") {
      continue;
    }
    const r = row as Record<string, unknown>;
    const name = String(r.name ?? "").trim();
    if (!name) {
      continue;
    }
    if (isJpmSectorBreakdownAggregateRow(name)) {
      continue;
    }
    names.push(name);
  }
  return names;
}

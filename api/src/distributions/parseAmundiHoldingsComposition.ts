import type { DistributionPayload } from "@investments/lib/distributionPayload";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import type {
  AmundiCompositionApiRow,
  AmundiGetProductsDataResponse,
} from "./fetchAmundiHoldingsComposition.js";
import { isCashAssetLabel } from "./providerHoldingsCash.js";

function rowWeight(row: AmundiCompositionApiRow): number | null {
  let w: number | null = null;
  if (typeof row.weight === "number" && Number.isFinite(row.weight)) {
    w = row.weight;
  } else if (
    typeof row.compositionCharacteristics?.weight === "number" &&
    Number.isFinite(row.compositionCharacteristics.weight)
  ) {
    w = row.compositionCharacteristics.weight;
  }
  if (w == null || !(w > 0)) {
    return null;
  }
  return w > 1 ? w / 100 : w;
}

function isAmundiCashRow(row: AmundiCompositionApiRow): boolean {
  const t = row.compositionCharacteristics?.type?.trim().toUpperCase() ?? "";
  if (t.includes("CASH") || t.includes("MONEY_MARKET")) {
    return true;
  }
  const name = row.compositionCharacteristics?.name?.trim() ?? "";
  return isCashAssetLabel(name) || isCashAssetLabel(t);
}

/**
 * Aggregates Amundi `composition.compositionData` into country and sector weights.
 */
export function parseAmundiHoldingsCompositionJson(
  api: AmundiGetProductsDataResponse,
): DistributionPayload {
  const rows = api.products?.[0]?.composition?.compositionData ?? [];
  const countryAgg: Record<string, number> = {};
  const sectorAgg: Record<string, number> = {};

  for (const row of rows) {
    const pct = rowWeight(row);
    if (pct == null) {
      continue;
    }
    if (isAmundiCashRow(row)) {
      sectorAgg.cash = (sectorAgg.cash ?? 0) + pct;
      continue;
    }
    const geo =
      row.compositionCharacteristics?.countryOfRisk?.trim() ||
      row.compositionCharacteristics?.country?.trim() ||
      "";
    if (geo) {
      countryAgg[geo] = (countryAgg[geo] ?? 0) + pct;
    }
    const sectorLabel = row.compositionCharacteristics?.sector?.trim() ?? "";
    if (sectorLabel) {
      const sid = mapSectorLabelToCanonicalIdWithWarn(sectorLabel);
      sectorAgg[sid] = (sectorAgg[sid] ?? 0) + pct;
    }
  }

  return {
    countries: normalizeRegionWeightsToIsoKeys(countryAgg),
    sectors: sectorAgg,
  };
}

/** Sector labels from cached JSON (for `reportRawSectorsBySource`). */
export function extractAmundiRawSectorLabels(rawJson: string): string[] {
  let api: AmundiGetProductsDataResponse;
  try {
    api = JSON.parse(rawJson) as AmundiGetProductsDataResponse;
  } catch {
    return [];
  }
  const rows = api.products?.[0]?.composition?.compositionData ?? [];
  const out: string[] = [];
  for (const row of rows) {
    const s = row.compositionCharacteristics?.sector?.trim();
    if (s) {
      out.push(s);
    }
  }
  return out;
}

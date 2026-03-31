import type { DistributionPayload } from "@investments/db";
import {
  mapSectorLabelToCanonicalIdWithWarn,
  normalizeRegionWeightsToIsoKeys,
} from "./distributionNormalize.js";
import type { VanguardGpxHoldingItem } from "./fetchVanguardUkGpxHoldings.js";
import { isCashAssetLabel } from "./providerHoldingsCash.js";

function vanguardRowIsCash(item: VanguardGpxHoldingItem): boolean {
  const st = (item.securityType ?? "").trim();
  if (st.startsWith("MM.")) {
    return true;
  }
  if (isCashAssetLabel(st)) {
    return true;
  }
  const gics = (item.gicsSectorDescription ?? "").trim();
  if (isCashAssetLabel(gics)) {
    return true;
  }
  const name = (item.issuerName ?? "").trim();
  if (isCashAssetLabel(name)) {
    return true;
  }
  const desc = (item.securityLongDescription ?? "").trim();
  if (isCashAssetLabel(desc)) {
    return true;
  }
  return false;
}

function sectorLabelForRow(item: VanguardGpxHoldingItem): string {
  const g = (item.gicsSectorDescription ?? "").trim();
  if (g) {
    return g;
  }
  const icb = (item.icbSectorDescription ?? "").trim();
  if (icb) {
    return icb;
  }
  return (item.icbIndustryDescription ?? "").trim();
}

/**
 * Aggregates Vanguard GPX `borHoldings.holdings.items` into country/sector weights (fractions, sum ~1).
 */
export function parseVanguardUkGpxHoldingsJson(
  items: VanguardGpxHoldingItem[],
): DistributionPayload {
  const countryAgg: Record<string, number> = {};
  const sectorAgg: Record<string, number> = {};

  for (const item of items) {
    const pctRaw = item.marketValuePercentage;
    if (pctRaw == null || !Number.isFinite(pctRaw)) {
      continue;
    }
    const w = pctRaw / 100;
    if (!(w > 0)) {
      continue;
    }

    if (vanguardRowIsCash(item)) {
      sectorAgg.cash = (sectorAgg.cash ?? 0) + w;
      continue;
    }

    const iso = (item.bloombergIsoCountry ?? "").trim();
    if (iso) {
      countryAgg[iso] = (countryAgg[iso] ?? 0) + w;
    }

    const sectorLabel = sectorLabelForRow(item);
    if (sectorLabel) {
      const sid = mapSectorLabelToCanonicalIdWithWarn(sectorLabel);
      sectorAgg[sid] = (sectorAgg[sid] ?? 0) + w;
    }
  }

  return {
    countries: normalizeRegionWeightsToIsoKeys(countryAgg),
    sectors: sectorAgg,
  };
}

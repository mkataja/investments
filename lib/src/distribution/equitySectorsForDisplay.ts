import { COMMODITY_DISTRIBUTION_SECTOR_IDS } from "../commodity.js";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "../minPortfolioAllocationFraction.js";

/** Sector keys that describe bond sleeve mix (not equity sectors). */
const BOND_DISTRIBUTION_SECTOR_IDS = [
  "long_government_bonds",
  "long_corporate_bonds",
  "short_bonds",
  "ultrashort_bonds",
] as const;

function isBondDistributionSectorId(id: string): boolean {
  return (BOND_DISTRIBUTION_SECTOR_IDS as readonly string[]).includes(id);
}

function isCommodityDistributionSectorId(id: string): boolean {
  return (COMMODITY_DISTRIBUTION_SECTOR_IDS as readonly string[]).includes(id);
}

/**
 * Strips bond and commodity sector keys and renormalizes remaining weights to sum to 1.
 * Empty object if nothing remains.
 */
export function equitySectorsForDisplay(
  sectors: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sectors)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      continue;
    }
    if (isBondDistributionSectorId(k) || isCommodityDistributionSectorId(k)) {
      continue;
    }
    out[k] = v;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum < MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    return {};
  }
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v !== undefined) {
      out[k] = v / sum;
    }
  }
  return out;
}

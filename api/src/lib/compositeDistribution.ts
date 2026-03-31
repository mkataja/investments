import type { DistributionPayload } from "@investments/db";
import { roundWeights } from "../distributions/roundWeights.js";
import { distributionGeoScaleForCountryMerge } from "./distributionGeoScale.js";

const PORTFOLIO_UNKNOWN_COUNTRY = "__portfolio_unknown__";
const PORTFOLIO_UNKNOWN_SECTOR = "__portfolio_unknown__";

function mergeWeighted(
  acc: Record<string, number>,
  weights: Record<string, number>,
  w: number,
): void {
  for (const [k, v] of Object.entries(weights)) {
    acc[k] = (acc[k] ?? 0) + w * v;
  }
}

/**
 * Merge constituent distributions the same way as `getPortfolioDistributions` merges positions
 * for **countries** (unknown geo mass, bond geo scale). **Sectors** are a value-weighted merge of
 * each child’s full `sectors` map (including `cash` when present); pseudo slices have no sectors
 * and contribute unknown sector mass.
 */
export function mergeCompositeDistributionPayload(
  items: Array<{ weight: number; payload: DistributionPayload | null }>,
): DistributionPayload {
  const countryWeights: Record<string, number> = {};
  let missingCountryW = 0;
  const sectors: Record<string, number> = {};
  let missingSectorW = 0;

  for (const { weight: w, payload } of items) {
    const p = payload ?? { countries: {}, sectors: {} };

    const cashFracRaw =
      p.sectors && typeof p.sectors.cash === "number" ? p.sectors.cash : 0;
    const cashFrac = Math.min(1, Math.max(0, cashFracRaw));
    const geoScale = distributionGeoScaleForCountryMerge(p, cashFrac);

    if (p.countries && Object.keys(p.countries).length > 0) {
      mergeWeighted(countryWeights, p.countries, w * geoScale);
    } else {
      missingCountryW += w * geoScale;
    }

    if (p.sectors && Object.keys(p.sectors).length > 0) {
      mergeWeighted(sectors, p.sectors, w);
    } else {
      missingSectorW += w;
    }
  }

  if (missingCountryW > 0) {
    countryWeights[PORTFOLIO_UNKNOWN_COUNTRY] = missingCountryW;
  }

  const sectorMassRaw =
    Object.values(sectors).reduce((a, b) => a + b, 0) + missingSectorW;
  if (sectorMassRaw > 1e-12) {
    for (const k of Object.keys(sectors)) {
      const v = sectors[k];
      if (v !== undefined) {
        sectors[k] = v / sectorMassRaw;
      }
    }
    missingSectorW /= sectorMassRaw;
  }
  if (missingSectorW > 0) {
    sectors[PORTFOLIO_UNKNOWN_SECTOR] = missingSectorW;
  }

  return {
    countries: roundWeights(countryWeights),
    sectors: roundWeights(sectors),
  };
}

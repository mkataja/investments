import type { DistributionPayload } from "@investments/lib/distributionPayload";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";

/**
 * Scale factor for merging `payload.countries` into portfolio weights.
 * Seligson bond view=20 rows describe long bonds only; scale by long govt + long corp NAV fractions.
 * Otherwise use non-cash principal (`1 - cash`).
 */
export function distributionGeoScaleForCountryMerge(
  payload: DistributionPayload | undefined,
  cashFrac: number,
): number {
  const sec = payload?.sectors;
  const longGovt =
    sec && typeof sec.long_government_bonds === "number"
      ? sec.long_government_bonds
      : 0;
  const longCorp =
    sec && typeof sec.long_corporate_bonds === "number"
      ? sec.long_corporate_bonds
      : 0;
  const longBondFrac = longGovt + longCorp;
  if (longBondFrac >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    return longBondFrac;
  }
  return 1 - cashFrac;
}

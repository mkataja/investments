/**
 * Allowed keys for `distributions.payload.sectors` (JSONB). Everything else
 * (label heuristics, display strings) lives in `api` / `web`.
 */

export const DISTRIBUTION_SECTOR_IDS = [
  "technology",
  "healthcare",
  "financials",
  "consumer_cyclical",
  "consumer_defensive",
  "industrials",
  "energy",
  "materials",
  "real_estate",
  "utilities",
  "communication_services",
  "other",
  "cash",
  "long_government_bonds",
  "long_corporate_bonds",
  "short_bonds",
] as const;

export type DistributionSectorId = (typeof DISTRIBUTION_SECTOR_IDS)[number];

export function isDistributionSectorId(s: string): s is DistributionSectorId {
  return (DISTRIBUTION_SECTOR_IDS as readonly string[]).includes(s);
}

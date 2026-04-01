import type { DistributionSectorId } from "./distribution/sectorIds.js";
import type { DistributionPayload } from "./distributionPayload.js";

/** Stored in `instruments.commodity_sector` for `kind = commodity`. */
export const COMMODITY_SECTOR_STORAGE = ["gold", "silver", "other"] as const;

export type CommoditySectorStorage = (typeof COMMODITY_SECTOR_STORAGE)[number];

const STORAGE_TO_DISTRIBUTION_SECTOR: Record<
  CommoditySectorStorage,
  DistributionSectorId
> = {
  gold: "commodity_gold",
  silver: "commodity_silver",
  other: "commodity_other",
};

/** Keys on merged portfolio `sectors` for direct commodities (excluded from equity sector chart). */
export const COMMODITY_DISTRIBUTION_SECTOR_IDS: readonly DistributionSectorId[] =
  [
    STORAGE_TO_DISTRIBUTION_SECTOR.gold,
    STORAGE_TO_DISTRIBUTION_SECTOR.silver,
    STORAGE_TO_DISTRIBUTION_SECTOR.other,
  ];

export function commodityStorageToDistributionSectorId(
  sector: CommoditySectorStorage,
): DistributionSectorId {
  return STORAGE_TO_DISTRIBUTION_SECTOR[sector];
}

/**
 * Manual sleeve + optional vault/storage country (ISO uppercase). Empty country → unknown geo merge.
 */
export function buildCommodityDistributionPayload(
  sector: CommoditySectorStorage,
  countryIsoUppercaseOrNull: string | null,
): DistributionPayload {
  const sid = commodityStorageToDistributionSectorId(sector);
  const countries: Record<string, number> = {};
  if (
    countryIsoUppercaseOrNull != null &&
    countryIsoUppercaseOrNull.length === 2
  ) {
    countries[countryIsoUppercaseOrNull] = 1;
  }
  return {
    sectors: { [sid]: 1 },
    countries,
  };
}

/**
 * Shape of `distributions.payload` JSON (ISO country keys, canonical sector ids).
 */
export type DistributionPayload = {
  /** Uppercase ISO 3166-1 alpha-2 country codes → weights (0–1). */
  countries: Record<string, number>;
  /** Canonical sector ids (`distribution/sectorIds.ts`) → weights (0–1). */
  sectors: Record<string, number>;
};

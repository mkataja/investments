import type { DistributionPayload } from "./distributionPayload.js";

/**
 * Synthetic allocation targets for composite instruments (not real `instruments` rows).
 * Geography is merged as unknown when absent; sector for pseudo rows comes from
 * `compositePseudoKeyToSyntheticPayload`.
 */
export const COMPOSITE_PSEUDO_KEYS = [
  "other_equities",
  "other_long_government_bonds",
  "other_long_corporate_bonds",
  "other_short_government_bonds",
  "other_short_corporate_bonds",
  "other_ultrashort_bonds",
  "cash",
] as const;

export type CompositePseudoKey = (typeof COMPOSITE_PSEUDO_KEYS)[number];

export function isCompositePseudoKey(s: string): s is CompositePseudoKey {
  return (COMPOSITE_PSEUDO_KEYS as readonly string[]).includes(s);
}

const PSEUDO_SYNTHETIC_SECTORS: Record<
  CompositePseudoKey,
  Record<string, number>
> = {
  other_equities: { other: 1 },
  other_long_government_bonds: { long_government_bonds: 1 },
  other_long_corporate_bonds: { long_corporate_bonds: 1 },
  other_short_government_bonds: { short_bonds: 1 },
  other_short_corporate_bonds: { short_bonds: 1 },
  other_ultrashort_bonds: { ultrashort_bonds: 1 },
  cash: { cash: 1 },
};

/** Sector weights for a pseudo constituent (empty countries → unknown geo at portfolio merge). */
export function compositePseudoKeyToSyntheticPayload(
  key: CompositePseudoKey,
): DistributionPayload {
  return {
    countries: {},
    sectors: PSEUDO_SYNTHETIC_SECTORS[key],
  };
}

/**
 * Synthetic allocation targets for composite instruments (not real `instruments` rows).
 * Unknown sector and geographic distribution at merge time.
 */
export const COMPOSITE_PSEUDO_KEYS = [
  "other_equities",
  "other_long_government_bonds",
  "other_long_corporate_bonds",
  "other_short_government_bonds",
  "other_short_corporate_bonds",
  "ultrashort_bonds",
  "cash",
] as const;

export type CompositePseudoKey = (typeof COMPOSITE_PSEUDO_KEYS)[number];

export function isCompositePseudoKey(s: string): s is CompositePseudoKey {
  return (COMPOSITE_PSEUDO_KEYS as readonly string[]).includes(s);
}

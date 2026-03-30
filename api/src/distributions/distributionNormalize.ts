import type { DistributionSectorId } from "@investments/db";
import { resolveRegionKeyToIso } from "@investments/db";
import { mapSectorLabelToCanonicalId } from "./sectorMapping.js";

/**
 * Merge weights by ISO 3166-1 alpha-2 where the label resolves; used for
 * Yahoo fund/stock breakdowns and provider holdings (iShares, SSGA, Xtrackers).
 */
export function normalizeRegionWeightsToIsoKeys(
  regions: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, w] of Object.entries(regions)) {
    const iso = resolveRegionKeyToIso(k);
    if (iso) {
      out[iso] = (out[iso] ?? 0) + w;
    } else {
      console.warn(
        `Could not map country/region label to ISO 3166-1 alpha-2: ${JSON.stringify(k)}`,
      );
      out[k] = w;
    }
  }
  return out;
}

const EXPLICIT_OTHER_SECTOR_LABELS = new Set([
  "other",
  "unknown",
  "n/a",
  "na",
  "-",
  "misc",
  "miscellaneous",
  "unclassified",
  "not classified",
]);

/**
 * Same as {@link mapSectorLabelToCanonicalId} with `console.warn` when the label
 * falls through to `other` (excludes empty strings and generic catch-all labels).
 */
export function mapSectorLabelToCanonicalIdWithWarn(
  raw: string,
): DistributionSectorId {
  const id = mapSectorLabelToCanonicalId(raw);
  if (id !== "other") {
    return id;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return id;
  }
  const lower = trimmed.toLowerCase();
  if (EXPLICIT_OTHER_SECTOR_LABELS.has(lower)) {
    return id;
  }
  console.warn(
    `Could not map sector label to canonical sector: ${JSON.stringify(raw)}`,
  );
  return id;
}

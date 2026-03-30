/** Compact display of cached distribution payloads (countries + sectors). */

import {
  DISTRIBUTION_SECTOR_TITLES,
  type DistributionSectorId,
  GEO_BUCKET_ORDER,
  type GeoBucketId,
  aggregateRegionsToGeoBuckets,
  geoBucketDisplayIcon,
} from "@investments/db";

export type GeoBucket = GeoBucketId;

export { aggregateRegionsToGeoBuckets, GEO_BUCKET_ORDER };

/** @deprecated Use aggregateRegionsToGeoBuckets */
export function aggregateRegionsToBuckets(
  countries: Record<string, number>,
): Record<GeoBucket, number> {
  return aggregateRegionsToGeoBuckets(countries);
}

const NBSP = "\u00a0";

/** Whole percent in a fixed 4-column field: value left-aligned, padded on the right (NBSP). */
export function formatPercentWidth4From01(weight01: number): string {
  const s = `${Math.round(weight01 * 100)}%`;
  return s.padEnd(4, NBSP);
}

export type SectorRow = {
  name: string;
  weight: number;
  icon: string;
  pctLabel: string;
};

const sectorTitleCmp = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

function sectorTitleForId(id: string): string {
  const t = DISTRIBUTION_SECTOR_TITLES[id as DistributionSectorId];
  return t ?? id;
}

/** Sectors in fixed alphabetical order by display title (not by weight). */
export function sortedSectorsForDisplay(
  sectors: Record<string, number>,
): SectorRow[] {
  return Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) =>
      sectorTitleCmp(sectorTitleForId(a[0]), sectorTitleForId(b[0])),
    )
    .map(([id, w]) => ({
      name: sectorTitleForId(id),
      weight: w,
      icon: sectorIcon(id),
      pctLabel: formatPercentWidth4From01(w),
    }));
}

/** @deprecated Use `geoBucketDisplayIcon` from `@investments/db` */
export function geoBucketDisplayLabel(bucket: GeoBucket): string {
  return geoBucketDisplayIcon(bucket);
}

export type GeoSegment = { bucket: GeoBucket; pctLabel: string };

const bucketOrderIndex = new Map(
  GEO_BUCKET_ORDER.map((b, i) => [b, i] as const),
);

export function geoSegmentsForDisplay(
  buckets: Record<GeoBucket, number>,
): GeoSegment[] {
  const out: GeoSegment[] = [];
  for (const b of GEO_BUCKET_ORDER) {
    const v = buckets[b];
    if (v > 0.0005) {
      out.push({ bucket: b, pctLabel: formatPercentWidth4From01(v) });
    }
  }
  out.sort((a, b) => {
    const va = buckets[a.bucket];
    const vb = buckets[b.bucket];
    if (vb !== va) return vb - va;
    return (
      (bucketOrderIndex.get(a.bucket) ?? 0) -
      (bucketOrderIndex.get(b.bucket) ?? 0)
    );
  });
  return out;
}

export function formatGeoLine(buckets: Record<GeoBucket, number>): string {
  return geoSegmentsForDisplay(buckets)
    .map((s) => `${geoBucketDisplayIcon(s.bucket)} ${s.pctLabel}`)
    .join(" · ");
}

/** Icons for canonical sector ids (`distribution/sectors.ts`). */
export function sectorIcon(sectorId: string): string {
  switch (sectorId) {
    case "cash":
      return "💵";
    case "technology":
      return "💻";
    case "healthcare":
      return "⚕️";
    case "financials":
      return "🏦";
    case "consumer_cyclical":
      return "🛍️";
    case "consumer_defensive":
      return "🥫";
    case "industrials":
      return "🏭";
    case "energy":
      return "🛢️";
    case "materials":
      return "🧱";
    case "real_estate":
      return "🏢";
    case "utilities":
      return "💡";
    case "communication_services":
      return "📡";
    case "other":
      return "📊";
    default:
      return "📊";
  }
}

export function formatDistributionTooltip(
  countries: Record<string, number>,
  sectors: Record<string, number>,
): string {
  const lines: string[] = [];
  const g = aggregateRegionsToGeoBuckets(countries);
  const geoSegs = geoSegmentsForDisplay(g);
  const geoParts = geoSegs.map(
    (s) => `${s.bucket} ${formatPercentWidth4From01(g[s.bucket])}`,
  );
  if (geoParts.length > 0) {
    lines.push(`Geo: ${geoParts.join(", ")}`);
  }
  const secParts = Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && v > 0.0005)
    .sort((a, b) =>
      sectorTitleCmp(sectorTitleForId(a[0]), sectorTitleForId(b[0])),
    )
    .map(([k, v]) => `${sectorTitleForId(k)} ${formatPercentWidth4From01(v)}`);
  if (secParts.length > 0) {
    lines.push(`Sectors: ${secParts.join(", ")}`);
  }
  return lines.join("\n");
}

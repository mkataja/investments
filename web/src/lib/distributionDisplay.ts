/** Compact display of cached distribution payloads (regions + sectors). */

import {
  GEO_BUCKET_ORDER,
  type GeoBucketId,
  aggregateRegionsToGeoBuckets,
  geoBucketDisplayIcon,
} from "@investments/db";

export type GeoBucket = GeoBucketId;

export { aggregateRegionsToGeoBuckets, GEO_BUCKET_ORDER };

/** @deprecated Use aggregateRegionsToGeoBuckets */
export function aggregateRegionsToBuckets(
  regions: Record<string, number>,
): Record<GeoBucket, number> {
  return aggregateRegionsToGeoBuckets(regions);
}

function formatPct01(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

export type SectorRow = {
  name: string;
  weight: number;
  icon: string;
  pctLabel: string;
};

const sectorNameCmp = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

/** Sectors in fixed alphabetical order by sector name (not by weight). */
export function sortedSectorsForDisplay(
  sectors: Record<string, number>,
): SectorRow[] {
  return Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => sectorNameCmp(a[0], b[0]))
    .map(([name, w]) => ({
      name,
      weight: w,
      icon: sectorIcon(name),
      pctLabel: formatPct01(w),
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
      out.push({ bucket: b, pctLabel: formatPct01(v) });
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

export function sectorIcon(sectorName: string): string {
  const s = sectorName.toLowerCase();
  if (
    s.includes("tech") ||
    s.includes("information technology") ||
    s === "technology"
  ) {
    return "💻";
  }
  if (s.includes("health")) {
    return "⚕️";
  }
  if (s.includes("financial")) {
    return "🏦";
  }
  if (s.includes("consumer")) {
    return "🛒";
  }
  if (s.includes("industrial")) {
    return "🏭";
  }
  if (s.includes("energy")) {
    return "🛢️";
  }
  if (s.includes("material")) {
    return "🧱";
  }
  if (s.includes("real estate") || s.includes("reit")) {
    return "🏢";
  }
  if (s.includes("utilit")) {
    return "💡";
  }
  if (
    s.includes("communication") ||
    s.includes("telecom") ||
    s.includes("media")
  ) {
    return "📡";
  }
  if (s.includes("staple")) {
    return "🥫";
  }
  if (s.includes("discretionary")) {
    return "🛍️";
  }
  return "📊";
}

export function formatDistributionTooltip(
  regions: Record<string, number>,
  sectors: Record<string, number>,
): string {
  const lines: string[] = [];
  const g = aggregateRegionsToGeoBuckets(regions);
  const geoSegs = geoSegmentsForDisplay(g);
  const geoParts = geoSegs.map(
    (s) => `${s.bucket} ${(g[s.bucket] * 100).toFixed(1)}%`,
  );
  if (geoParts.length > 0) {
    lines.push(`Geo: ${geoParts.join(", ")}`);
  }
  const secParts = Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && v > 0.0005)
    .sort((a, b) => sectorNameCmp(a[0], b[0]))
    .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`);
  if (secParts.length > 0) {
    lines.push(`Sectors: ${secParts.join(", ")}`);
  }
  return lines.join("\n");
}

/** Compact display of cached distribution payloads (regions + sectors). */

import {
  GEO_BUCKET_ORDER,
  type GeoBucketId,
  aggregateRegionsToGeoBuckets,
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

/** Sectors sorted by weight descending, for compact UI rows. */
export function sortedSectorsForDisplay(
  sectors: Record<string, number>,
): SectorRow[] {
  return Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, w]) => ({
      name,
      weight: w,
      icon: sectorIcon(name),
      pctLabel: formatPct01(w),
    }));
}

/** Compact label for the geo row */
export function geoBucketDisplayLabel(bucket: GeoBucket): string {
  switch (bucket) {
    case "finland":
      return "🇫🇮";
    case "europe":
      return "🇪🇺";
    case "north_america":
      return "🇺🇸";
    case "asia":
      return "Asia";
    case "china":
      return "🇨🇳";
    case "emerging_markets":
      return "EM";
    case "unknown":
      return "⚠️";
    default:
      return bucket;
  }
}

export type GeoSegment = { bucket: GeoBucket; pctLabel: string };

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
  return out;
}

export function formatGeoLine(buckets: Record<GeoBucket, number>): string {
  return geoSegmentsForDisplay(buckets)
    .map((s) => `${geoBucketDisplayLabel(s.bucket)} ${s.pctLabel}`)
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
  const geoParts: string[] = [];
  const g = aggregateRegionsToGeoBuckets(regions);
  for (const b of GEO_BUCKET_ORDER) {
    const v = g[b];
    if (v > 0.0005) {
      geoParts.push(`${b} ${(v * 100).toFixed(1)}%`);
    }
  }
  if (geoParts.length > 0) {
    lines.push(`Geo: ${geoParts.join(", ")}`);
  }
  const secParts = Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && v > 0.0005)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`);
  if (secParts.length > 0) {
    lines.push(`Sectors: ${secParts.join(", ")}`);
  }
  return lines.join("\n");
}

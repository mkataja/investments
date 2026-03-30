/** Compact display of cached distribution payloads (countries + sectors). */

import {
  DISTRIBUTION_SECTOR_TITLES,
  type DistributionSectorId,
  GEO_BUCKET_ORDER,
  type GeoBucketId,
  aggregateRegionsToGeoBuckets,
  countryIsoToFlagEmoji,
  geoBucketDisplayIcon,
  resolveRegionKeyToIso,
} from "@investments/db";

export type GeoBucket = GeoBucketId;

export { aggregateRegionsToGeoBuckets, GEO_BUCKET_ORDER };

/** Weights merged under this key could not be resolved to ISO (see `resolveRegionKeyToIso`). */
export const UNMAPPED_COUNTRY_KEY = "__unmapped__";

/** @deprecated Use aggregateRegionsToGeoBuckets */
export function aggregateRegionsToBuckets(
  countries: Record<string, number>,
): Record<GeoBucket, number> {
  return aggregateRegionsToGeoBuckets(countries);
}

/**
 * Merge country/label keys into ISO alpha-2 keys; unresolvable weight is summed under
 * `UNMAPPED_COUNTRY_KEY`.
 */
export function normalizeCountryWeightsForDisplay(
  countries: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawKey, w] of Object.entries(countries)) {
    if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
      continue;
    }
    const iso = resolveRegionKeyToIso(rawKey.trim());
    const k = iso ?? UNMAPPED_COUNTRY_KEY;
    out[k] = (out[k] ?? 0) + w;
  }
  return out;
}

export type CountrySegment = {
  key: string;
  label: string;
  icon: string;
  pctLabel: string;
  weight: number;
};

const REST_ICON = "🌍";

/** Top `topN` ISO countries by weight, then one "Other" row for the remainder (if any). */
export function topCountriesSegmentsForDisplay(
  countries: Record<string, number>,
  topN: number,
): CountrySegment[] {
  const norm = normalizeCountryWeightsForDisplay(countries);
  const entries = Object.entries(norm).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, topN);
  const restW = entries.slice(topN).reduce((s, [, w]) => s + w, 0);
  const segments: CountrySegment[] = top.map(([k, w]) => ({
    key: k,
    label: k === UNMAPPED_COUNTRY_KEY ? "Unmapped" : k,
    icon: k === UNMAPPED_COUNTRY_KEY ? "⚠️" : countryIsoToFlagEmoji(k),
    pctLabel: formatPercentWidth4From01(w),
    weight: w,
  }));
  if (restW > 0.0005) {
    segments.push({
      key: "rest",
      label: "Other",
      icon: REST_ICON,
      pctLabel: formatPercentWidth4From01(restW),
      weight: restW,
    });
  }
  return segments;
}

/** Bar chart rows: top `topN` countries by weight plus optional "Other" for the rest. */
export function topCountriesChartData(
  countries: Record<string, number>,
  topN: number,
): Array<{ name: string; value: number }> {
  const norm = normalizeCountryWeightsForDisplay(countries);
  const entries = Object.entries(norm).sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, topN);
  const restW = entries.slice(topN).reduce((s, [, w]) => s + w, 0);
  const data = top.map(([iso, v]) => ({
    name: iso === UNMAPPED_COUNTRY_KEY ? "Unmapped" : iso,
    value: v,
  }));
  if (restW > 0.0005) {
    data.push({ name: "Other", value: restW });
  }
  return data;
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

/** Sectors sorted by weight descending, then by display title for ties. */
export function sortedSectorsForDisplay(
  sectors: Record<string, number>,
): SectorRow[] {
  return Object.entries(sectors)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => {
      const dw = b[1] - a[1];
      if (dw !== 0) {
        return dw;
      }
      return sectorTitleCmp(sectorTitleForId(a[0]), sectorTitleForId(b[0]));
    })
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
  const norm = normalizeCountryWeightsForDisplay(countries);
  const countryParts = Object.entries(norm)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, v]) => {
      const label = k === UNMAPPED_COUNTRY_KEY ? "Unmapped" : k;
      return `${label} ${formatPercentWidth4From01(v)}`;
    });
  if (countryParts.length > 0) {
    lines.push(`Countries: ${countryParts.join(", ")}`);
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

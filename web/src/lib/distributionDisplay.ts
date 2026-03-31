/** Compact display of cached distribution payloads (countries + sectors). */

import {
  type DistributionSectorId,
  GEO_BUCKET_ORDER,
  type GeoBucketId,
  aggregateRegionsToGeoBuckets,
  countryIsoToFlagEmoji,
  geoBucketDisplayIcon,
  geoBucketDisplayTitle,
  resolveRegionKeyToIso,
} from "@investments/db";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib";
import { formatToPercentage } from "./numberFormat.js";
import { DISTRIBUTION_SECTOR_TITLES } from "./sectorTitles.js";

export type GeoBucket = GeoBucketId;

export { aggregateRegionsToGeoBuckets, GEO_BUCKET_ORDER };

/** Weights merged under this key could not be resolved to ISO (see `resolveRegionKeyToIso`). */
export const UNMAPPED_COUNTRY_KEY = "__unmapped__";

/** Synthetic key from API for non-cash holdings with no distribution cache (see `api` portfolio merge). */
export const PORTFOLIO_UNKNOWN_COUNTRY_KEY = "__portfolio_unknown__";

const CHART_UNKNOWN_LABEL = "Unknown";

/** Country bar chart Y-axis: short label for unmapped / unknown ISO. */
const COUNTRY_BAR_CHART_UNKNOWN_LABEL = "??";

/** Sector distribution keys that describe bond sleeve mix (not equity sectors). */
export const BOND_DISTRIBUTION_SECTOR_IDS = [
  "long_government_bonds",
  "long_corporate_bonds",
  "short_bonds",
  "ultrashort_bonds",
] as const;

export function isBondDistributionSectorId(id: string): boolean {
  return (BOND_DISTRIBUTION_SECTOR_IDS as readonly string[]).includes(id);
}

/**
 * Strips bond sector keys and renormalizes remaining weights to sum to 1.
 * Empty object if nothing remains.
 */
export function equitySectorsForDisplay(
  sectors: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sectors)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      continue;
    }
    if (isBondDistributionSectorId(k)) {
      continue;
    }
    out[k] = v;
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum < MIN_PORTFOLIO_ALLOCATION_FRACTION) {
    return {};
  }
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v !== undefined) {
      out[k] = v / sum;
    }
  }
  return out;
}

const sectorTitleCmp = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });

function sectorTitleForId(id: string): string {
  if (id === PORTFOLIO_UNKNOWN_COUNTRY_KEY) {
    return CHART_UNKNOWN_LABEL;
  }
  const t = DISTRIBUTION_SECTOR_TITLES[id as DistributionSectorId];
  return t ?? id;
}

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
    label: k === UNMAPPED_COUNTRY_KEY ? CHART_UNKNOWN_LABEL : k,
    icon: k === UNMAPPED_COUNTRY_KEY ? "⚠️" : countryIsoToFlagEmoji(k),
    pctLabel: formatPercentWidth4From01(w),
    weight: w,
  }));
  if (restW >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
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

/** Country bar chart: all ISO / unknown segments sorted by weight; unknown last. */
export function allCountriesChartData(
  countries: Record<string, number>,
): Array<{ name: string; value: number; bucketKey: string }> {
  const norm = normalizeCountryWeightsForDisplay(countries);
  const rows = Object.entries(norm)
    .filter(([, v]) => v >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
    .map(([k, v]) => ({
      key: k,
      name: k === UNMAPPED_COUNTRY_KEY ? COUNTRY_BAR_CHART_UNKNOWN_LABEL : k,
      value: v,
    }));
  return sortBarChartRowsUnknownLast(
    rows,
    (r) => r.key === UNMAPPED_COUNTRY_KEY,
  );
}

function sortBarChartRowsUnknownLast(
  rows: Array<{ key: string; name: string; value: number }>,
  isUnknown: (r: { key: string }) => boolean,
): Array<{ name: string; value: number; bucketKey: string }> {
  return sortBarChartRowsUnknownLastWithKeys(rows, isUnknown).map(
    ({ name, value, key }) => ({ name, value, bucketKey: key }),
  );
}

function sortBarChartRowsUnknownLastWithKeys(
  rows: Array<{ key: string; name: string; value: number }>,
  isUnknown: (r: { key: string }) => boolean,
): Array<{ key: string; name: string; value: number }> {
  const unk = rows.filter(isUnknown);
  const kn = rows.filter((r) => !isUnknown(r));
  kn.sort((a, b) => b.value - a.value);
  unk.sort((a, b) => b.value - a.value);
  return [...kn, ...unk];
}

function regionBarRowsWithKeys(
  regions: Record<string, number>,
): Array<{ key: string; name: string; value: number }> {
  const rows = Object.entries(regions)
    .filter(([, v]) => v >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
    .map(([id, value]) => ({
      key: id,
      name:
        id === "unknown"
          ? CHART_UNKNOWN_LABEL
          : geoBucketDisplayTitle(id as GeoBucketId),
      value,
    }));
  return sortBarChartRowsUnknownLastWithKeys(rows, (r) => r.key === "unknown");
}

function sectorBarRowsWithKeys(
  sectors: Record<string, number>,
): Array<{ key: string; name: string; value: number }> {
  const rows = Object.entries(sectors)
    .filter(([, v]) => v >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
    .map(([id, value]) => ({
      key: id,
      name: sectorTitleForId(id),
      value,
    }));
  return sortBarChartRowsUnknownLastWithKeys(
    rows,
    (r) => r.key === PORTFOLIO_UNKNOWN_COUNTRY_KEY,
  );
}

function countryBarRowsWithKeys(
  countries: Record<string, number>,
): Array<{ key: string; name: string; value: number }> {
  const norm = normalizeCountryWeightsForDisplay(countries);
  const rows = Object.entries(norm)
    .filter(([, v]) => v >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
    .map(([k, v]) => ({
      key: k,
      name: k === UNMAPPED_COUNTRY_KEY ? COUNTRY_BAR_CHART_UNKNOWN_LABEL : k,
      value: v,
    }));
  return sortBarChartRowsUnknownLastWithKeys(
    rows,
    (r) => r.key === UNMAPPED_COUNTRY_KEY,
  );
}

/**
 * Side-by-side bars: row order follows **primary** sort (same as single-chart helpers), then
 * any categories only present in **compare** (same sort rules within that tail).
 */
export function portfolioRegionBarRowsDual(
  primary: Record<string, number>,
  compare: Record<string, number>,
): Array<{
  name: string;
  primary: number;
  compare: number;
  bucketKey: string;
}> {
  const pRows = regionBarRowsWithKeys(primary);
  const primaryKeys = new Set(pRows.map((r) => r.key));
  const compareOnly = regionBarRowsWithKeys(compare).filter(
    (r) => !primaryKeys.has(r.key),
  );
  return [
    ...pRows.map((r) => ({
      name: r.name,
      primary: r.value,
      compare: compare[r.key] ?? 0,
      bucketKey: r.key,
    })),
    ...compareOnly.map((r) => ({
      name: r.name,
      primary: 0,
      compare: r.value,
      bucketKey: r.key,
    })),
  ];
}

export function portfolioSectorBarRowsDual(
  primary: Record<string, number>,
  compare: Record<string, number>,
): Array<{
  name: string;
  primary: number;
  compare: number;
  bucketKey: string;
}> {
  const pRows = sectorBarRowsWithKeys(primary);
  const primaryKeys = new Set(pRows.map((r) => r.key));
  const compareOnly = sectorBarRowsWithKeys(compare).filter(
    (r) => !primaryKeys.has(r.key),
  );
  return [
    ...pRows.map((r) => ({
      name: r.name,
      primary: r.value,
      compare: compare[r.key] ?? 0,
      bucketKey: r.key,
    })),
    ...compareOnly.map((r) => ({
      name: r.name,
      primary: 0,
      compare: r.value,
      bucketKey: r.key,
    })),
  ];
}

export function allCountriesChartDataDual(
  primary: Record<string, number>,
  compare: Record<string, number>,
): Array<{
  name: string;
  primary: number;
  compare: number;
  bucketKey: string;
}> {
  const compareNorm = normalizeCountryWeightsForDisplay(compare);
  const pRows = countryBarRowsWithKeys(primary);
  const primaryKeys = new Set(pRows.map((r) => r.key));
  const compareOnly = countryBarRowsWithKeys(compare).filter(
    (r) => !primaryKeys.has(r.key),
  );
  return [
    ...pRows.map((r) => ({
      name: r.name,
      primary: r.value,
      compare: compareNorm[r.key] ?? 0,
      bucketKey: r.key,
    })),
    ...compareOnly.map((r) => ({
      name: r.name,
      primary: 0,
      compare: r.value,
      bucketKey: r.key,
    })),
  ];
}

const COUNTRY_BAR_CHART_OTHER_ROW_LABEL = "Other";

/** Same order as {@link allCountriesChartData}; caps row count and merges the tail into one "Other" bar. */
export function topCountriesChartData(
  countries: Record<string, number>,
  topN: number,
): Array<{ name: string; value: number; bucketKey: string }> {
  const full = allCountriesChartData(countries);
  if (topN < 1 || full.length <= topN) {
    return full;
  }
  const head = full.slice(0, topN);
  const rest = full.slice(topN).reduce((s, r) => s + r.value, 0);
  return [
    ...head,
    {
      name: COUNTRY_BAR_CHART_OTHER_ROW_LABEL,
      value: rest,
      bucketKey: "rest",
    },
  ];
}

/** Same order as {@link allCountriesChartDataDual}; caps row count and merges the tail into one "Other" bar. */
export function topCountriesChartDataDual(
  primary: Record<string, number>,
  compare: Record<string, number>,
  topN: number,
): Array<{
  name: string;
  primary: number;
  compare: number;
  bucketKey: string;
}> {
  const full = allCountriesChartDataDual(primary, compare);
  if (topN < 1 || full.length <= topN) {
    return full;
  }
  const head = full.slice(0, topN);
  const tail = full.slice(topN);
  const primaryRest = tail.reduce((s, r) => s + r.primary, 0);
  const compareRest = tail.reduce((s, r) => s + r.compare, 0);
  return [
    ...head,
    {
      name: COUNTRY_BAR_CHART_OTHER_ROW_LABEL,
      primary: primaryRest,
      compare: compareRest,
      bucketKey: "rest",
    },
  ];
}

/** Regions bar chart: sorted by weight; geo bucket **unknown** last. */
export function portfolioRegionBarRows(
  regions: Record<string, number>,
): Array<{ name: string; value: number; bucketKey: string }> {
  const rows = Object.entries(regions)
    .filter(([, v]) => v >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
    .map(([id, value]) => ({
      key: id,
      name:
        id === "unknown"
          ? CHART_UNKNOWN_LABEL
          : geoBucketDisplayTitle(id as GeoBucketId),
      value,
    }));
  return sortBarChartRowsUnknownLast(rows, (r) => r.key === "unknown");
}

/** Sectors bar chart: sorted by weight; no-cache **Unknown** last. */
export function portfolioSectorBarRows(
  sectors: Record<string, number>,
): Array<{ name: string; value: number; bucketKey: string }> {
  const rows = Object.entries(sectors)
    .filter(([, v]) => v >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
    .map(([id, value]) => ({
      key: id,
      name: sectorTitleForId(id),
      value,
    }));
  return sortBarChartRowsUnknownLast(
    rows,
    (r) => r.key === PORTFOLIO_UNKNOWN_COUNTRY_KEY,
  );
}

const NBSP = "\u00a0";

/** Whole percent in a fixed 4-column field: value left-aligned, padded on the right (NBSP). */
export function formatPercentWidth4From01(weight01: number): string {
  return formatToPercentage(weight01).padEnd(5, NBSP);
}

export type SectorRow = {
  name: string;
  weight: number;
  icon: string;
  pctLabel: string;
};

/** Sectors sorted by weight descending, then by display title for ties. */
export function sortedSectorsForDisplay(
  sectors: Record<string, number>,
): SectorRow[] {
  return Object.entries(sectors)
    .filter(
      ([, v]) =>
        typeof v === "number" &&
        Number.isFinite(v) &&
        v >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
    )
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
    if (v >= MIN_PORTFOLIO_ALLOCATION_FRACTION) {
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

/** Icons for canonical sector ids (`db` sector id vocabulary). */
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
      return "🥔";
    case "industrials":
      return "🏭";
    case "energy":
      return "🛢️";
    case "materials":
      return "🧱";
    case "real_estate":
      return "🏢";
    case "utilities":
      return "🔌";
    case "communication_services":
      return "📡";
    case "other":
      return "📊";
    case "long_government_bonds":
      return "🏛️";
    case "long_corporate_bonds":
      return "🏢";
    case "short_bonds":
      return "▶️";
    case "ultrashort_bonds":
      return "⏩";
    default:
      return "❓";
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
      const label = k === UNMAPPED_COUNTRY_KEY ? CHART_UNKNOWN_LABEL : k;
      return `${label} ${formatPercentWidth4From01(v)}`;
    });
  if (countryParts.length > 0) {
    lines.push(`Countries: ${countryParts.join(", ")}`);
  }
  const secParts = Object.entries(sectors)
    .filter(
      ([, v]) =>
        typeof v === "number" && v >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
    )
    .sort((a, b) =>
      sectorTitleCmp(sectorTitleForId(a[0]), sectorTitleForId(b[0])),
    )
    .map(([k, v]) => `${sectorTitleForId(k)} ${formatPercentWidth4From01(v)}`);
  if (secParts.length > 0) {
    lines.push(`Sectors: ${secParts.join(", ")}`);
  }
  return lines.join("\n");
}

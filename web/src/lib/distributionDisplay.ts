/** Compact display of cached distribution payloads (regions + sectors). */

export type GeoBucket = "EU" | "NA" | "ASIA" | "EM" | "OTHER";

const SELIGSON_REGION_TO_BUCKET: Record<string, GeoBucket> = {
  europe: "EU",
  north_america: "NA",
  pacific: "ASIA",
  emerging: "EM",
};

const EU_NAMES = new Set(
  [
    "austria",
    "belgium",
    "bulgaria",
    "croatia",
    "cyprus",
    "czech republic",
    "czechia",
    "denmark",
    "estonia",
    "finland",
    "france",
    "germany",
    "greece",
    "hungary",
    "ireland",
    "italy",
    "latvia",
    "lithuania",
    "luxembourg",
    "malta",
    "netherlands",
    "poland",
    "portugal",
    "romania",
    "slovakia",
    "slovenia",
    "spain",
    "sweden",
    "united kingdom",
    "uk",
    "switzerland",
    "norway",
    "iceland",
    "liechtenstein",
    "europe",
    "eurozone",
    "euro area",
    "european union",
    "guernsey",
    "jersey",
    "isle of man",
    "monaco",
    "andorra",
    "san marino",
    "gibraltar",
    "faroe islands",
    "faroes",
  ].map((s) => s.toLowerCase()),
);

const NA_NAMES = new Set(
  [
    "united states",
    "usa",
    "u.s.",
    "canada",
    "mexico",
    "bermuda",
    "north america",
    "puerto rico",
    "greenland",
  ].map((s) => s.toLowerCase()),
);

const ASIA_NAMES = new Set(
  [
    "japan",
    "china",
    "hong kong",
    "taiwan",
    "south korea",
    "korea",
    "republic of korea",
    "singapore",
    "australia",
    "new zealand",
    "india",
    "indonesia",
    "thailand",
    "malaysia",
    "philippines",
    "vietnam",
    "pakistan",
    "bangladesh",
    "sri lanka",
    "asia",
    "asia pacific",
    "pacific",
    "oceania",
    "macau",
    "mongolia",
    "cambodia",
    "myanmar",
    "laos",
    "nepal",
    "brunei",
    "new caledonia",
    "papua new guinea",
    "fiji",
    "guam",
    "marshall islands",
  ].map((s) => s.toLowerCase()),
);

/** Latin America, Africa, Middle East, Russia, Central Asia (non-EU), Caribbean (non-US) */
const EM_NAMES = new Set(
  [
    "brazil",
    "argentina",
    "chile",
    "colombia",
    "peru",
    "venezuela",
    "ecuador",
    "uruguay",
    "paraguay",
    "bolivia",
    "south africa",
    "russia",
    "russian federation",
    "turkey",
    "saudi arabia",
    "united arab emirates",
    "uae",
    "qatar",
    "kuwait",
    "bahrain",
    "oman",
    "israel",
    "egypt",
    "nigeria",
    "kenya",
    "morocco",
    "tunisia",
    "ghana",
    "ivory coast",
    "côte d'ivoire",
    "kazakhstan",
    "uzbekistan",
    "ukraine",
    "emerging markets",
    "emerging",
    "middle east",
    "africa",
    "latin america",
    "south america",
    "central america",
    "caribbean",
    "panama",
    "costa rica",
    "dominican republic",
    "jamaica",
    "trinidad and tobago",
    "trinidad",
    "bahamas",
    "barbados",
    "cayman islands",
  ].map((s) => s.toLowerCase()),
);

function normalizeRegionKey(key: string): string {
  return key.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function yahooCountryToBucket(norm: string): GeoBucket {
  if (EU_NAMES.has(norm)) {
    return "EU";
  }
  if (NA_NAMES.has(norm)) {
    return "NA";
  }
  if (ASIA_NAMES.has(norm)) {
    return "ASIA";
  }
  if (EM_NAMES.has(norm)) {
    return "EM";
  }
  return "OTHER";
}

/**
 * Merge raw region weights into EU / NA / ASIA / EM (+ OTHER for unmapped keys).
 * Input values are 0–1 fractions (sum ≈ 1 per instrument).
 */
export function aggregateRegionsToBuckets(
  regions: Record<string, number>,
): Record<GeoBucket, number> {
  const out: Record<GeoBucket, number> = {
    EU: 0,
    NA: 0,
    ASIA: 0,
    EM: 0,
    OTHER: 0,
  };
  for (const [rawKey, w] of Object.entries(regions)) {
    if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
      continue;
    }
    const key = rawKey.trim();
    const selig = SELIGSON_REGION_TO_BUCKET[key.toLowerCase()];
    if (selig) {
      out[selig] += w;
      continue;
    }
    const norm = normalizeRegionKey(key);
    const bucket = yahooCountryToBucket(norm);
    out[bucket] += w;
  }
  return out;
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

/** Compact label for the geo row: EU/NA use flag emoji; other buckets stay abbreviated text. */
export function geoBucketDisplayLabel(bucket: GeoBucket): string {
  switch (bucket) {
    case "EU":
      return "🇪🇺";
    case "NA":
      // No single North America flag; US flag is a common shorthand for NA equity weights.
      return "🇺🇸";
    default:
      return bucket;
  }
}

export type GeoSegment = { bucket: GeoBucket; pctLabel: string };

export function geoSegmentsForDisplay(
  buckets: Record<GeoBucket, number>,
): GeoSegment[] {
  const order: GeoBucket[] = ["EU", "NA", "ASIA", "EM", "OTHER"];
  const out: GeoSegment[] = [];
  for (const b of order) {
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
  const g = aggregateRegionsToBuckets(regions);
  for (const b of ["EU", "NA", "ASIA", "EM", "OTHER"] as const) {
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

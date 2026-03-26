import { resolveRegionKeyToIso } from "./countryIso.js";

export const GEO_BUCKET_ORDER = [
  "finland",
  "europe",
  "north_america",
  "asia",
  "china",
  "emerging_markets",
] as const;

export type GeoBucketId = (typeof GEO_BUCKET_ORDER)[number];

const CHINA = new Set([
  "CN", // China
  "HK", // Hong Kong
  "MO", // Macau
]);

/**
 * United States + Canada and U.S. insular areas (territories / freely associated). Mexico and
 * non-U.S. Americas map to `emerging_markets`.
 */
const NORTH_AMERICA = new Set([
  "US", // United States
  "CA", // Canada
  "PR", // Puerto Rico
  "VI", // U.S. Virgin Islands
  "GU", // Guam
  "AS", // American Samoa
  "MP", // Northern Mariana Islands
  "UM", // U.S. Minor Outlying Islands
]);

/** Geographic Europe (excl. Russia, Turkey, Kazakhstan) incl. EU, EEA, CH, UK, UA, BY, MD, Western Balkans, microstates; Greenland */
const EUROPE = new Set([
  "AL", // Albania
  "AD", // Andorra
  "AT", // Austria
  "BE", // Belgium
  "BA", // Bosnia and Herzegovina
  "BG", // Bulgaria
  "HR", // Croatia
  "CY", // Cyprus
  "CZ", // Czechia
  "DK", // Denmark
  "EE", // Estonia
  "FI", // Finland
  "FR", // France
  "DE", // Germany
  "GR", // Greece
  "HU", // Hungary
  "IS", // Iceland
  "IE", // Ireland
  "IT", // Italy
  "XK", // Kosovo
  "LV", // Latvia
  "LI", // Liechtenstein
  "LT", // Lithuania
  "LU", // Luxembourg
  "MT", // Malta
  "MD", // Moldova
  "MC", // Monaco
  "ME", // Montenegro
  "NL", // Netherlands
  "MK", // North Macedonia
  "NO", // Norway
  "PL", // Poland
  "PT", // Portugal
  "RO", // Romania
  "SM", // San Marino
  "RS", // Serbia
  "SK", // Slovakia
  "SI", // Slovenia
  "ES", // Spain
  "SE", // Sweden
  "CH", // Switzerland
  "UA", // Ukraine
  "GB", // United Kingdom
  "VA", // Vatican City
  "GE", // Georgia
  "BY", // Belarus
  "GI", // Gibraltar
  "JE", // Jersey
  "GG", // Guernsey
  "IM", // Isle of Man
  "FO", // Faroe Islands
  "GL", // Greenland
  "AX", // Åland Islands
]);

/**
 * `asia` = developed Asia-Pacific (MSCI-style developed ex-China). CN/HK/MO use `china`.
 *
 * Everything else in Asia (India, ASEAN except SG/BN, South/Central Asia, frontier Pacific,
 * North Korea, Mongolia, etc.) maps to `emerging_markets`.
 */
const ASIA = new Set([
  "JP", // Japan
  "KR", // South Korea
  "SG", // Singapore
  "TW", // Taiwan
  "BN", // Brunei
  "AU", // Australia
  "NZ", // New Zealand
]);

/**
 * Default bucket for a country. Replaceable later for configurable rules.
 * Finland and China split out; Europe excludes FI; `asia` is developed APAC only (CN/HK/MO → china);
 * US/CA/U.S. territories → north_america; Greenland → europe; other Americas → emerging_markets.
 */
export function countryCodeToBucket(iso: string): GeoBucketId {
  const c = iso.toUpperCase();
  if (c === "FI") {
    return "finland";
  }
  if (CHINA.has(c)) {
    return "china";
  }
  if (NORTH_AMERICA.has(c)) {
    return "north_america";
  }
  if (EUROPE.has(c)) {
    return "europe";
  }
  if (ASIA.has(c)) {
    return "asia";
  }
  return "emerging_markets";
}

/** Legacy Seligson macro keys (pre–country-level scrape) → bucket id */
const LEGACY_SELIGSON_MACRO: Record<string, GeoBucketId> = {
  europe: "europe",
  north_america: "north_america",
  /** Coarse APAC region without country split; blend is mostly EM / non-developed APAC */
  pacific: "emerging_markets",
  emerging: "emerging_markets",
};

function emptyBuckets(): Record<GeoBucketId, number> {
  return {
    finland: 0,
    europe: 0,
    north_america: 0,
    asia: 0,
    china: 0,
    emerging_markets: 0,
  };
}

/**
 * Aggregate region weights (ISO keys and/or resolvable labels, plus legacy macro keys)
 * into fixed geo buckets.
 */
export function aggregateRegionsToGeoBuckets(
  regions: Record<string, number>,
): Record<GeoBucketId, number> {
  const out = emptyBuckets();
  for (const [rawKey, w] of Object.entries(regions)) {
    if (typeof w !== "number" || !Number.isFinite(w) || w <= 0) {
      continue;
    }
    const key = rawKey.trim();
    const macro = LEGACY_SELIGSON_MACRO[key.toLowerCase()];
    if (macro) {
      out[macro] += w;
      continue;
    }
    const iso = resolveRegionKeyToIso(key);
    if (iso) {
      const b = countryCodeToBucket(iso);
      out[b] += w;
      continue;
    }
    out.emerging_markets += w;
  }
  return out;
}

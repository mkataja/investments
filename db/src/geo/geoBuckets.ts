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

/** US, Canada, Mexico + nearby territories often grouped with North America in fund data */
const NORTH_AMERICA = new Set([
  "US", // United States
  "CA", // Canada
  "MX", // Mexico
  "BM", // Bermuda
  "GL", // Greenland
  "PM", // Saint Pierre and Miquelon
  "KY", // Cayman Islands
  "TC", // Turks and Caicos Islands
  "VG", // British Virgin Islands
  "AI", // Anguilla
  "AW", // Aruba
  "BL", // Saint Barthélemy
  "MF", // Saint Martin (France)
  "GP", // Guadeloupe
  "MQ", // Martinique
  "SX", // Sint Maarten
  "BQ", // Caribbean Netherlands
  "CW", // Curaçao
  "UM", // U.S. Minor Outlying Islands
  "AS", // American Samoa
  "GU", // Guam
  "MP", // Northern Mariana Islands
  "MS", // Montserrat
  "PR", // Puerto Rico
  "VI", // U.S. Virgin Islands
  "GS", // South Georgia and the South Sandwich Islands
  "FK", // Falkland Islands
]);

/** Geographic Europe (excl. Russia, Turkey, Kazakhstan) incl. EU, EEA, CH, UK, UA, BY, MD, Western Balkans, microstates */
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
  "AX", // Åland Islands
]);

/** Asia ex China/HK/MO: East, South, Southeast Asia, Oceania (AU/NZ), Central Asia */
const ASIA = new Set([
  "JP", // Japan
  "KR", // South Korea
  "KP", // North Korea
  "IN", // India
  "PK", // Pakistan
  "BD", // Bangladesh
  "LK", // Sri Lanka
  "NP", // Nepal
  "BT", // Bhutan
  "MV", // Maldives
  "AF", // Afghanistan
  "ID", // Indonesia
  "TH", // Thailand
  "VN", // Vietnam
  "MY", // Malaysia
  "PH", // Philippines
  "SG", // Singapore
  "TW", // Taiwan
  "BN", // Brunei
  "KH", // Cambodia
  "LA", // Laos
  "MM", // Myanmar
  "TL", // Timor-Leste
  "MN", // Mongolia
  "AU", // Australia
  "NZ", // New Zealand
  "PG", // Papua New Guinea
  "FJ", // Fiji
  "SB", // Solomon Islands
  "VU", // Vanuatu
  "WS", // Samoa
  "TO", // Tonga
  "KI", // Kiribati
  "FM", // Micronesia
  "MH", // Marshall Islands
  "PW", // Palau
  "NR", // Nauru
  "TV", // Tuvalu
  "UZ", // Uzbekistan
  "TM", // Turkmenistan
  "TJ", // Tajikistan
  "KG", // Kyrgyzstan
]);

/**
 * Default bucket for a country. Replaceable later for configurable rules.
 * Finland and China split out; Europe excludes FI; Asia excludes CN/HK/MO (those go to china).
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
  pacific: "asia",
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

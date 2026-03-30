/**
 * Canonical sector ids for `distributions.payload.sectors` (JSON keys) and portfolio aggregation.
 */

export const DISTRIBUTION_SECTOR_IDS = [
  "technology",
  "healthcare",
  "financials",
  "consumer_cyclical",
  "consumer_defensive",
  "industrials",
  "energy",
  "materials",
  "real_estate",
  "utilities",
  "communication_services",
  "other",
  "cash",
] as const;

export type DistributionSectorId = (typeof DISTRIBUTION_SECTOR_IDS)[number];

export const DISTRIBUTION_SECTOR_TITLES: Record<DistributionSectorId, string> =
  {
    technology: "Technology",
    healthcare: "Healthcare",
    financials: "Financials",
    consumer_cyclical: "Consumer cyclical",
    consumer_defensive: "Consumer defensive",
    industrials: "Industrials",
    energy: "Energy",
    materials: "Materials",
    real_estate: "Real estate",
    utilities: "Utilities",
    communication_services: "Communication services",
    other: "Other",
    cash: "Cash",
  };

export function isDistributionSectorId(s: string): s is DistributionSectorId {
  return (DISTRIBUTION_SECTOR_IDS as readonly string[]).includes(s);
}

/**
 * Map Yahoo / GICS-style sector strings to a canonical id. Unknown labels map to `other`.
 */
export function mapYahooSectorToCanonicalId(raw: string): DistributionSectorId {
  const s = raw.trim().toLowerCase();
  if (!s) {
    return "other";
  }

  if (
    s === "cash" ||
    s.includes("money market") ||
    s.includes("cash equivalent")
  ) {
    return "cash";
  }

  if (
    s.includes("information technology") ||
    s.includes("technology") ||
    s === "tech"
  ) {
    return "technology";
  }
  if (s.includes("health")) {
    return "healthcare";
  }
  if (
    s.includes("financial") ||
    s.includes("insurance") ||
    s.includes("capital markets")
  ) {
    return "financials";
  }
  if (
    s.includes("consumer cyclical") ||
    s.includes("consumer discretionary") ||
    s.includes("cyclical")
  ) {
    return "consumer_cyclical";
  }
  if (
    s.includes("consumer defensive") ||
    s.includes("consumer staples") ||
    s.includes("staples")
  ) {
    return "consumer_defensive";
  }
  if (s.includes("consumer")) {
    return "consumer_cyclical";
  }
  if (
    s.includes("industrial") ||
    s.includes("industrials") ||
    s.includes("aerospace") ||
    s.includes("machinery")
  ) {
    return "industrials";
  }
  if (s.includes("energy") || s.includes("oil") || s.includes("gas")) {
    return "energy";
  }
  if (
    s.includes("basic materials") ||
    s.includes("materials") ||
    s.includes("chemical")
  ) {
    return "materials";
  }
  if (s.includes("real estate") || s.includes("reit")) {
    return "real_estate";
  }
  if (s.includes("utilit")) {
    return "utilities";
  }
  if (
    s.includes("communication") ||
    s.includes("telecom") ||
    s.includes("media") ||
    s.includes("entertainment")
  ) {
    return "communication_services";
  }

  return "other";
}

/** Finnish labels from Seligson FundViewer sector table (view=40). */
export const SELIGSON_FINNISH_SECTOR_LABEL_MAP: Record<
  string,
  DistributionSectorId
> = {
  Teollisuus: "industrials",
  Teknologia: "technology",
  Kulutustavarat: "consumer_cyclical",
  Terveys: "healthcare",
  Rahoitus: "financials",
};

export function mapSeligsonFinnishSectorLabelToCanonicalId(
  label: string,
): DistributionSectorId {
  const t = label.trim();
  const id = SELIGSON_FINNISH_SECTOR_LABEL_MAP[t];
  return id ?? "other";
}

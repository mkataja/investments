import type { DistributionSectorId } from "@investments/db";

/**
 * Map free-text sector/industry labels (GICS-style, Yahoo, provider exports, etc.) to a canonical id.
 * Unknown labels map to `other`.
 */
export function mapSectorLabelToCanonicalId(raw: string): DistributionSectorId {
  const s = raw.trim().toLowerCase();
  if (!s) {
    return "other";
  }

  if (
    s === "cash" ||
    s.includes("money market") ||
    s.includes("cash equivalent") ||
    s.includes("cash and/or")
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
  if (
    s.includes("real estate") ||
    s.includes("realestate") ||
    s.includes("reit")
  ) {
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

/** Finnish labels from Seligson FundViewer holdings **Toimiala** column (view=10) and legacy sector summary. */
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

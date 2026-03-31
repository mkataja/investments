import type { DistributionSectorId } from "@investments/db";

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
    long_government_bonds: "Long government bonds",
    long_corporate_bonds: "Long corporate bonds",
    short_bonds: "Short / money market bonds",
    ultrashort_bonds: "Ultrashort bonds",
  };

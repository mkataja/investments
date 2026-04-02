import type { AssetMixHistoryPoint, PortfolioDistributions } from "../types";

export type PortfolioChartsProps = {
  portfolio: PortfolioDistributions;
  comparePortfolio: PortfolioDistributions | null;
  showDistributionCompare: boolean;
  selectedPortfolioLabel: string;
  comparePortfolioLabel: string;
  /** Weekly series from `GET /portfolio/asset-mix-history`. */
  assetMixHistoryPoints: AssetMixHistoryPoint[];
  /** Labeled Y-axis ticks per distribution bar chart (including 0). Default 5. */
  distributionBarYAxisTickCount?: number;
};

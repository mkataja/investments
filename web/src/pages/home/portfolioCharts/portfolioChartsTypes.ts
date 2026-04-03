import type { AssetMixHistoryPoint, PortfolioDistributions } from "../types";

export type PortfolioChartsProps = {
  portfolio: PortfolioDistributions;
  comparePortfolio: PortfolioDistributions | null;
  showDistributionCompare: boolean;
  selectedPortfolioLabel: string;
  comparePortfolioLabel: string;
  /** Weekly series from `GET /portfolio/asset-mix-history` (actual); sector-over-time uses this. */
  assetMixHistoryPoints: AssetMixHistoryPoint[];
  /** When set, drives the asset mix line only (e.g. HODL variant). */
  assetMixOverTimeLinePoints?: AssetMixHistoryPoint[];
  /** When true, chart shows `virtualLeverageEur` sleeve and signed net tooltip. */
  assetMixHistoryLineHodlMode?: boolean;
  /** For lazy `variant=hodl` fetch. */
  portfolioId?: number | null;
  /** When false, hide Diamond hands toggle (no sells). */
  portfolioHasSellTransactions?: boolean;
  /** Labeled Y-axis ticks per distribution bar chart (including 0). Default 5. */
  distributionBarYAxisTickCount?: number;
  /** When true, omit the section h2 (e.g. when a parent tab bar labels the view). */
  hideSectionTitle?: boolean;
};

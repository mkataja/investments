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
  /** When true, chart shows virtual leverage and loan-interest sleeves and signed net tooltip. */
  assetMixHistoryLineHodlMode?: boolean;
  /** For lazy `variant=hodl` fetch. */
  portfolioId?: number | null;
  /** When false, hide Diamond hands toggle (no sells). */
  portfolioHasSellTransactions?: boolean;
  /** Labeled Y-axis ticks per distribution bar chart (including 0). Default 5. */
  distributionBarYAxisTickCount?: number;
  /** When true, omit the section h2 (e.g. when a parent tab bar labels the view). */
  hideSectionTitle?: boolean;
  /** Backtest starting EUR notional; when set, shown in parens after the estimated total. */
  backtestInitialTotalEur?: number | null;
  /**
   * Display names by instrument id (e.g. from `GET /instruments`). Used for holding-over-time
   * labels for ids not in current `portfolio.positions` (e.g. sold holdings still in history).
   */
  instrumentDisplayNameById?: ReadonlyMap<number, string>;
};

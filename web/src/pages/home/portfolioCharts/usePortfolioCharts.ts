import type { PortfolioChartsProps } from "./portfolioChartsTypes";
import { useAssetMixHistoryLine } from "./useAssetMixHistoryLine";
import { useBucketDistributionHistoryLine } from "./useBucketDistributionHistoryLine";
import { useHoldingDistributionHistoryLine } from "./useHoldingDistributionHistoryLine";
import { usePortfolioDistributionBarCharts } from "./usePortfolioDistributionBarCharts";
import { usePortfolioPieCharts } from "./usePortfolioPieCharts";
import { useRegionDistributionHistoryLine } from "./useRegionDistributionHistoryLine";
import { useSectorDistributionHistoryLine } from "./useSectorDistributionHistoryLine";

export type { PortfolioChartsProps } from "./portfolioChartsTypes";

export function usePortfolioCharts(
  props: PortfolioChartsProps,
  options?: {
    assetMixHistoryStacked?: boolean;
    regionDistributionHistoryStacked?: boolean;
    sectorDistributionHistoryStacked?: boolean;
    holdingDistributionHistoryStacked?: boolean;
    /** When true, y-axis and tooltips use % of total equity value; when false (default), EUR. */
    holdingDistributionHistoryAsPercentage?: boolean;
    bucketDistributionHistoryStacked?: boolean;
    /** When true, adds cash-account aggregate EUR per week to the Cash bucket. Default false. */
    bucketDistributionHistoryIncludeCash?: boolean;
  },
) {
  const bars = usePortfolioDistributionBarCharts(props);
  const pies = usePortfolioPieCharts(props);
  const assetMixOverTimePoints =
    props.assetMixOverTimeLinePoints ?? props.assetMixHistoryPoints;
  const assetMixHistory = useAssetMixHistoryLine(
    assetMixOverTimePoints,
    options?.assetMixHistoryStacked ?? false,
    props.assetMixHistoryLineHodlMode ?? false,
  );
  const regionDistributionHistory = useRegionDistributionHistoryLine(
    props.assetMixHistoryPoints,
    options?.regionDistributionHistoryStacked ?? false,
  );
  const sectorDistributionHistory = useSectorDistributionHistoryLine(
    props.assetMixHistoryPoints,
    options?.sectorDistributionHistoryStacked ?? false,
  );
  const holdingDistributionHistory = useHoldingDistributionHistoryLine(
    props.assetMixHistoryPoints,
    options?.holdingDistributionHistoryStacked ?? false,
    props.portfolio.positions,
    props.instrumentDisplayNameById,
    options?.holdingDistributionHistoryAsPercentage ?? false,
  );
  const bucketDistributionHistory = useBucketDistributionHistoryLine(
    props.assetMixHistoryPoints,
    options?.bucketDistributionHistoryStacked ?? false,
    props.portfolio.positions,
    options?.bucketDistributionHistoryIncludeCash ?? false,
  );
  return {
    portfolio: props.portfolio,
    comparePortfolio: props.comparePortfolio,
    showDistributionCompare: props.showDistributionCompare,
    assetMixLineData: assetMixHistory.data,
    assetMixLineOptions: assetMixHistory.options,
    regionDistributionLineData: regionDistributionHistory.data,
    regionDistributionLineOptions: regionDistributionHistory.options,
    regionDistributionHistoryHasData: regionDistributionHistory.hasData,
    sectorDistributionLineData: sectorDistributionHistory.data,
    sectorDistributionLineOptions: sectorDistributionHistory.options,
    sectorDistributionHistoryHasData: sectorDistributionHistory.hasData,
    holdingDistributionLineData: holdingDistributionHistory.data,
    holdingDistributionLineOptions: holdingDistributionHistory.options,
    holdingDistributionHistoryHasData: holdingDistributionHistory.hasData,
    bucketDistributionLineData: bucketDistributionHistory.data,
    bucketDistributionLineOptions: bucketDistributionHistory.options,
    bucketDistributionHistoryHasData: bucketDistributionHistory.hasData,
    ...bars,
    ...pies,
  };
}

import type { PortfolioChartsProps } from "./portfolioChartsTypes";
import { useAssetMixHistoryLine } from "./useAssetMixHistoryLine";
import { usePortfolioDistributionBarCharts } from "./usePortfolioDistributionBarCharts";
import { usePortfolioPieCharts } from "./usePortfolioPieCharts";
import { useSectorDistributionHistoryLine } from "./useSectorDistributionHistoryLine";

export type { PortfolioChartsProps } from "./portfolioChartsTypes";

export function usePortfolioCharts(
  props: PortfolioChartsProps,
  options?: {
    assetMixHistoryStacked?: boolean;
    sectorDistributionHistoryStacked?: boolean;
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
  const sectorDistributionHistory = useSectorDistributionHistoryLine(
    props.assetMixHistoryPoints,
    options?.sectorDistributionHistoryStacked ?? false,
  );
  return {
    portfolio: props.portfolio,
    comparePortfolio: props.comparePortfolio,
    showDistributionCompare: props.showDistributionCompare,
    assetMixLineData: assetMixHistory.data,
    assetMixLineOptions: assetMixHistory.options,
    sectorDistributionLineData: sectorDistributionHistory.data,
    sectorDistributionLineOptions: sectorDistributionHistory.options,
    sectorDistributionHistoryHasData: sectorDistributionHistory.hasData,
    ...bars,
    ...pies,
  };
}

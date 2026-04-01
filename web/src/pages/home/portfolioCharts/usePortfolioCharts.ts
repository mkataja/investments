import type { PortfolioChartsProps } from "./portfolioChartsTypes";
import { useAssetMixHistoryLine } from "./useAssetMixHistoryLine";
import { usePortfolioDistributionBarCharts } from "./usePortfolioDistributionBarCharts";
import { usePortfolioPieCharts } from "./usePortfolioPieCharts";

export type { PortfolioChartsProps } from "./portfolioChartsTypes";

export function usePortfolioCharts(props: PortfolioChartsProps) {
  const bars = usePortfolioDistributionBarCharts(props);
  const pies = usePortfolioPieCharts(props);
  const assetMixLine = useAssetMixHistoryLine(props.assetMixHistoryPoints);
  return {
    portfolio: props.portfolio,
    comparePortfolio: props.comparePortfolio,
    showDistributionCompare: props.showDistributionCompare,
    assetMixLineData: assetMixLine.data,
    assetMixLineOptions: assetMixLine.options,
    ...bars,
    ...pies,
  };
}

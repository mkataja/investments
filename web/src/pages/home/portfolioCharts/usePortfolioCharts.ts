import type { PortfolioChartsProps } from "./portfolioChartsTypes";
import { useAssetMixHistoryLine } from "./useAssetMixHistoryLine";
import { usePortfolioDistributionBarCharts } from "./usePortfolioDistributionBarCharts";
import { usePortfolioPieCharts } from "./usePortfolioPieCharts";

export type { PortfolioChartsProps } from "./portfolioChartsTypes";

export function usePortfolioCharts(
  props: PortfolioChartsProps,
  options?: { assetMixHistoryStacked?: boolean },
) {
  const bars = usePortfolioDistributionBarCharts(props);
  const pies = usePortfolioPieCharts(props);
  const assetMixHistory = useAssetMixHistoryLine(
    props.assetMixHistoryPoints,
    options?.assetMixHistoryStacked ?? false,
  );
  return {
    portfolio: props.portfolio,
    comparePortfolio: props.comparePortfolio,
    showDistributionCompare: props.showDistributionCompare,
    assetMixLineData: assetMixHistory.data,
    assetMixLineOptions: assetMixHistory.options,
    assetMixHistoryChartKind: assetMixHistory.kind,
    ...bars,
    ...pies,
  };
}

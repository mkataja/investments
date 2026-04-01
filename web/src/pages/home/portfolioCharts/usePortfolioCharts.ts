import type { PortfolioChartsProps } from "./portfolioChartsTypes";
import { usePortfolioDistributionBarCharts } from "./usePortfolioDistributionBarCharts";
import { usePortfolioPieCharts } from "./usePortfolioPieCharts";

export type { PortfolioChartsProps } from "./portfolioChartsTypes";

export function usePortfolioCharts(props: PortfolioChartsProps) {
  const bars = usePortfolioDistributionBarCharts(props);
  const pies = usePortfolioPieCharts(props);
  return {
    portfolio: props.portfolio,
    comparePortfolio: props.comparePortfolio,
    showDistributionCompare: props.showDistributionCompare,
    ...bars,
    ...pies,
  };
}

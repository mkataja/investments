import type { ChartType } from "chart.js";
import type { DistributionBarChartRow } from "./distributionChartTooltipTypes";

declare module "chart.js" {
  interface PluginOptionsByType<TType extends ChartType> {
    investmentsDistributionTooltip?: {
      rows: readonly DistributionBarChartRow[];
      showCompare: boolean;
      primaryLabel: string;
      compareLabel: string;
    };
    investmentsPieTooltip?:
      | { kind: "assetMix"; totalPortfolioEur: number }
      | { kind: "bondMix" };
  }
}

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
      | {
          kind: "assetMix";
          totalPortfolioEur: number;
          /** Inner ring (comparison) total EUR when showing dual-ring doughnut. */
          compareTotalPortfolioEur?: number;
          primaryLabel?: string;
          compareLabel?: string;
        }
      | {
          kind: "bondMix";
          primaryLabel?: string;
          compareLabel?: string;
        };
  }
}

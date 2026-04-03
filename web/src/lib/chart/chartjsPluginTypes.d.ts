import type { ChartType } from "chart.js";
import type { BucketTopHolding } from "../../pages/home/types";
import type { DistributionBarChartRow } from "./distributionChartTooltipTypes";

declare module "chart.js" {
  interface PluginOptionsByType<TType extends ChartType> {
    investmentsDistributionTooltip?: {
      rows: readonly DistributionBarChartRow[];
      showCompare: boolean;
      primaryLabel: string;
      compareLabel: string;
    };
    investmentsChoroplethDistributionTooltip?: {
      showCompare: boolean;
      primaryLabel: string;
      compareLabel: string;
      featureIsoByDataIndex: readonly (string | null)[];
      normPrimary: Record<string, number>;
      normCompare: Record<string, number>;
      topHoldingsPrimary: Record<string, BucketTopHolding[]>;
      topHoldingsCompare: Record<string, BucketTopHolding[]>;
      singleSeriesColor: string;
      comparePrimaryColor: string;
      compareSecondaryColor: string;
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

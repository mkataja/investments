/**
 * Chart.js options for distribution bar charts: structured tooltip data via
 * `plugins.investmentsDistributionTooltip` (rendered by **`DistributionChartTooltip`**).
 */
import type { ChartOptions } from "chart.js";
import {
  CHART_TOOLTIP_BASE,
  CHART_TOOLTIP_BASE_CHOROPLETH,
} from "../lib/chart/chartTooltipTheme";
import type { DistributionBarChartRow } from "../lib/chart/distributionChartTooltipTypes";
import type { BucketTopHolding } from "../pages/home/types";

export type { DistributionBarChartRow } from "../lib/chart/distributionChartTooltipTypes";

/**
 * Registers rows + compare labels for the distribution bar HTML tooltip.
 */
export function distributionBarChartTooltipPlugin(
  rows: readonly DistributionBarChartRow[],
  options: {
    showCompare: boolean;
    primaryLabel: string;
    compareLabel: string;
  },
): NonNullable<ChartOptions<"bar">["plugins"]> {
  return {
    investmentsDistributionTooltip: {
      rows,
      showCompare: options.showCompare,
      primaryLabel: options.primaryLabel,
      compareLabel: options.compareLabel,
    },
    tooltip: {
      ...CHART_TOOLTIP_BASE,
      mode: "index",
      intersect: false,
    },
  };
}

/** Same HTML tooltip as country bars; data from `plugins.investmentsChoroplethDistributionTooltip`. */
export function choroplethDistributionTooltipPlugin(config: {
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
}): NonNullable<ChartOptions<"choropleth">["plugins"]> {
  return {
    investmentsChoroplethDistributionTooltip: config,
    tooltip: {
      ...CHART_TOOLTIP_BASE_CHOROPLETH,
      mode: "nearest",
      // With intersect false, "nearest" picks by centroid distance over the whole map (bad for large countries).
      intersect: true,
    },
  };
}

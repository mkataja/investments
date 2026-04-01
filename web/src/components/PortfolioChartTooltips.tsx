/**
 * Chart.js options for distribution bar charts: structured tooltip data via
 * `plugins.investmentsDistributionTooltip` (rendered by **`DistributionChartTooltip`**).
 */
import type { ChartOptions } from "chart.js";
import { CHART_TOOLTIP_BASE } from "../lib/chart/chartTooltipTheme";
import type { DistributionBarChartRow } from "../lib/chart/distributionChartTooltipTypes";

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

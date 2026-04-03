import type { ChartOptions } from "chart.js";
import { CHART_TOOLTIP_STYLE } from "./chartTooltipConstants";
import { chartJsExternalTooltipHandler } from "./externalTooltip";

/** Shared across bar and pie/doughnut (same external tooltip handler). */
type SharedTooltipPluginOptions = NonNullable<
  ChartOptions<"bar" | "pie" | "doughnut">["plugins"]
>["tooltip"];

const titleFont = { size: 16, weight: "bold" as const };
const bodyFont = { size: 15 };

type ChoroplethTooltipOptions = NonNullable<
  ChartOptions<"choropleth">["plugins"]
>["tooltip"];

/** Same as {@link CHART_TOOLTIP_BASE}, typed for choropleth (Chart.js tooltip generics differ by chart type). */
export const CHART_TOOLTIP_BASE_CHOROPLETH: ChoroplethTooltipOptions = {
  enabled: false,
  external: chartJsExternalTooltipHandler,
  position: "followCursor" as const,
  backgroundColor: CHART_TOOLTIP_STYLE.backgroundColor,
  titleColor: CHART_TOOLTIP_STYLE.titleColor,
  bodyColor: CHART_TOOLTIP_STYLE.bodyColor,
  footerColor: CHART_TOOLTIP_STYLE.footerColor,
  borderColor: CHART_TOOLTIP_STYLE.borderColor,
  borderWidth: 1,
  padding: 12,
  titleFont,
  bodyFont,
  footerFont: bodyFont,
  boxPadding: 6,
  cornerRadius: 6,
  displayColors: true,
  usePointStyle: true,
};

/**
 * Shared tooltip look for bar and pie charts. Canvas tooltips are clipped inside small
 * chart boxes; `enabled: false` + `external` renders HTML on `document.body` instead.
 *
 * `position: "followCursor"` is registered on `Tooltip.positioners` in **`registerChartJs`**.
 */
export const CHART_TOOLTIP_BASE: SharedTooltipPluginOptions = {
  enabled: false,
  external: chartJsExternalTooltipHandler,
  position: "followCursor" as const,
  backgroundColor: CHART_TOOLTIP_STYLE.backgroundColor,
  titleColor: CHART_TOOLTIP_STYLE.titleColor,
  bodyColor: CHART_TOOLTIP_STYLE.bodyColor,
  footerColor: CHART_TOOLTIP_STYLE.footerColor,
  borderColor: CHART_TOOLTIP_STYLE.borderColor,
  borderWidth: 1,
  padding: 12,
  titleFont,
  bodyFont,
  footerFont: bodyFont,
  boxPadding: 6,
  cornerRadius: 6,
  displayColors: true,
  usePointStyle: true,
};

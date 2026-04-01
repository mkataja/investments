import type { ChartOptions } from "chart.js";

/** Minimum arc per non-zero pie slice (Chart.js has no built-in; see adjustPieValuesForMinAngleDegrees). */
export const PORTFOLIO_PIE_MIN_SLICE_DEGREES = 6;

/** Inset between canvas edge and pie arc (right is set by pieChartLeftAlignPlugin). */
export const portfolioPieChartLayoutPadding = {
  top: 10,
  right: 0,
  bottom: 10,
  left: 0,
} as const;

export const PORTFOLIO_COMPARE_DOUGHNUT_CUTOUT = "40%";

/** Native Chart.js legend beside the pie (same point style as distribution bar charts). */
export const portfolioPieChartLegendOptions: NonNullable<
  ChartOptions<"pie">["plugins"]
>["legend"] = {
  display: true,
  position: "right",
  labels: {
    boxWidth: 12,
    boxHeight: 12,
    padding: 10,
    font: { size: 14 },
    usePointStyle: true,
    pointStyle: "rectRounded",
  },
};

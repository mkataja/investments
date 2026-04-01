import type { Chart, Plugin } from "chart.js";
import { toPadding } from "chart.js/helpers";

/** Room for the vertical legend beside the pie (measured-ish; keeps the arc square without clipping labels). */
const LEGEND_WIDTH_RESERVE_PX = 200;

/**
 * Chart.js centers the pie in the chart area; with a short fixed height and full-width canvas the arc
 * sits in the horizontal middle. Extra right padding shrinks the chart area to ~square so the pie sits
 * left, with the legend immediately to its right.
 */
export const pieChartLeftAlignPlugin: Plugin<"pie"> = {
  id: "pieChartLeftAlign",
  beforeLayout(chart: Chart<"pie">) {
    const p = chart.options.layout?.padding;
    const pad = toPadding(
      p === undefined || typeof p === "number"
        ? (p ?? 0)
        : typeof p === "function"
          ? 0
          : (() => {
              const t = p as {
                top?: number;
                right?: number;
                bottom?: number;
                left?: number;
              };
              return {
                top: t.top ?? 0,
                right: t.right ?? 0,
                bottom: t.bottom ?? 0,
                left: t.left ?? 0,
              };
            })(),
    );
    const right = Math.max(
      0,
      chart.width - chart.height - LEGEND_WIDTH_RESERVE_PX - pad.left,
    );
    chart.options.layout = {
      ...chart.options.layout,
      padding: {
        ...pad,
        right,
      },
    };
  },
};

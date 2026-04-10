/**
 * Pixel style for HTML swatches that match Chart.js legend when
 * `plugins.legend.labels.usePointStyle: true` and `pointStyle: "rectRounded"`.
 *
 * @see chart.js `Legend` `_draw` — `radius: boxHeight * Math.SQRT2 / 2`
 * @see chart.js `drawPointLegend` — `case "rectRounded": cornerRadius = radius * 0.516`
 */
export function distributionChartLegendRectRoundedStyle(boxHeightPx: number): {
  width: number;
  height: number;
  borderRadius: number;
} {
  const pointRadius = boxHeightPx * (Math.SQRT2 / 2);
  const borderRadius = pointRadius * 0.516;
  return {
    width: boxHeightPx,
    height: boxHeightPx,
    borderRadius,
  };
}

/**
 * Custom HTML legends: box height in px. Chart.js defaults to 12; we use 14 so swatches read at
 * the same visual weight as canvas legend next to 14px labels.
 */
export const COMPARE_MAP_DIVERGING_LEGEND_SWATCH_PX = 16;

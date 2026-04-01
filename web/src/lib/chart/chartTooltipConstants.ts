/** Shared tooltip colors/sizes for Chart.js options + HTML external tooltip. */

/** Offset from pointer (canvas coords) when placing the HTML tooltip. */
export const CHART_TOOLTIP_CURSOR_OFFSET_PX = { x: 14, y: 16 } as const;

/** Min gap from viewport edges when clamping the HTML tooltip. */
export const CHART_TOOLTIP_VIEWPORT_PAD_PX = 8;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#ffffff",
  titleColor: "#1e293b",
  bodyColor: "#334155",
  footerColor: "#334155",
  borderColor: "#e2e8f0",
  titleSizePx: 16,
  bodySizePx: 15,
  footerSizePx: 15,
} as const;

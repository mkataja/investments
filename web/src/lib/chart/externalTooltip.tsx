import type { Chart, ChartType, TooltipModel } from "chart.js";
import { flushSync } from "react-dom";
import { type Root, createRoot } from "react-dom/client";
import { DistributionChartTooltip } from "./DistributionChartTooltip";
import { PortfolioPieTooltip } from "./PortfolioPieTooltip";
import {
  CHART_TOOLTIP_CURSOR_OFFSET_PX,
  CHART_TOOLTIP_VIEWPORT_PAD_PX,
} from "./chartTooltipConstants";
import { distributionChartTooltipPropsFromChart } from "./distributionChartTooltipFromChart";
import { portfolioPieTooltipPropsFromChart } from "./portfolioPieTooltipFromChart";

const TOOLTIP_ELEMENT_ID = "investments-chartjs-tooltip-html";

let tooltipRoot: Root | null = null;

function getTooltipRoot(el: HTMLElement): Root {
  if (!tooltipRoot) {
    tooltipRoot = createRoot(el);
  }
  return tooltipRoot;
}

/**
 * Renders portfolio chart tooltips as fixed HTML on `document.body` so they are not
 * clipped by `overflow` on chart containers.
 */
export function chartJsExternalTooltipHandler(context: {
  chart: Chart;
  tooltip: TooltipModel<ChartType>;
}): void {
  const { chart, tooltip } = context;
  let el = document.getElementById(TOOLTIP_ELEMENT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOOLTIP_ELEMENT_ID;
    el.style.position = "fixed";
    el.style.pointerEvents = "none";
    el.style.zIndex = "10050";
    /** Without this, `width: auto` fills the viewport from `left` and squeezes the inner box near the right edge. */
    el.style.width = "max-content";
    document.body.appendChild(el);
  }

  if (tooltip.opacity === 0) {
    el.style.opacity = "0";
    el.style.visibility = "hidden";
    return;
  }

  const distProps = distributionChartTooltipPropsFromChart(chart, tooltip);
  const pieProps = distProps
    ? null
    : portfolioPieTooltipPropsFromChart(chart, tooltip);

  const root = getTooltipRoot(el);
  flushSync(() => {
    if (distProps) {
      root.render(<DistributionChartTooltip {...distProps} />);
    } else if (pieProps) {
      root.render(<PortfolioPieTooltip {...pieProps} />);
    } else {
      root.render(null);
    }
  });

  el.style.opacity = String(tooltip.opacity);
  el.style.visibility = "visible";
  el.style.width = "max-content";

  const rect = chart.canvas.getBoundingClientRect();
  const cx =
    typeof tooltip.caretX === "number" && Number.isFinite(tooltip.caretX)
      ? tooltip.caretX
      : tooltip.x;
  const cy =
    typeof tooltip.caretY === "number" && Number.isFinite(tooltip.caretY)
      ? tooltip.caretY
      : tooltip.y;

  let left = rect.left + cx + CHART_TOOLTIP_CURSOR_OFFSET_PX.x;
  let top = rect.top + cy + CHART_TOOLTIP_CURSOR_OFFSET_PX.y;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const viewPad = CHART_TOOLTIP_VIEWPORT_PAD_PX;
  const box = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  left = Math.min(left, vw - viewPad - box.width);
  left = Math.max(left, viewPad);
  top = Math.min(top, vh - viewPad - box.height);
  top = Math.max(top, viewPad);

  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

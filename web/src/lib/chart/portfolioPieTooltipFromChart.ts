import type { Chart, ChartType, TooltipModel } from "chart.js";
import { CHART_TOOLTIP_VIEWPORT_PAD_PX } from "./chartTooltipConstants";
import type { PortfolioPieTooltipProps } from "./portfolioPieTooltipTypes";

export function portfolioPieTooltipPropsFromChart(
  chart: Chart,
  tooltip: TooltipModel<ChartType>,
): PortfolioPieTooltipProps | null {
  const plugin = chart.options.plugins?.investmentsPieTooltip;
  if (!plugin?.kind) return null;

  const dp = tooltip.dataPoints[0];
  const chartType = (chart.config as { type?: string }).type;
  if (!dp || chartType !== "pie") return null;

  const ix = dp.dataIndex;
  const labels = chart.data.labels;
  const sliceLabel = Array.isArray(labels) ? String(labels[ix] ?? "") : "";

  const ds0 = chart.data.datasets[0];
  if (!ds0) return null;
  const ds = ds0 as { originalData?: number[] };
  const raw = ds.originalData?.[ix];
  const n =
    typeof raw === "number"
      ? raw
      : typeof dp.parsed === "number"
        ? dp.parsed
        : 0;

  const maxInnerPx = Math.min(
    420,
    Math.max(0, window.innerWidth - 2 * CHART_TOOLTIP_VIEWPORT_PAD_PX),
  );

  if (plugin.kind === "assetMix") {
    const total = plugin.totalPortfolioEur ?? 0;
    return {
      kind: "assetMix",
      sliceLabel,
      valueEur: n,
      shareOfPortfolio: total > 0 ? n / total : 0,
      maxInnerWidthPx: maxInnerPx,
    };
  }

  return {
    kind: "bondMix",
    sliceLabel,
    weight: n,
    maxInnerWidthPx: maxInnerPx,
  };
}

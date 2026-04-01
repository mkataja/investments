import type { Chart, ChartType, TooltipModel } from "chart.js";
import { CHART_TOOLTIP_VIEWPORT_PAD_PX } from "./chartTooltipConstants";
import type { PortfolioPieTooltipProps } from "./portfolioPieTooltipTypes";

/** Raw slice value: `originalData` when present (pre–min-angle), else chart `data`. */
function sliceValueAt(
  chart: Chart,
  datasetIndex: number,
  dataIndex: number,
): number {
  const ds = chart.data.datasets[datasetIndex] as
    | { originalData?: number[]; data?: unknown[] }
    | undefined;
  const raw = ds?.originalData?.[dataIndex];
  if (typeof raw === "number") return raw;
  const d = ds?.data?.[dataIndex];
  return typeof d === "number" ? d : 0;
}

export function portfolioPieTooltipPropsFromChart(
  chart: Chart,
  tooltip: TooltipModel<ChartType>,
): PortfolioPieTooltipProps | null {
  const plugin = chart.options.plugins?.investmentsPieTooltip;
  if (!plugin?.kind) return null;

  const dp = tooltip.dataPoints[0];
  const chartType = (chart.config as { type?: string }).type;
  if (!dp || (chartType !== "pie" && chartType !== "doughnut")) return null;

  const ix = dp.dataIndex;
  const labels = chart.data.labels;
  const sliceLabel = Array.isArray(labels) ? String(labels[ix] ?? "") : "";

  const datasetIndex = dp.datasetIndex;
  const dsResolved = chart.data.datasets[datasetIndex];
  if (!dsResolved) return null;
  const n = sliceValueAt(chart, datasetIndex, ix);

  const maxInnerPx = Math.min(
    420,
    Math.max(0, window.innerWidth - 2 * CHART_TOOLTIP_VIEWPORT_PAD_PX),
  );

  if (plugin.kind === "assetMix") {
    const totalPrimary = plugin.totalPortfolioEur ?? 0;
    const totalCompare = plugin.compareTotalPortfolioEur;
    const ds0 = chart.data.datasets[0] as { label?: string } | undefined;
    const ds1 = chart.data.datasets[1] as { label?: string } | undefined;
    const primaryLabel = plugin.primaryLabel ?? ds0?.label ?? "";
    const compareLabel = plugin.compareLabel ?? ds1?.label ?? "";
    const dualCompare =
      chart.data.datasets.length >= 2 &&
      typeof totalCompare === "number" &&
      primaryLabel !== "" &&
      compareLabel !== "";

    if (dualCompare) {
      const v0 = sliceValueAt(chart, 0, ix);
      const v1 = sliceValueAt(chart, 1, ix);
      return {
        kind: "assetMix",
        sliceLabel,
        maxInnerWidthPx: maxInnerPx,
        comparison: {
          primaryLabel,
          compareLabel,
          primaryValueEur: v0,
          primaryShareOfPortfolio: totalPrimary > 0 ? v0 / totalPrimary : 0,
          compareValueEur: v1,
          compareShareOfPortfolio: totalCompare > 0 ? v1 / totalCompare : 0,
        },
      };
    }

    const total =
      datasetIndex > 0 && typeof totalCompare === "number"
        ? totalCompare
        : totalPrimary;
    return {
      kind: "assetMix",
      sliceLabel,
      valueEur: n,
      shareOfPortfolio: total > 0 ? n / total : 0,
      maxInnerWidthPx: maxInnerPx,
    };
  }

  if (chart.data.datasets.length >= 2) {
    const w0 = sliceValueAt(chart, 0, ix);
    const w1 = sliceValueAt(chart, 1, ix);
    const ds0 = chart.data.datasets[0] as { label?: string } | undefined;
    const ds1 = chart.data.datasets[1] as { label?: string } | undefined;
    const primaryLabel = plugin.primaryLabel ?? ds0?.label ?? "";
    const compareLabel = plugin.compareLabel ?? ds1?.label ?? "";
    if (primaryLabel !== "" && compareLabel !== "") {
      return {
        kind: "bondMix",
        sliceLabel,
        maxInnerWidthPx: maxInnerPx,
        comparison: {
          primaryLabel,
          compareLabel,
          primaryWeight: w0,
          compareWeight: w1,
        },
      };
    }
  }

  return {
    kind: "bondMix",
    sliceLabel,
    weight: n,
    maxInnerWidthPx: maxInnerPx,
  };
}

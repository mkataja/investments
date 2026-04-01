import type {
  Chart,
  ChartData,
  ChartDataset,
  ChartType,
  TooltipModel,
} from "chart.js";
import { CHART_TOOLTIP_VIEWPORT_PAD_PX } from "./chartTooltipConstants";
import type {
  DistributionBarChartRow,
  DistributionChartTooltipProps,
} from "./distributionChartTooltipTypes";

function colorAt(
  c: ChartDataset["backgroundColor"],
  dataIndex: number,
  fallback: string,
): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const x = c[dataIndex];
    if (typeof x === "string") return x;
    if (x && typeof x === "object" && "default" in x) {
      const d = (x as { default?: string }).default;
      if (typeof d === "string") return d;
    }
  }
  return fallback;
}

function borderAt(
  c: ChartDataset["borderColor"],
  dataIndex: number,
  fallback: string,
): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const x = c[dataIndex];
    if (typeof x === "string") return x;
  }
  return fallback;
}

export function distributionChartTooltipPropsFromChart(
  chart: Chart,
  tooltip: TooltipModel<ChartType>,
): DistributionChartTooltipProps | null {
  const cfg = chart.options.plugins?.investmentsDistributionTooltip;
  if (!cfg?.rows?.length) return null;

  const first = tooltip.dataPoints[0];
  if (!first) return null;

  const dataIndex = first.dataIndex;
  const rowRaw = cfg.rows[dataIndex];
  if (!rowRaw) return null;

  /** Chart.js merges plugin options as `DeepPartial`; runtime rows are built in-app as full rows. */
  const row = {
    name: rowRaw.name ?? "",
    tooltipHeading: rowRaw.tooltipHeading,
    topHoldings: rowRaw.topHoldings,
    topHoldingsPrimary: rowRaw.topHoldingsPrimary,
    topHoldingsCompare: rowRaw.topHoldingsCompare,
  } as DistributionBarChartRow;

  const data = chart.data as ChartData<"bar">;
  const datasets = data.datasets ?? [];

  const weights: DistributionChartTooltipProps["weights"] = [];
  for (const dp of tooltip.dataPoints) {
    const ds = datasets[dp.datasetIndex];
    if (!ds) continue;
    const y = dp.parsed.y;
    const value = typeof y === "number" && Number.isFinite(y) ? y : 0;
    weights.push({
      label: String(ds.label ?? ""),
      value,
      backgroundColor: colorAt(ds.backgroundColor, dataIndex, "#cbd5e1"),
      borderColor: borderAt(ds.borderColor, dataIndex, "#94a3b8"),
    });
  }

  const headingRaw = row.tooltipHeading ?? row.name;
  const heading = headingRaw !== "" ? headingRaw : "";

  const maxInnerPx = Math.min(
    720,
    Math.max(0, window.innerWidth - 2 * CHART_TOOLTIP_VIEWPORT_PAD_PX),
  );

  return {
    heading,
    weights,
    row,
    showCompare: cfg.showCompare ?? false,
    primaryLabel: cfg.primaryLabel ?? "",
    compareLabel: cfg.compareLabel ?? "",
    maxInnerWidthPx: maxInnerPx,
  };
}

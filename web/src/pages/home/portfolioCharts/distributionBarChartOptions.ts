import type { ChartOptions } from "chart.js";
import {
  type DistributionBarChartRow,
  distributionBarChartTooltipPlugin,
} from "../../../components/PortfolioChartTooltips";
import { formatToPercentage } from "../../../lib/numberFormat";

const DISTRIBUTION_BAR_CHART_GRID_STROKE = "#e2e8f0";

function yStepFromAxis(axis: { domain: [number, number]; ticks: number[] }) {
  const t0 = axis.ticks[0];
  const t1 = axis.ticks[1];
  if (typeof t0 === "number" && typeof t1 === "number") {
    return t1 - t0;
  }
  return axis.domain[1];
}

export function distributionBarOptions(args: {
  rows: DistributionBarChartRow[];
  yAxis: { domain: [number, number]; ticks: number[] };
  tooltip: {
    showCompare: boolean;
    primaryLabel: string;
    compareLabel: string;
  };
  xLabels: "slanted" | "compact";
  showLegend: boolean;
  onClick?: ChartOptions<"bar">["onClick"];
}): ChartOptions<"bar"> {
  const step = yStepFromAxis(args.yAxis);
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 320 },
    onClick: args.onClick,
    datasets: {
      bar: {
        borderRadius: 2,
        borderSkipped: false,
      },
    },
    plugins: {
      legend: {
        display: args.showLegend,
        position: "top",
        align: "end",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 14,
          font: { size: 14 },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      ...distributionBarChartTooltipPlugin(args.rows, args.tooltip),
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 14 },
          color: "#475569",
          maxRotation: args.xLabels === "slanted" ? 40 : 0,
          minRotation: args.xLabels === "slanted" ? 32 : 0,
          autoSkip: true,
        },
      },
      y: {
        min: 0,
        max: args.yAxis.domain[1],
        ticks: {
          stepSize: step,
          callback: (tickValue) =>
            formatToPercentage(
              typeof tickValue === "number" ? tickValue : Number(tickValue),
              { decimalPlaces: 0 },
            ),
        },
        grid: {
          color: DISTRIBUTION_BAR_CHART_GRID_STROKE,
          lineWidth: 1,
          drawTicks: false,
        },
        border: { display: false },
      },
    },
  };
}

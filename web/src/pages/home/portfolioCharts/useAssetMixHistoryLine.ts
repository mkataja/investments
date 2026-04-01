import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_STYLE } from "../../../lib/chart/chartTooltipConstants";
import { PORTFOLIO_DISTRIBUTION_BAR_COLORS } from "../../../lib/portfolioChartPalette";
import type { AssetMixHistoryPoint } from "../types";
import { DISTRIBUTION_BAR_CHART_GRID_STROKE } from "./distributionBarChartOptions";

export function useAssetMixHistoryLine(points: AssetMixHistoryPoint[]) {
  return useMemo(() => {
    const equitiesRgb = "59 127 212";
    const cashRgb = "21 128 61";
    const data: ChartData<"line"> = {
      labels: points.map((p) => p.date),
      datasets: [
        {
          label: "Equities",
          data: points.map((p) => p.equitiesEur),
          borderColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary,
          backgroundColor: `rgba(${equitiesRgb} / 0.12)`,
          cubicInterpolationMode: "monotone",
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
        {
          label: "Cash",
          data: points.map((p) => p.cashEur),
          borderColor: `rgb(${cashRgb})`,
          backgroundColor: `rgba(${cashRgb} / 0.1)`,
          cubicInterpolationMode: "monotone",
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 5,
          borderWidth: 2,
        },
      ],
    };
    const formatEur = (n: number) =>
      `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} EUR`;
    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 320 },
      interaction: { mode: "index", intersect: false },
      elements: {
        line: {
          borderJoinStyle: "round",
          borderCapStyle: "round",
        },
        point: {
          hoverBorderWidth: 2,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 14 },
            color: "#475569",
            maxRotation: 40,
            minRotation: 0,
            autoSkip: true,
          },
          border: { display: false },
        },
        y: {
          min: 0,
          ticks: {
            font: { size: 14 },
            color: "#475569",
            callback: (tickValue) => {
              const v =
                typeof tickValue === "number" ? tickValue : Number(tickValue);
              if (!Number.isFinite(v)) {
                return "";
              }
              if (v >= 1_000_000) {
                return `${(v / 1_000_000).toFixed(1)}M`;
              }
              if (v >= 1000) {
                return `${(v / 1000).toFixed(0)}k`;
              }
              return String(v);
            },
          },
          grid: {
            color: DISTRIBUTION_BAR_CHART_GRID_STROKE,
            lineWidth: 1,
            drawTicks: false,
          },
          border: { display: false },
        },
      },
      plugins: {
        legend: {
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
        tooltip: {
          backgroundColor: CHART_TOOLTIP_STYLE.backgroundColor,
          titleColor: CHART_TOOLTIP_STYLE.titleColor,
          bodyColor: CHART_TOOLTIP_STYLE.bodyColor,
          borderColor: CHART_TOOLTIP_STYLE.borderColor,
          borderWidth: 1,
          padding: 12,
          cornerRadius: 6,
          displayColors: true,
          usePointStyle: true,
          titleFont: { size: CHART_TOOLTIP_STYLE.titleSizePx, weight: "bold" },
          bodyFont: { size: CHART_TOOLTIP_STYLE.bodySizePx },
          callbacks: {
            label: (ctx) => {
              const n = ctx.parsed.y;
              if (typeof n !== "number" || !Number.isFinite(n)) {
                return ctx.dataset.label ?? "";
              }
              return `${ctx.dataset.label ?? ""}: ${formatEur(n)}`;
            },
          },
        },
      },
    };
    return { data, options };
  }, [points]);
}

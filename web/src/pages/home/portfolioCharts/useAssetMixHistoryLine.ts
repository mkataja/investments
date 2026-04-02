import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_STYLE } from "../../../lib/chart/chartTooltipConstants";
import type { AssetMixHistoryPoint } from "../types";
import { assetMixPieRowsFromAssetMix } from "./assetMixPieRows";
import { DISTRIBUTION_BAR_CHART_GRID_STROKE } from "./distributionBarChartOptions";

function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r} ${g} ${b} / ${alpha})`;
}

/** Chart.js omits points where data is `null`; zero is not drawn. */
function valueOrNullForChart(v: number): number | null {
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function useAssetMixHistoryLine(points: AssetMixHistoryPoint[]) {
  return useMemo(() => {
    const formatEur = (n: number) =>
      `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} EUR`;

    const first = points[0];
    if (points.length === 0 || first === undefined) {
      const data: ChartData<"line"> = { labels: [], datasets: [] };
      const options: ChartOptions<"line"> = {
        responsive: true,
        maintainAspectRatio: false,
      };
      return { data, options };
    }

    const templateRows = assetMixPieRowsFromAssetMix(first);
    const rowsByPoint = points.map((p) => assetMixPieRowsFromAssetMix(p));

    /** Trailing slot so the last date is not at the chart edge (category scale centers on bands). */
    const xLabels = [...points.map((p) => p.date), ""];

    /** Last real date column (e.g. today) — draw a dot when this sleeve has a value there. */
    const lastDateIndex = points.length - 1;
    const lastPointRadius = 4;
    const lastPointHoverRadius = 6;

    const data: ChartData<"line"> = {
      labels: xLabels,
      datasets: templateRows
        .map((row, i) => {
          const data = rowsByPoint.map((rows) =>
            valueOrNullForChart(rows[i]?.value ?? 0),
          );
          return { row, data };
        })
        .filter(({ data }) => data.some((v) => v != null))
        .map(({ row, data }) => {
          const series = [...data, null] as (number | null)[];
          const isLastDot = (ctx: { dataIndex: number }) => {
            const idx = ctx.dataIndex;
            if (idx !== lastDateIndex) {
              return false;
            }
            const v = series[idx];
            return typeof v === "number" && Number.isFinite(v);
          };
          return {
            label: row.name,
            data: series,
            borderColor: row.fill,
            backgroundColor: rgbaFromHex(row.fill, 0.12),
            cubicInterpolationMode: "monotone",
            fill: true,
            pointRadius: (ctx) => (isLastDot(ctx) ? lastPointRadius : 0),
            pointHoverRadius: (ctx) =>
              isLastDot(ctx) ? lastPointHoverRadius : 5,
            // Static fill so legend swatches resolve to the sleeve color (scriptable
            // transparent would hide legend colors). Radius 0 hides non-last points.
            pointBackgroundColor: row.fill,
            pointBorderColor: (ctx) => (isLastDot(ctx) ? "#ffffff" : row.fill),
            pointBorderWidth: (ctx) => (isLastDot(ctx) ? 2 : 0),
            pointHitRadius: (ctx) => (isLastDot(ctx) ? 10 : 0),
            borderWidth: 2,
          };
        }),
    };

    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 320 },
      interaction: { mode: "index", intersect: false },
      elements: {
        line: {
          borderJoinStyle: "round",
          borderCapStyle: "round",
          spanGaps: false,
        },
        point: {
          hoverBorderWidth: 2,
        },
      },
      scales: {
        x: {
          offset: true,
          grid: { display: false },
          ticks: {
            font: { size: 14 },
            color: "#475569",
            maxRotation: 40,
            minRotation: 0,
            autoSkip: true,
            callback: (tickValue: string | number) => {
              const i =
                typeof tickValue === "number" ? tickValue : Number(tickValue);
              if (!Number.isFinite(i)) {
                return "";
              }
              const label = xLabels[i];
              if (label === undefined || label === "") {
                return "";
              }
              return label;
            },
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
          filter: (item) =>
            typeof item.raw === "number" && Number.isFinite(item.raw),
          callbacks: {
            title: (tooltipItems) => {
              const i = tooltipItems[0]?.dataIndex;
              if (i === undefined || i >= points.length) {
                return "";
              }
              return points[i]?.date ?? "";
            },
            label: (ctx) => {
              if (ctx.raw === null) {
                return "";
              }
              const n = ctx.parsed.y;
              if (typeof n !== "number" || !Number.isFinite(n)) {
                return "";
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

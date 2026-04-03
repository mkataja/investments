import type { Chart, ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_STYLE } from "../../../lib/chart/chartTooltipConstants";
import type { AssetMixHistoryPoint } from "../types";
import { assetMixPieRowsFromAssetMix } from "./assetMixPieRows";
import { DISTRIBUTION_BAR_CHART_GRID_STROKE } from "./distributionBarChartOptions";

type AssetMixHistoryChartKind = "line" | "bar";

type AssetMixHistoryChartResult = {
  data: ChartData<"line"> | ChartData<"bar">;
  options: ChartOptions<"line"> | ChartOptions<"bar">;
  kind: AssetMixHistoryChartKind;
};

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

function yTickShort(v: number): string {
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
}

function totalPositiveEurAtDataIndex(chart: Chart, dataIndex: number): number {
  let s = 0;
  for (const ds of chart.data.datasets) {
    const row = ds.data;
    const raw = Array.isArray(row) ? row[dataIndex] : undefined;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      s += raw;
    }
  }
  return s;
}

export function useAssetMixHistoryLine(
  points: AssetMixHistoryPoint[],
  stackedBar: boolean,
): AssetMixHistoryChartResult {
  return useMemo(() => {
    const formatEur = (n: number) =>
      `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} EUR`;

    const empty = (): AssetMixHistoryChartResult => ({
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
      kind: stackedBar ? "bar" : "line",
    });

    const first = points[0];
    if (points.length === 0 || first === undefined) {
      return empty();
    }

    const templateRows = assetMixPieRowsFromAssetMix(first);
    const rowsByPoint = points.map((p) => assetMixPieRowsFromAssetMix(p));

    const xLabels = [...points.map((p) => p.date), ""];

    const lastDateIndex = points.length - 1;
    const lastPointRadius = 4;
    const lastPointHoverRadius = 6;

    const filteredSpecs = templateRows
      .map((row, i) => {
        const data = rowsByPoint.map((rows) =>
          valueOrNullForChart(rows[i]?.value ?? 0),
        );
        return { row, data };
      })
      .filter(({ data }) => data.some((v) => v != null));

    const xScaleTicks = {
      font: { size: 14 },
      color: "#475569",
      maxRotation: 40,
      minRotation: 0,
      autoSkip: true,
      callback: (tickValue: string | number) => {
        const i = typeof tickValue === "number" ? tickValue : Number(tickValue);
        if (!Number.isFinite(i)) {
          return "";
        }
        const label = xLabels[i];
        if (label === undefined || label === "") {
          return "";
        }
        return label;
      },
    };

    const yScaleTicks = {
      font: { size: 14 },
      color: "#475569",
      callback: (tickValue: string | number) => {
        const v = typeof tickValue === "number" ? tickValue : Number(tickValue);
        return yTickShort(v);
      },
    };

    const yGrid = {
      color: DISTRIBUTION_BAR_CHART_GRID_STROKE,
      lineWidth: 1,
      drawTicks: false,
    };

    const tooltipBase = {
      backgroundColor: CHART_TOOLTIP_STYLE.backgroundColor,
      titleColor: CHART_TOOLTIP_STYLE.titleColor,
      bodyColor: CHART_TOOLTIP_STYLE.bodyColor,
      footerColor: CHART_TOOLTIP_STYLE.footerColor,
      borderColor: CHART_TOOLTIP_STYLE.borderColor,
      borderWidth: 1,
      padding: 12,
      cornerRadius: 6,
      displayColors: true,
      usePointStyle: true,
      titleFont: { size: CHART_TOOLTIP_STYLE.titleSizePx, weight: "bold" },
      bodyFont: { size: CHART_TOOLTIP_STYLE.bodySizePx },
      footerFont: { size: CHART_TOOLTIP_STYLE.footerSizePx },
    } as const;

    const legendLabels = {
      boxWidth: 12,
      boxHeight: 12,
      padding: 14,
      font: { size: 14 },
      usePointStyle: true,
      pointStyle: "rectRounded" as const,
    };

    if (stackedBar) {
      const data: ChartData<"bar"> = {
        labels: xLabels,
        datasets: filteredSpecs.map(({ row, data }) => ({
          label: row.name,
          data: [...data, null].map((v) =>
            v == null || !Number.isFinite(v) ? 0 : v,
          ),
          backgroundColor: row.fill,
          borderWidth: 0,
          stack: "assetMix",
          borderRadius: 2,
        })),
      };

      const options: ChartOptions<"bar"> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 320 },
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            stacked: true,
            offset: true,
            grid: { display: false },
            ticks: xScaleTicks,
            border: { display: false },
          },
          y: {
            stacked: true,
            min: 0,
            ticks: yScaleTicks,
            grid: yGrid,
            border: { display: false },
          },
        },
        plugins: {
          legend: {
            position: "top",
            align: "end",
            labels: legendLabels,
          },
          tooltip: {
            ...tooltipBase,
            mode: "index",
            intersect: false,
            filter: (item) => {
              const y =
                typeof item.parsed.y === "number" ? item.parsed.y : Number.NaN;
              return Number.isFinite(y) && y > 0;
            },
            callbacks: {
              title: (tooltipItems) => {
                const i = tooltipItems[0]?.dataIndex;
                if (i === undefined || i >= points.length) {
                  return "";
                }
                return points[i]?.date ?? "";
              },
              label: (ctx) => {
                const n = ctx.parsed.y;
                if (typeof n !== "number" || !Number.isFinite(n)) {
                  return "";
                }
                return `${ctx.dataset.label ?? ""}: ${formatEur(n)}`;
              },
              footer: (tooltipItems) => {
                const first = tooltipItems[0];
                if (!first) {
                  return "";
                }
                const sum = totalPositiveEurAtDataIndex(
                  first.chart,
                  first.dataIndex,
                );
                if (!(sum > 0)) {
                  return "";
                }
                return `Total: ${formatEur(sum)}`;
              },
            },
          },
        },
      };

      return { data, options, kind: "bar" as const };
    }

    const data: ChartData<"line"> = {
      labels: xLabels,
      datasets: filteredSpecs.map(({ row, data }) => {
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
          ticks: xScaleTicks,
          border: { display: false },
        },
        y: {
          min: 0,
          ticks: yScaleTicks,
          grid: yGrid,
          border: { display: false },
        },
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: legendLabels,
        },
        tooltip: {
          ...tooltipBase,
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
            footer: (tooltipItems) => {
              const first = tooltipItems[0];
              if (!first) {
                return "";
              }
              const sum = totalPositiveEurAtDataIndex(
                first.chart,
                first.dataIndex,
              );
              if (!(sum > 0)) {
                return "";
              }
              return `Total: ${formatEur(sum)}`;
            },
          },
        },
      },
    };

    return { data, options, kind: "line" as const };
  }, [points, stackedBar]);
}

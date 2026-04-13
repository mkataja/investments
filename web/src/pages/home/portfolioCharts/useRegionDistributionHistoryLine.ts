import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_STYLE } from "../../../lib/chart/chartTooltipConstants";
import { formatInstantForDisplay } from "../../../lib/dateTimeFormat";
import { portfolioRegionBarRows } from "../../../lib/distributionDisplay";
import { formatPercentageValueForDisplay } from "../../../lib/numberFormat";
import { portfolioRegionChartColorForBucketKey } from "../../../lib/portfolioChartPalette";
import type { AssetMixHistoryPoint } from "../types";
import { DISTRIBUTION_BAR_CHART_GRID_STROKE } from "./distributionBarChartOptions";
import { HISTORY_LINE_LEGEND_LABELS } from "./historyLineChartStyle";
import { lineChartValueFromRawSeries } from "./portfolioHistorySeriesChartUtils";

type RegionDistributionHistoryChartResult = {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
  hasData: boolean;
};

function maxEurWeightsByRegionKey(
  points: AssetMixHistoryPoint[],
): Record<string, number> {
  const maxEurByKey: Record<string, number> = {};
  for (const p of points) {
    const m = p.portfolioRegionsEur ?? {};
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        maxEurByKey[k] = Math.max(maxEurByKey[k] ?? 0, v);
      }
    }
  }
  const sum = Object.values(maxEurByKey).reduce((a, b) => a + b, 0);
  if (!(sum > 0)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(maxEurByKey).map(([k, v]) => [k, v / sum]),
  );
}

export function useRegionDistributionHistoryLine(
  points: AssetMixHistoryPoint[],
  stacked: boolean,
): RegionDistributionHistoryChartResult {
  return useMemo(() => {
    const formatPct = (n: number) => formatPercentageValueForDisplay(n);

    const empty = (): RegionDistributionHistoryChartResult => ({
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
      hasData: false,
    });

    if (points.length === 0) {
      return empty();
    }

    const norm = maxEurWeightsByRegionKey(points);
    const templateRows = portfolioRegionBarRows(norm);
    if (templateRows.length === 0) {
      return empty();
    }

    const rowsByPoint = points.map((p) => ({
      ...(p.portfolioRegionsEur ?? {}),
    }));

    const xLabels = [...points.map((p) => formatInstantForDisplay(p.date)), ""];

    const filteredSpecs = templateRows
      .map((row) => {
        const rawSeries = rowsByPoint.map((m) => m[row.bucketKey] ?? 0);
        return { row, rawSeries };
      })
      .filter(({ rawSeries }) =>
        rawSeries.some((v) => Number.isFinite(v) && v > 0),
      );

    if (filteredSpecs.length === 0) {
      return empty();
    }

    const nDates = points.length;
    const totalEurAtDate = Array.from({ length: nDates }, (_, j) =>
      filteredSpecs.reduce(
        (s, { rawSeries }) => s + Math.max(0, rawSeries[j] ?? 0),
        0,
      ),
    );

    const pctSpecs = filteredSpecs.map(({ row, rawSeries }) => ({
      row,
      pctSeries: rawSeries.map((eur, j) => {
        const t = totalEurAtDate[j] ?? 0;
        if (!(t > 0) || !Number.isFinite(eur) || eur <= 0) {
          return 0;
        }
        return (eur / t) * 100;
      }),
    }));

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
        if (!Number.isFinite(v)) {
          return "";
        }
        return formatPercentageValueForDisplay(v, { decimalPlaces: 0 });
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

    const data: ChartData<"line"> = {
      labels: xLabels,
      datasets: pctSpecs.map(({ row, pctSeries }) => {
        const fill = portfolioRegionChartColorForBucketKey(row.bucketKey);
        const series = [
          ...pctSeries.map((_, j) => lineChartValueFromRawSeries(pctSeries, j)),
          null,
        ] as (number | null)[];
        return {
          label: row.name,
          data: series,
          ...(stacked
            ? {
                stack: "regionDist",
                backgroundColor: fill,
                fill: true,
              }
            : { fill: false }),
          borderColor: fill,
          cubicInterpolationMode: "monotone" as const,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHitRadius: 8,
          pointBackgroundColor: fill,
          pointBorderColor: fill,
          pointBorderWidth: 0,
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
          stacked,
          min: 0,
          ...(stacked ? { max: 100 } : {}),
          ticks: yScaleTicks,
          grid: yGrid,
          border: { display: false },
        },
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: HISTORY_LINE_LEGEND_LABELS,
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
              return xLabels[i] ?? "";
            },
            label: (ctx) => {
              if (ctx.raw === null) {
                return "";
              }
              const n = ctx.parsed.y;
              if (typeof n !== "number" || !Number.isFinite(n)) {
                return "";
              }
              return `${ctx.dataset.label ?? ""}: ${formatPct(n)}`;
            },
            footer: (tooltipItems) => {
              const sum = tooltipItems.reduce((acc, it) => {
                const y =
                  typeof it.parsed.y === "number" ? it.parsed.y : Number.NaN;
                return acc + (Number.isFinite(y) && y > 0 ? y : 0);
              }, 0);
              if (!(sum > 0)) {
                return "";
              }
              return `Total: ${formatPct(sum)}`;
            },
          },
        },
      },
    };

    return { data, options, hasData: true };
  }, [points, stacked]);
}

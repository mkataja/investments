import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_STYLE } from "../../../lib/chart/chartTooltipConstants";
import { PORTFOLIO_ASSET_MIX_COLORS } from "../../../lib/portfolioChartPalette";
import type { AssetMixHistoryPoint } from "../types";
import { assetMixPieRowsFromAssetMix } from "./assetMixPieRows";
import { DISTRIBUTION_BAR_CHART_GRID_STROKE } from "./distributionBarChartOptions";
import {
  HISTORY_LINE_LEGEND_LABELS,
  historyLineAreaFill,
} from "./historyLineChartStyle";
import {
  lineChartValueFromRawSeries,
  lineChartValueFromRawSeriesNonPositive,
  yTickShort,
} from "./portfolioHistorySeriesChartUtils";

function totalPositiveAssetMixEurFromPoint(p: AssetMixHistoryPoint): number {
  return (
    p.equitiesEur +
    p.bondsTotalEur +
    p.commodityGoldEur +
    p.commoditySilverEur +
    p.commodityOtherEur +
    p.cashInFundsEur +
    p.cashExcessEur
  );
}

function netAssetMixEurFromPoint(p: AssetMixHistoryPoint): number {
  return (
    totalPositiveAssetMixEurFromPoint(p) +
    (p.virtualLeverageEur ?? 0) +
    (p.virtualLeverageInterestEur ?? 0)
  );
}

const VIRTUAL_LEVERAGE_LABEL = "Leverage (virtual)";
const VIRTUAL_LEVERAGE_INTEREST_LABEL = "Loan interest (virtual)";

type AssetMixHistoryChartResult = {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
};

export function useAssetMixHistoryLine(
  points: AssetMixHistoryPoint[],
  stacked: boolean,
  lineHodlMode = false,
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
        const rawSeries = rowsByPoint.map((rows) => rows[i]?.value ?? 0);
        return { row, rawSeries };
      })
      .filter(({ rawSeries }) =>
        rawSeries.some((v) => Number.isFinite(v) && v > 0),
      );

    const virtualRawSeries = points.map((p) => p.virtualLeverageEur ?? 0);
    const virtualInterestRawSeries = points.map(
      (p) => p.virtualLeverageInterestEur ?? 0,
    );
    const includeVirtualLeverageSleeve =
      lineHodlMode && virtualRawSeries.some((v) => Number.isFinite(v) && v < 0);
    const includeVirtualInterestSleeve =
      lineHodlMode &&
      virtualInterestRawSeries.some((v) => Number.isFinite(v) && v < 0);

    const virtualFill = PORTFOLIO_ASSET_MIX_COLORS.virtualLeverage;
    const virtualInterestFill =
      PORTFOLIO_ASSET_MIX_COLORS.virtualLeverageInterest;

    type Spec =
      | (typeof filteredSpecs)[number]
      | {
          row: { name: string; fill: string };
          rawSeries: number[];
          mapValue: (raw: readonly number[], j: number) => number | null;
        };

    const virtualSleeves: Spec[] = [
      ...(includeVirtualLeverageSleeve
        ? [
            {
              row: { name: VIRTUAL_LEVERAGE_LABEL, fill: virtualFill },
              rawSeries: virtualRawSeries,
              mapValue: lineChartValueFromRawSeriesNonPositive,
            },
          ]
        : []),
      ...(includeVirtualInterestSleeve
        ? [
            {
              row: {
                name: VIRTUAL_LEVERAGE_INTEREST_LABEL,
                fill: virtualInterestFill,
              },
              rawSeries: virtualInterestRawSeries,
              mapValue: lineChartValueFromRawSeriesNonPositive,
            },
          ]
        : []),
    ];

    const allSpecs: Spec[] =
      virtualSleeves.length > 0
        ? [...filteredSpecs, ...virtualSleeves]
        : filteredSpecs;

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

    const data: ChartData<"line"> = {
      labels: xLabels,
      datasets: allSpecs.map((spec) => {
        const rawSeries = spec.rawSeries;
        const mapFn =
          "mapValue" in spec ? spec.mapValue : lineChartValueFromRawSeries;
        const series = [
          ...rawSeries.map((_, j) => mapFn(rawSeries, j)),
          null,
        ] as (number | null)[];
        const isLastDot = (ctx: { dataIndex: number }) => {
          const idx = ctx.dataIndex;
          if (idx !== lastDateIndex) {
            return false;
          }
          const v = series[idx];
          return typeof v === "number" && Number.isFinite(v);
        };
        const rowFill = spec.row.fill;
        const areaFill = historyLineAreaFill(stacked, rowFill);
        return {
          label: spec.row.name,
          data: series,
          ...(stacked ? { stack: "assetMix" } : {}),
          borderColor: rowFill,
          backgroundColor: areaFill,
          cubicInterpolationMode: "monotone" as const,
          fill: true,
          pointRadius: (ctx: { dataIndex: number }) =>
            isLastDot(ctx) ? lastPointRadius : 0,
          pointHoverRadius: (ctx: { dataIndex: number }) =>
            isLastDot(ctx) ? lastPointHoverRadius : 5,
          pointBackgroundColor: rowFill,
          pointBorderColor: (ctx: { dataIndex: number }) =>
            isLastDot(ctx) ? "#ffffff" : rowFill,
          pointBorderWidth: (ctx: { dataIndex: number }) =>
            isLastDot(ctx) ? 2 : 0,
          pointHitRadius: (ctx: { dataIndex: number }) =>
            isLastDot(ctx) ? 10 : 0,
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
          ...(lineHodlMode ? {} : { min: 0 }),
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
            return Number.isFinite(y) && y !== 0;
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
              const i = first.dataIndex;
              const p = points[i];
              if (p === undefined) {
                return "";
              }
              if (lineHodlMode) {
                const net = netAssetMixEurFromPoint(p);
                if (!Number.isFinite(net)) {
                  return "";
                }
                return `Net total: ${formatEur(net)}`;
              }
              const sum = totalPositiveAssetMixEurFromPoint(p);
              if (!(sum > 0)) {
                return "";
              }
              return `Total: ${formatEur(sum)}`;
            },
          },
        },
      },
    };

    return { data, options };
  }, [points, stacked, lineHodlMode]);
}

import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_STYLE } from "../../../lib/chart/chartTooltipConstants";
import { formatInstantForDisplay } from "../../../lib/dateTimeFormat";
import { formatPercentageValueForDisplay } from "../../../lib/numberFormat";
import {
  PORTFOLIO_ASSET_MIX_COLORS,
  portfolioHoldingChartColorForIndex,
} from "../../../lib/portfolioChartPalette";
import type { AssetMixHistoryPoint, PortfolioDistributions } from "../types";
import { DISTRIBUTION_BAR_CHART_GRID_STROKE } from "./distributionBarChartOptions";
import { HISTORY_LINE_LEGEND_LABELS } from "./historyLineChartStyle";
import { lineChartValueFromRawSeries } from "./portfolioHistorySeriesChartUtils";

type BucketDistributionHistoryChartResult = {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
  hasData: boolean;
};

function bucketLabelForPosition(
  p: PortfolioDistributions["positions"][number],
): string {
  if (p.customBucketName != null) {
    return p.customBucketName;
  }
  if (p.assetClass === "cash_account") {
    return "Cash";
  }
  if (p.assetClass === "commodity") {
    return "Commodities";
  }
  return "Other";
}

function instrumentIdToBucketLabel(
  positions: PortfolioDistributions["positions"],
): Map<number, string> {
  return new Map(
    positions.map((p) => [p.instrumentId, bucketLabelForPosition(p)] as const),
  );
}

function bucketKeysOrderedByMaxEur(
  points: AssetMixHistoryPoint[],
  idToBucket: Map<number, string>,
  includeCashAccounts: boolean,
): string[] {
  const maxEur = points.reduce(
    (acc, p) => {
      const row = bucketTotalsPerPoint(p, idToBucket, includeCashAccounts);
      return Object.entries(row).reduce((inner, [k, v]) => {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          inner[k] = Math.max(inner[k] ?? 0, v);
        }
        return inner;
      }, acc);
    },
    {} as Record<string, number>,
  );
  return Object.entries(maxEur)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

function bucketTotalsPerPoint(
  p: AssetMixHistoryPoint,
  idToBucket: Map<number, string>,
  includeCashAccounts: boolean,
): Record<string, number> {
  const row: Record<string, number> = {};
  const mergeHoldings = (rec: Record<string, number>) => {
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
        continue;
      }
      const id = Number.parseInt(k, 10);
      if (!Number.isFinite(id)) {
        continue;
      }
      const bucket = idToBucket.get(id) ?? "Other";
      row[bucket] = (row[bucket] ?? 0) + v;
    }
  };
  mergeHoldings(p.holdingsEur ?? {});
  mergeHoldings(p.commodityHoldingsEur ?? {});
  if (includeCashAccounts) {
    const cash = p.cashTotalEur;
    if (typeof cash === "number" && Number.isFinite(cash) && cash > 0) {
      row.Cash = (row.Cash ?? 0) + cash;
    }
  }
  return row;
}

export function useBucketDistributionHistoryLine(
  points: AssetMixHistoryPoint[],
  stacked: boolean,
  positions: PortfolioDistributions["positions"],
  /** When false (default), omits aggregate cash-account EUR (`cashTotalEur`) from the series. */
  includeCashAccounts: boolean,
): BucketDistributionHistoryChartResult {
  const idToBucket = useMemo(
    () => instrumentIdToBucketLabel(positions),
    [positions],
  );

  return useMemo(() => {
    const formatPct = (n: number) => formatPercentageValueForDisplay(n);

    const empty = (): BucketDistributionHistoryChartResult => ({
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

    const orderedKeys = bucketKeysOrderedByMaxEur(
      points,
      idToBucket,
      includeCashAccounts,
    );
    if (orderedKeys.length === 0) {
      return empty();
    }

    const rowsByPoint = points.map((p) =>
      bucketTotalsPerPoint(p, idToBucket, includeCashAccounts),
    );

    const xLabels = [...points.map((p) => formatInstantForDisplay(p.date)), ""];

    const filteredSpecs = orderedKeys
      .map((bucketKey, idx) => {
        const rawSeries = rowsByPoint.map((m) => m[bucketKey] ?? 0);
        return {
          bucketKey,
          idx,
          rawSeries,
        };
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

    const pctSpecs = filteredSpecs.map(({ bucketKey, idx, rawSeries }) => ({
      bucketKey,
      idx,
      pctSeries: rawSeries.map((eur, j) => {
        const t = totalEurAtDate[j] ?? 0;
        if (!(t > 0) || !Number.isFinite(eur) || eur <= 0) {
          return 0;
        }
        return (eur / t) * 100;
      }),
    }));

    const chartSpecs = pctSpecs.map((s) => ({
      bucketKey: s.bucketKey,
      idx: s.idx,
      valueSeries: s.pctSeries,
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
      datasets: chartSpecs.map(({ bucketKey, idx, valueSeries }) => {
        const fill =
          bucketKey === "Cash"
            ? PORTFOLIO_ASSET_MIX_COLORS.cashExcess
            : bucketKey === "Commodities"
              ? PORTFOLIO_ASSET_MIX_COLORS.commodityOther
              : portfolioHoldingChartColorForIndex(idx);
        const series = [
          ...valueSeries.map((_, j) =>
            lineChartValueFromRawSeries(valueSeries, j),
          ),
          null,
        ] as (number | null)[];
        return {
          label: bucketKey,
          data: series,
          ...(stacked
            ? {
                stack: "bucketDist",
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
  }, [points, stacked, idToBucket, includeCashAccounts]);
}

import type {
  Chart,
  ChartData,
  ChartDataset,
  ChartType,
  TooltipModel,
} from "chart.js";
import type { BucketTopHolding } from "../../pages/home/types";
import {
  COUNTRY_BAR_CHART_UNKNOWN_LABEL,
  UNMAPPED_COUNTRY_KEY,
  countryBarTooltipHeading,
} from "../distributionDisplay";
import { CHART_TOOLTIP_VIEWPORT_PAD_PX } from "./chartTooltipConstants";
import type {
  DistributionBarChartRow,
  DistributionChartTooltipProps,
} from "./distributionChartTooltipTypes";

function bucketTopHoldingListFromUnknown(v: unknown): BucketTopHolding[] {
  if (!Array.isArray(v)) return [];
  return v.filter((h): h is BucketTopHolding => {
    if (h == null || typeof h !== "object") return false;
    if (!("instrumentId" in h) || typeof h.instrumentId !== "number") {
      return false;
    }
    if (!("displayName" in h) || typeof h.displayName !== "string") {
      return false;
    }
    if (
      !("tickerSymbol" in h) ||
      (h.tickerSymbol !== null && typeof h.tickerSymbol !== "string")
    ) {
      return false;
    }
    if (!("pctOfBucket" in h) || typeof h.pctOfBucket !== "number") {
      return false;
    }
    return true;
  });
}

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
  const chCfg = chart.options.plugins?.investmentsChoroplethDistributionTooltip;
  const chartJsType = "type" in chart.config ? chart.config.type : undefined;
  const featureIso = chCfg?.featureIsoByDataIndex;
  if (
    chartJsType === "choropleth" &&
    chCfg &&
    featureIso &&
    featureIso.length > 0
  ) {
    const firstCh = tooltip.dataPoints[0];
    if (!firstCh) return null;
    const dataIndex = firstCh.dataIndex;
    const iso = featureIso[dataIndex] ?? null;
    const lab = chart.data.labels?.[dataIndex];
    const fallbackLabel = typeof lab === "string" ? lab : "";

    const normP = chCfg.normPrimary ?? {};
    const normC = chCfg.normCompare ?? {};
    const wP =
      iso != null &&
      typeof normP[iso] === "number" &&
      Number.isFinite(normP[iso])
        ? normP[iso]
        : 0;
    const wC =
      iso != null &&
      typeof normC[iso] === "number" &&
      Number.isFinite(normC[iso])
        ? normC[iso]
        : 0;

    const showCompare = chCfg.showCompare ?? false;
    const heading = iso != null ? countryBarTooltipHeading(iso) : fallbackLabel;

    const rowName =
      iso === UNMAPPED_COUNTRY_KEY
        ? COUNTRY_BAR_CHART_UNKNOWN_LABEL
        : (iso ?? fallbackLabel);

    const thP = chCfg.topHoldingsPrimary ?? {};
    const thC = chCfg.topHoldingsCompare ?? {};

    const row: DistributionBarChartRow = showCompare
      ? {
          name: rowName,
          tooltipHeading: heading,
          topHoldingsPrimary:
            iso != null ? bucketTopHoldingListFromUnknown(thP[iso]) : [],
          topHoldingsCompare:
            iso != null ? bucketTopHoldingListFromUnknown(thC[iso]) : [],
        }
      : {
          name: rowName,
          tooltipHeading: heading,
          topHoldings:
            iso != null ? bucketTopHoldingListFromUnknown(thP[iso]) : [],
        };

    const primaryLabel = chCfg.primaryLabel ?? "";
    const compareLabel = chCfg.compareLabel ?? "";
    const comparePrimaryColor = chCfg.comparePrimaryColor ?? "#cbd5e1";
    const compareSecondaryColor = chCfg.compareSecondaryColor ?? "#cbd5e1";
    const singleSeriesColor = chCfg.singleSeriesColor ?? "#cbd5e1";

    const weights: DistributionChartTooltipProps["weights"] = showCompare
      ? [
          {
            label: primaryLabel,
            value: wP,
            backgroundColor: comparePrimaryColor,
            borderColor: "#94a3b8",
          },
          {
            label: compareLabel,
            value: wC,
            backgroundColor: compareSecondaryColor,
            borderColor: "#94a3b8",
          },
        ]
      : [
          {
            label: "Weight",
            value: wP,
            backgroundColor: singleSeriesColor,
            borderColor: "#94a3b8",
          },
        ];

    const maxInnerPx = Math.min(
      720,
      Math.max(0, window.innerWidth - 2 * CHART_TOOLTIP_VIEWPORT_PAD_PX),
    );

    const headingOut = heading !== "" ? heading : fallbackLabel;

    return {
      heading: headingOut,
      weights,
      row,
      showCompare,
      primaryLabel,
      compareLabel,
      maxInnerWidthPx: maxInnerPx,
    };
  }

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

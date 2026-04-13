import { NEAR_WHOLE_EPSILON } from "@investments/lib/float";
import {
  alpha2ToNumeric,
  numericAtlasIdToAlpha2Upper,
} from "@investments/lib/geo/iso3166Alpha2CountryCodes";
import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import type { ChartData, ChartOptions } from "chart.js";
import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import { choroplethDistributionTooltipPlugin } from "../../../components/PortfolioChartTooltips";
import {
  CHINA_MAP_CLUSTER_ALPHA2,
  UNMAPPED_COUNTRY_KEY,
  chinaMapClusterCombinedWeightFromNorm,
  normalizeCountryWeightsForDisplay,
} from "../../../lib/distributionDisplay";
import { PORTFOLIO_DISTRIBUTION_BAR_COLORS } from "../../../lib/portfolioChartPalette";
import type { BucketTopHolding } from "../types";
import { DIVERGING_RGB_STOPS } from "./worldCountryChoroplethDivergingStops";
import {
  WORLD_COUNTRY_FEATURES,
  WORLD_LAND_OUTLINE,
} from "./worldCountryChoroplethTopology";

/** Log scale + narrow ramp: small weights read as clearly blue; largest is only modestly darker. */
function portfolioChoroplethBlueInterpolator(t: number): string {
  const u = Math.min(1, Math.max(0, t));
  const light = { r: 225, g: 245, b: 255 };
  const dark = { r: 30, g: 100, b: 230 };
  const r = Math.round(light.r + (dark.r - light.r) * u);
  const g = Math.round(light.g + (dark.g - light.g) * u);
  const b = Math.round(light.b + (dark.b - light.b) * u);
  return `rgb(${r},${g},${b})`;
}

/** γ < 1 stretches mid-range: modest % gaps read as color while large gaps still reach full hue. */
const COMPARE_MAP_LOG_RATIO_COLOR_GAMMA = 0.62;

/** 0.1% of portfolio; if both sides are below this, log-ratio color is attenuated toward neutral. */
const COMPARE_MAP_SMALL_EXPOSURE_LEEWAY_THRESHOLD = 0.001;

/** Map signed log ratio to a symmetric axis value (0 stays 0). */
function compareMapLogRatioToColorAxis(logRatio: number): number {
  const a = Math.abs(logRatio);
  if (a === 0) return 0;
  return Math.sign(logRatio) * a ** COMPARE_MAP_LOG_RATIO_COLOR_GAMMA;
}

/** Pulls the diverging color toward center when both exposures are negligible (e.g. 0.03% vs 0%). */
function compareMapAxisWithSmallExposureLeeway(
  axis: number,
  wP: number,
  wC: number,
): number {
  if (
    wP >= COMPARE_MAP_SMALL_EXPOSURE_LEEWAY_THRESHOLD ||
    wC >= COMPARE_MAP_SMALL_EXPOSURE_LEEWAY_THRESHOLD
  ) {
    return axis;
  }
  const m = Math.max(wP, wC);
  const scale =
    m <= 0 ? 0 : Math.min(1, m / COMPARE_MAP_SMALL_EXPOSURE_LEEWAY_THRESHOLD);
  return axis * scale;
}

/**
 * Symmetric color scale on normalized position `t`.
 * Compare mode uses log weight ratio `log((wP+ε)/(wC+ε))`, then γ so modest gaps read as color;
 * axis min/max are ±max|axis| so the largest country-level gap always uses the full diverging ramp.
 */
function portfolioChoroplethDivergingInterpolator(t: number): string {
  const u = Math.min(1, Math.max(0, t));
  const stops = DIVERGING_RGB_STOPS;
  let i = 0;
  while (i < stops.length - 1) {
    const next = stops[i + 1];
    if (next === undefined || next.t >= u) break;
    i += 1;
  }
  const a = stops[i];
  const b = stops[i + 1];
  if (a === undefined) {
    return "rgb(255, 255, 255)";
  }
  if (b === undefined) {
    return `rgb(${a.r},${a.g},${a.b})`;
  }
  const span = b.t - a.t;
  const k = span > 0 ? (u - a.t) / span : 0;
  const r = Math.round(a.r + (b.r - a.r) * k);
  const g = Math.round(a.g + (b.g - a.g) * k);
  const bl = Math.round(a.b + (b.b - a.b) * k);
  return `rgb(${r},${g},${bl})`;
}

function weightByAtlasIdFromNormalized(
  norm: Record<string, number>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const [iso, w] of Object.entries(norm)) {
    if (iso === UNMAPPED_COUNTRY_KEY) continue;
    const numericId = alpha2ToNumeric(iso);
    if (numericId === undefined) continue;
    m.set(String(numericId), w);
  }
  return m;
}

/** CN/HK/MO each use the combined cluster weight so the choropleth matches the tooltip. */
function weightByAtlasIdForMapChoropleth(
  norm: Record<string, number>,
): Map<string, number> {
  const m = weightByAtlasIdFromNormalized(norm);
  const cluster = chinaMapClusterCombinedWeightFromNorm(norm);
  for (const iso of CHINA_MAP_CLUSTER_ALPHA2) {
    const numericId = alpha2ToNumeric(iso);
    if (numericId === undefined) continue;
    m.set(String(numericId), cluster);
  }
  return m;
}

type WorldCountryChoroplethProps = {
  countries: Record<string, number>;
  compareCountries: Record<string, number>;
  showDistributionCompare: boolean;
  worldMapCompareMode: boolean;
  selectedPortfolioLabel: string;
  comparePortfolioLabel: string;
  bucketTopHoldingsPrimary: Record<string, BucketTopHolding[]>;
  bucketTopHoldingsCompare: Record<string, BucketTopHolding[]>;
};

const FEATURE_ISO_BY_DATA_INDEX: readonly (string | null)[] =
  WORLD_COUNTRY_FEATURES.map((f) => numericAtlasIdToAlpha2Upper(String(f.id)));

export function WorldCountryChoropleth({
  countries,
  compareCountries,
  showDistributionCompare,
  worldMapCompareMode,
  selectedPortfolioLabel,
  comparePortfolioLabel,
  bucketTopHoldingsPrimary,
  bucketTopHoldingsCompare,
}: WorldCountryChoroplethProps) {
  const { data, options } = useMemo(() => {
    const labels = WORLD_COUNTRY_FEATURES.map(
      (f) => (f.properties as { name?: string } | null)?.name ?? "",
    );
    const normPrimary = normalizeCountryWeightsForDisplay(countries);
    const normCompare = normalizeCountryWeightsForDisplay(compareCountries);
    const compareMapMode = worldMapCompareMode && showDistributionCompare;

    const projectionScale = {
      axis: "x" as const,
      display: false,
      projection: "equalEarth" as const,
      projectionScale: 1,
      padding: 10,
    };

    const baseDataset = {
      outline: [WORLD_LAND_OUTLINE],
      showOutline: true,
      outlineBorderColor: "#94a3b8",
      outlineBorderWidth: 0.6,
      outlineBackgroundColor: "#e2e8f0",
    };

    let data: ChartData<"choropleth">;
    let colorOptions: ChartOptions<"choropleth">["scales"];

    if (compareMapMode) {
      const wPrimary = weightByAtlasIdForMapChoropleth(normPrimary);
      const wCompare = weightByAtlasIdForMapChoropleth(normCompare);
      const eps = MIN_PORTFOLIO_ALLOCATION_FRACTION;
      const logWeightRatio = (wP: number, wC: number) =>
        Math.log((wP + eps) / (wC + eps));
      const axisValues = WORLD_COUNTRY_FEATURES.map((feature) => {
        const id = String(feature.id);
        const wP = wPrimary.get(id) ?? 0;
        const wC = wCompare.get(id) ?? 0;
        return compareMapAxisWithSmallExposureLeeway(
          compareMapLogRatioToColorAxis(logWeightRatio(wP, wC)),
          wP,
          wC,
        );
      });
      const maxAbsAxis = axisValues.reduce(
        (m, v) => Math.max(m, Math.abs(v)),
        0,
      );
      const M = maxAbsAxis > 0 ? maxAbsAxis : NEAR_WHOLE_EPSILON;
      const dataPoints = WORLD_COUNTRY_FEATURES.map((feature, i) => ({
        feature,
        value: axisValues[i] ?? 0,
      }));
      data = {
        labels,
        datasets: [
          {
            label: "Log ratio selected / compare",
            data: dataPoints,
            ...baseDataset,
          },
        ],
      };
      colorOptions = {
        projection: projectionScale,
        color: {
          type: "color",
          axis: "x",
          display: false,
          interpolate: portfolioChoroplethDivergingInterpolator,
          missing: "rgba(226, 232, 240, 0.75)",
          min: -M,
          max: M,
        },
      };
    } else {
      const weightByAtlasId = weightByAtlasIdForMapChoropleth(normPrimary);
      const weights = [...weightByAtlasId.values()].filter((w) => w > 0);
      const maxW = weights.length ? Math.max(...weights) : 0;
      const minPos =
        weights.length > 0
          ? Math.max(Math.min(...weights), MIN_PORTFOLIO_ALLOCATION_FRACTION)
          : MIN_PORTFOLIO_ALLOCATION_FRACTION;
      const colorLogMin = minPos;
      let colorLogMax = maxW > 0 ? maxW : minPos;
      if (colorLogMax <= colorLogMin) {
        colorLogMax = colorLogMin * 10;
      }
      const dataPoints = WORLD_COUNTRY_FEATURES.map((feature) => {
        const id = String(feature.id);
        const w = weightByAtlasId.get(id) ?? 0;
        // Log color scale cannot use 0; NaN yields the `missing` fill for non-held countries.
        const value = w > 0 ? w : Number.NaN;
        return { feature, value };
      });
      data = {
        labels,
        datasets: [
          {
            label: "Share of portfolio",
            data: dataPoints,
            ...baseDataset,
          },
        ],
      };
      colorOptions = {
        projection: projectionScale,
        color: {
          type: "colorLogarithmic",
          axis: "x",
          display: false,
          interpolate: portfolioChoroplethBlueInterpolator,
          missing: "rgba(226, 232, 240, 0.75)",
          min: colorLogMin,
          max: colorLogMax,
        },
      };
    }

    const options: ChartOptions<"choropleth"> = {
      maintainAspectRatio: false,
      scales: colorOptions,
      plugins: {
        legend: { display: false },
      },
    };

    return {
      data,
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          ...choroplethDistributionTooltipPlugin({
            showCompare: showDistributionCompare,
            primaryLabel: selectedPortfolioLabel,
            compareLabel: comparePortfolioLabel,
            featureIsoByDataIndex: FEATURE_ISO_BY_DATA_INDEX,
            normPrimary,
            normCompare,
            topHoldingsPrimary: bucketTopHoldingsPrimary,
            topHoldingsCompare: bucketTopHoldingsCompare,
            singleSeriesColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary,
            comparePrimaryColor:
              PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary,
            compareSecondaryColor:
              PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryCompare,
          }),
        },
      },
    };
  }, [
    countries,
    compareCountries,
    showDistributionCompare,
    worldMapCompareMode,
    selectedPortfolioLabel,
    comparePortfolioLabel,
    bucketTopHoldingsPrimary,
    bucketTopHoldingsCompare,
  ]);

  return (
    <div
      role="img"
      aria-label="World map of portfolio allocation by country"
      className="w-full h-[min(52vh,520px)] min-h-[320px]"
    >
      <Chart type="choropleth" data={data} options={options} />
    </div>
  );
}

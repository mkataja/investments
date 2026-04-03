import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import type { ChartData, ChartOptions } from "chart.js";
import { alpha2ToNumeric } from "i18n-iso-countries";
import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import {
  UNMAPPED_COUNTRY_KEY,
  normalizeCountryWeightsForDisplay,
} from "../../../lib/distributionDisplay";
import { formatToPercentage } from "../../../lib/numberFormat";
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

type WorldCountryChoroplethProps = {
  countries: Record<string, number>;
};

export function WorldCountryChoropleth({
  countries,
}: WorldCountryChoroplethProps) {
  const { data, options } = useMemo(() => {
    const norm = normalizeCountryWeightsForDisplay(countries);
    const weightByAtlasId = new Map<string, number>();
    for (const [iso, w] of Object.entries(norm)) {
      if (iso === UNMAPPED_COUNTRY_KEY) continue;
      const numericId = alpha2ToNumeric(iso);
      if (numericId === undefined) continue;
      weightByAtlasId.set(numericId, w);
    }
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

    const labels = WORLD_COUNTRY_FEATURES.map(
      (f) => (f.properties as { name?: string } | null)?.name ?? "",
    );
    const dataPoints = WORLD_COUNTRY_FEATURES.map((feature) => {
      const id = String(feature.id);
      const w = weightByAtlasId.get(id) ?? 0;
      // Log color scale cannot use 0; NaN yields the `missing` fill for non-held countries.
      const value = w > 0 ? w : Number.NaN;
      return { feature, value };
    });

    const data: ChartData<"choropleth"> = {
      labels,
      datasets: [
        {
          label: "Share of portfolio",
          data: dataPoints,
          outline: [WORLD_LAND_OUTLINE],
          showOutline: true,
          outlineBorderColor: "#94a3b8",
          outlineBorderWidth: 0.6,
          outlineBackgroundColor: "#e2e8f0",
        },
      ],
    };

    const options: ChartOptions<"choropleth"> = {
      maintainAspectRatio: false,
      scales: {
        projection: {
          axis: "x",
          display: false,
          projection: "equalEarth",
          projectionScale: 1,
          padding: 10,
        },
        color: {
          type: "colorLogarithmic",
          axis: "x",
          display: false,
          interpolate: portfolioChoroplethBlueInterpolator,
          missing: "rgba(226, 232, 240, 0.75)",
          min: colorLogMin,
          max: colorLogMax,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              if (i === undefined) return "";
              return labels[i] ?? "";
            },
            label: (item) => {
              const raw = item.raw as { value?: number };
              const v = raw.value;
              if (typeof v !== "number" || !Number.isFinite(v)) {
                return "0%";
              }
              return formatToPercentage(v);
            },
          },
        },
      },
    };

    return { data, options };
  }, [countries]);

  return (
    <div role="img" aria-label="World map of portfolio allocation by country">
      <div className="w-full h-[min(52vh,520px)] min-h-[320px]">
        <Chart type="choropleth" data={data} options={options} />
      </div>
    </div>
  );
}

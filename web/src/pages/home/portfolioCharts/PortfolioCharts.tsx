import type { ChartData, ChartOptions } from "chart.js";
import { Suspense, lazy, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import Skeleton from "react-loading-skeleton";
import { classNames } from "../../../lib/css";
import {
  type PortfolioChartsProps,
  usePortfolioCharts,
} from "./usePortfolioCharts";

const WorldCountryChoropleth = lazy(async () => ({
  default: (await import("./WorldCountryChoropleth")).WorldCountryChoropleth,
}));

export function PortfolioCharts(props: PortfolioChartsProps) {
  const [assetMixHistoryStacked, setAssetMixHistoryStacked] = useState(false);
  const {
    portfolio,
    countryChartContainerRef,
    countryChartYZoomed,
    assetMixPieData,
    showBondMixSection,
    assetMixPieChartData,
    assetMixPieOptions,
    bondPieChartData,
    bondPieOptions,
    regionBarData,
    regionBarOptions,
    sectorBarData,
    sectorBarOptions,
    countryBarData,
    countryBarOptions,
    assetMixLineData,
    assetMixLineOptions,
    assetMixHistoryChartKind,
  } = usePortfolioCharts(props, {
    assetMixHistoryStacked,
  });

  return (
    <section className="page-section w-full min-w-0">
      <div className="min-w-0">
        <h2 className="mb-0">Distributions</h2>
        <p className="text-slate-600">
          Total estimated portfolio value:{" "}
          <span className="font-semibold">
            <span className="tabular-nums">
              {(
                portfolio.totalValueEur - portfolio.emergencyFundSliceEur
              ).toFixed(0)}
            </span>{" "}
            EUR
          </span>{" "}
          {portfolio.emergencyFundSliceEur > 0 ? (
            <>
              (plus{" "}
              <span className="tabular-nums">
                {portfolio.emergencyFundSliceEur.toFixed(0)}
              </span>{" "}
              EUR emergency fund)
            </>
          ) : null}
        </p>
      </div>

      <div className="w-full min-w-0 flex flex-col gap-6">
        {portfolio.totalValueEur > 0 && assetMixPieData.length > 0 ? (
          <div
            className={classNames(
              "w-full min-w-0 grid gap-4 justify-items-start",
              showBondMixSection && "grid-cols-1 md:grid-cols-2",
            )}
          >
            <div className="subsection-stack w-full">
              <h3>Asset mix</h3>
              <div className="h-48">
                <Doughnut
                  data={assetMixPieChartData}
                  options={assetMixPieOptions}
                />
              </div>
            </div>
            {showBondMixSection ? (
              <div className="subsection-stack w-full">
                <h3>Bond mix</h3>
                <div className="h-48">
                  <Doughnut data={bondPieChartData} options={bondPieOptions} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="min-w-0 subsection-stack">
            <h3 className="shrink-0">Regions</h3>
            <div className="w-full h-[540px]">
              <Bar data={regionBarData} options={regionBarOptions} />
            </div>
          </div>
          <div className="min-w-0 subsection-stack">
            <h3 className="shrink-0">Sectors (equities)</h3>
            <div className="w-full h-[540px]">
              <Bar data={sectorBarData} options={sectorBarOptions} />
            </div>
          </div>
        </div>
        <div className="min-w-0 subsection-stack">
          <h3 className="shrink-0">Countries</h3>
          <div
            ref={countryChartContainerRef}
            className={`w-full h-[540px] ${countryChartYZoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          >
            <Bar data={countryBarData} options={countryBarOptions} />
          </div>
          <Suspense
            fallback={
              <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 mt-4">
                <div className="px-2 sm:px-4">
                  <Skeleton className="h-[min(52vh,520px)] min-h-[300px] w-full rounded-md" />
                </div>
              </div>
            }
          >
            <WorldCountryChoropleth countries={portfolio.countries} />
          </Suspense>
        </div>
        {props.assetMixHistoryPoints.length > 0 ? (
          <div className="subsection-stack w-full min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h3 className="mb-0 shrink-0">Asset mix over time</h3>
              <label className="inline-flex cursor-pointer items-center gap-2 select-none text-sm text-slate-600">
                <span className="relative inline-block h-6 w-11 shrink-0">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={assetMixHistoryStacked}
                    onChange={(e) =>
                      setAssetMixHistoryStacked(e.target.checked)
                    }
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-slate-200 transition peer-checked:bg-emerald-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-500"
                  />
                  <span
                    aria-hidden
                    className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[1.25rem]"
                  />
                </span>
                <span>Stacked bars</span>
              </label>
            </div>
            <div className="w-full h-[448px] min-w-0">
              {assetMixHistoryChartKind === "bar" ? (
                <Bar
                  data={assetMixLineData as ChartData<"bar">}
                  options={assetMixLineOptions as ChartOptions<"bar">}
                />
              ) : (
                <Line
                  data={assetMixLineData as ChartData<"line">}
                  options={assetMixLineOptions as ChartOptions<"line">}
                />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

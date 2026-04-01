import { Bar, Doughnut, Pie } from "react-chartjs-2";
import { pieChartLeftAlignPlugin } from "../../../lib/chart/pieChartLeftAlignPlugin";
import {
  type PortfolioChartsProps,
  usePortfolioCharts,
} from "./usePortfolioCharts";

export function PortfolioCharts(props: PortfolioChartsProps) {
  const {
    portfolio,
    comparePortfolio,
    showDistributionCompare,
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
  } = usePortfolioCharts(props);

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
          {portfolio.mixedCurrencyWarning && (
            <span className="text-amber-700 ml-2">
              Mixed-currency warning (see API).
            </span>
          )}
        </p>
      </div>

      <div className="w-full min-w-0 flex flex-col gap-6">
        {portfolio.totalValueEur > 0 && assetMixPieData.length > 0 ? (
          <div
            className={`w-full min-w-0 grid gap-4 justify-items-start ${showBondMixSection ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "max-w-xl"}`}
          >
            <div className="min-w-0 subsection-stack w-full">
              <h3>Asset mix</h3>
              <div className="h-48 w-full min-w-0">
                {showDistributionCompare && comparePortfolio ? (
                  <Doughnut
                    data={assetMixPieChartData}
                    options={assetMixPieOptions}
                    plugins={[pieChartLeftAlignPlugin]}
                  />
                ) : (
                  <Pie
                    data={assetMixPieChartData}
                    options={assetMixPieOptions}
                    plugins={[pieChartLeftAlignPlugin]}
                  />
                )}
              </div>
            </div>
            {showBondMixSection ? (
              <div className="min-w-0 subsection-stack w-full">
                <h3>Bond mix</h3>
                <div className="h-48 w-full min-w-0">
                  {showDistributionCompare && comparePortfolio ? (
                    <Doughnut
                      data={bondPieChartData}
                      options={bondPieOptions}
                      plugins={[pieChartLeftAlignPlugin]}
                    />
                  ) : (
                    <Pie
                      data={bondPieChartData}
                      options={bondPieOptions}
                      plugins={[pieChartLeftAlignPlugin]}
                    />
                  )}
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
        </div>
      </div>
    </section>
  );
}

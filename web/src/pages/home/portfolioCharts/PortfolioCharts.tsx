import { Bar, Doughnut, Line, Pie } from "react-chartjs-2";
import { classNames } from "../../../lib/css";
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
    assetMixLineData,
    assetMixLineOptions,
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
            className={classNames(
              "w-full min-w-0 grid gap-4 justify-items-start",
              showBondMixSection && "grid-cols-1 md:grid-cols-2",
            )}
          >
            <div className="subsection-stack w-full">
              <h3>Asset mix</h3>
              <div className="h-48">
                {showDistributionCompare && comparePortfolio ? (
                  <Doughnut
                    data={assetMixPieChartData}
                    options={assetMixPieOptions}
                  />
                ) : (
                  <Pie
                    data={assetMixPieChartData}
                    options={assetMixPieOptions}
                  />
                )}
              </div>
            </div>
            {showBondMixSection ? (
              <div className="subsection-stack w-full">
                <h3>Bond mix</h3>
                <div className="h-48">
                  {showDistributionCompare && comparePortfolio ? (
                    <Doughnut
                      data={bondPieChartData}
                      options={bondPieOptions}
                    />
                  ) : (
                    <Pie data={bondPieChartData} options={bondPieOptions} />
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
        {props.assetMixHistoryPoints.length > 0 ? (
          <div className="subsection-stack w-full min-w-0">
            <h3>Asset mix over time (POC)</h3>
            <p className="text-slate-600 text-sm mb-2">
              Weekly equities vs cash in EUR (non–cash-account vs cash
              positions). Series stops when a price is missing for a held
              instrument.
            </p>
            <div className="w-full h-[448px] min-w-0">
              <Line data={assetMixLineData} options={assetMixLineOptions} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

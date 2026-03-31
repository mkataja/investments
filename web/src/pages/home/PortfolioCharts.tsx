import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DistributionBarChartTooltip } from "../../components/PortfolioChartTooltips";
import {
  allCountriesChartData,
  allCountriesChartDataDual,
  portfolioRegionBarRows,
  portfolioRegionBarRowsDual,
  portfolioSectorBarRows,
  portfolioSectorBarRowsDual,
} from "../../lib/distributionDisplay";
import { formatToPercentage } from "../../lib/numberFormat";
import type { PortfolioDistributions } from "./types";

const ASSET_MIX_COLORS = {
  equities: "#0f766e",
  bonds: "#6d28d9",
  cashInFunds: "#14b8a6",
  cashExcess: "#0369a1",
} as const;

const DIST_CHART_COLORS = {
  regionPrimary: "#0369a1",
  regionCompare: "#38bdf8",
  sectorPrimary: "#0369a1",
  sectorCompare: "#38bdf8",
  countryPrimary: "#0369a1",
  countryCompare: "#38bdf8",
} as const;

const chartAxisTickStyle = { fontSize: "0.9rem" };
const chartLegendStyle = { fontSize: "0.8rem" };

function barChartMargin(showTopLegend: boolean) {
  return {
    top: showTopLegend ? 28 : 6,
    right: 6,
    left: 36,
    bottom: 48,
  } as const;
}

type PortfolioChartsProps = {
  portfolio: PortfolioDistributions;
  comparePortfolio: PortfolioDistributions | null;
  showDistributionCompare: boolean;
  selectedPortfolioLabel: string;
  comparePortfolioLabel: string;
};

export function PortfolioCharts({
  portfolio,
  comparePortfolio,
  showDistributionCompare,
  selectedPortfolioLabel,
  comparePortfolioLabel,
}: PortfolioChartsProps) {
  const regionBarChartData = useMemo(() => {
    if (!showDistributionCompare) {
      return portfolioRegionBarRows(portfolio.regions);
    }
    return portfolioRegionBarRowsDual(
      portfolio.regions,
      comparePortfolio?.regions ?? {},
    );
  }, [portfolio.regions, comparePortfolio?.regions, showDistributionCompare]);

  const sectorBarChartData = useMemo(() => {
    if (!showDistributionCompare) {
      return portfolioSectorBarRows(portfolio.sectors);
    }
    return portfolioSectorBarRowsDual(
      portfolio.sectors,
      comparePortfolio?.sectors ?? {},
    );
  }, [portfolio.sectors, comparePortfolio?.sectors, showDistributionCompare]);

  const countryBarChartData = useMemo(() => {
    if (!showDistributionCompare) {
      return allCountriesChartData(portfolio.countries);
    }
    return allCountriesChartDataDual(
      portfolio.countries,
      comparePortfolio?.countries ?? {},
    );
  }, [
    portfolio.countries,
    comparePortfolio?.countries,
    showDistributionCompare,
  ]);

  const assetMixPieData = useMemo(() => {
    const aa = portfolio.assetAllocation;
    return [
      {
        name: "Equities",
        value: aa.equitiesEur,
        fill: ASSET_MIX_COLORS.equities,
      },
      { name: "Bonds", value: aa.bondsEur, fill: ASSET_MIX_COLORS.bonds },
      {
        name: "Cash (funds)",
        value: aa.cashInFundsEur,
        fill: ASSET_MIX_COLORS.cashInFunds,
      },
      {
        name: "Cash (accounts; excess)",
        value: aa.cashExcessEur,
        fill: ASSET_MIX_COLORS.cashExcess,
      },
    ].filter((d) => d.value > 1e-9);
  }, [portfolio.assetAllocation]);

  const assetMixPieTotalEur = useMemo(
    () => assetMixPieData.reduce((s, d) => s + d.value, 0),
    [assetMixPieData],
  );

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-medium text-slate-800">
        Distributions (value-weighted)
      </h2>
      <p className="text-slate-600 text-sm">
        Total estimated:{" "}
        <span className="tabular-nums">
          {portfolio.totalValueEur.toFixed(0)}
        </span>{" "}
        EUR (incl.{" "}
        <span className="tabular-nums">
          {portfolio.assetAllocation.emergencyFundSliceEur.toFixed(2)}
        </span>{" "}
        EUR emergency fund)
        {portfolio.mixedCurrencyWarning && (
          <span className="text-amber-700 ml-2">
            Mixed-currency warning (see API).
          </span>
        )}
      </p>
      {portfolio.totalValueEur > 0 && assetMixPieData.length > 0 ? (
        <div className="max-w-md min-w-0">
          <h3 className="text-sm font-medium text-slate-700 mb-1">Asset mix</h3>
          <div className="aspect-[5/2] h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={assetMixPieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius="100%"
                  allowReorder="yes"
                  minAngle={5}
                >
                  {assetMixPieData.map((d) => (
                    <Cell key={d.name} fill={d.fill} stroke="#fff" />
                  ))}
                </Pie>
                <Tooltip
                  separator=": "
                  formatter={(v: number) =>
                    `${v.toFixed(0)} EUR (${formatToPercentage(v / assetMixPieTotalEur)})`
                  }
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="min-w-0 flex flex-col">
          <h3 className="text-sm font-medium text-slate-700 mb-2 shrink-0">
            Regions
          </h3>
          <div className="w-full h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={regionBarChartData}
                margin={barChartMargin(showDistributionCompare)}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  height={72}
                  tick={chartAxisTickStyle}
                  tickMargin={4}
                />
                <YAxis tick={chartAxisTickStyle} width={44} />
                <DistributionBarChartTooltip />
                {showDistributionCompare ? (
                  <>
                    <Bar
                      dataKey="primary"
                      fill={DIST_CHART_COLORS.regionPrimary}
                      name={selectedPortfolioLabel}
                    />
                    <Bar
                      dataKey="compare"
                      fill={DIST_CHART_COLORS.regionCompare}
                      name={comparePortfolioLabel}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={chartLegendStyle}
                    />
                  </>
                ) : (
                  <Bar
                    dataKey="value"
                    fill={DIST_CHART_COLORS.regionPrimary}
                    name="Weight"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="min-w-0 flex flex-col">
          <h3 className="text-sm font-medium text-slate-700 mb-2 shrink-0">
            Sectors
          </h3>
          <div className="w-full h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sectorBarChartData}
                margin={barChartMargin(showDistributionCompare)}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-35}
                  textAnchor="end"
                  height={72}
                  tick={chartAxisTickStyle}
                  tickMargin={4}
                />
                <YAxis tick={chartAxisTickStyle} width={44} />
                <DistributionBarChartTooltip />
                {showDistributionCompare ? (
                  <>
                    <Bar
                      dataKey="primary"
                      fill={DIST_CHART_COLORS.sectorPrimary}
                      name={selectedPortfolioLabel}
                    />
                    <Bar
                      dataKey="compare"
                      fill={DIST_CHART_COLORS.sectorCompare}
                      name={comparePortfolioLabel}
                    />
                    <Legend
                      verticalAlign="top"
                      height={28}
                      wrapperStyle={chartLegendStyle}
                    />
                  </>
                ) : (
                  <Bar
                    dataKey="value"
                    fill={DIST_CHART_COLORS.sectorPrimary}
                    name="Weight"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="min-w-0 flex flex-col">
        <h3 className="text-sm font-medium text-slate-700 mb-2 shrink-0">
          Countries
        </h3>
        <div className="w-full aspect-[2.2/1] min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={countryBarChartData}
              margin={barChartMargin(showDistributionCompare)}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                angle={-35}
                textAnchor="end"
                height={72}
                tick={chartAxisTickStyle}
                tickMargin={4}
              />
              <YAxis tick={chartAxisTickStyle} width={44} />
              <DistributionBarChartTooltip />
              {showDistributionCompare ? (
                <>
                  <Bar
                    dataKey="primary"
                    fill={DIST_CHART_COLORS.countryPrimary}
                    name={selectedPortfolioLabel}
                  />
                  <Bar
                    dataKey="compare"
                    fill={DIST_CHART_COLORS.countryCompare}
                    name={comparePortfolioLabel}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={chartLegendStyle}
                  />
                </>
              ) : (
                <Bar
                  dataKey="value"
                  fill={DIST_CHART_COLORS.countryPrimary}
                  name="Weight"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

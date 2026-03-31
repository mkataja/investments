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
import {
  DistributionBarChartTooltip,
  createDistributionBarTooltipContent,
} from "../../components/PortfolioChartTooltips";
import {
  DEFAULT_DISTRIBUTION_BAR_Y_AXIS_TICK_COUNT,
  distributionBarYAxisFromMax,
  maxDistributionBarChartValue,
} from "../../lib/distributionBarChartAxis";
import {
  allCountriesChartData,
  allCountriesChartDataDual,
  bondMixForDisplay,
  bondPrincipalShareFromMergedSectors,
  equitySectorsForDisplay,
  portfolioRegionBarRows,
  portfolioRegionBarRowsDual,
  portfolioSectorBarRows,
  portfolioSectorBarRowsDual,
} from "../../lib/distributionDisplay";
import { formatToPercentage } from "../../lib/numberFormat";
import { DISTRIBUTION_SECTOR_TITLES } from "../../lib/sectorTitles";
import type { PortfolioDistributions } from "./types";

const ASSET_MIX_COLORS = {
  equities: "#0f766e",
  bonds: "#6d28d9",
  cashInFunds: "#14b8a6",
  cashExcess: "#0369a1",
} as const;

const BOND_MIX_PIE_COLORS: Record<string, string> = {
  long_government_bonds: "#7c3aed",
  long_corporate_bonds: "#5b21b6",
  short_bonds: "#a78bfa",
  ultrashort_bonds: "#c4b5fd",
};

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

function PieSideLegend({
  items,
}: {
  items: readonly { name: string; fill: string }[];
}) {
  return (
    <ul className="m-0 flex min-w-0 flex-1 flex-col list-none items-start gap-1.5 p-0 text-left">
      {items.map((d) => (
        <li key={d.name} className="flex w-full min-w-0 items-start gap-2">
          <span
            aria-hidden
            className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-white shadow-sm"
            style={{ backgroundColor: d.fill }}
          />
          <span className="min-w-0 break-words text-base text-slate-700">
            {d.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Recharts tickFormatter(value, index) — only pass the numeric value to formatToPercentage.
function chartYAxisPercentTick(value: number) {
  return formatToPercentage(value, { decimalPlaces: 0 });
}

function barChartMargin() {
  return {
    top: 6,
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
  /** Labeled Y-axis ticks per distribution bar chart (including 0). Default 5. */
  distributionBarYAxisTickCount?: number;
};

export function PortfolioCharts({
  portfolio,
  comparePortfolio,
  showDistributionCompare,
  selectedPortfolioLabel,
  comparePortfolioLabel,
  distributionBarYAxisTickCount = DEFAULT_DISTRIBUTION_BAR_Y_AXIS_TICK_COUNT,
}: PortfolioChartsProps) {
  const distributionTooltipContent = useMemo(
    () =>
      createDistributionBarTooltipContent({
        showCompare: showDistributionCompare,
        primaryLabel: selectedPortfolioLabel,
        compareLabel: comparePortfolioLabel,
      }),
    [showDistributionCompare, selectedPortfolioLabel, comparePortfolioLabel],
  );

  const regionBarChartData = useMemo(() => {
    const th = portfolio.bucketTopHoldings?.regions ?? {};
    const thCmp = comparePortfolio?.bucketTopHoldings?.regions ?? {};
    if (!showDistributionCompare) {
      return portfolioRegionBarRows(portfolio.regions).map((r) => ({
        ...r,
        topHoldings: th[r.bucketKey] ?? [],
      }));
    }
    return portfolioRegionBarRowsDual(
      portfolio.regions,
      comparePortfolio?.regions ?? {},
    ).map((r) => ({
      ...r,
      topHoldingsPrimary: th[r.bucketKey] ?? [],
      topHoldingsCompare: thCmp[r.bucketKey] ?? [],
    }));
  }, [
    portfolio.regions,
    portfolio.bucketTopHoldings?.regions,
    comparePortfolio?.regions,
    comparePortfolio?.bucketTopHoldings?.regions,
    showDistributionCompare,
  ]);

  const equitySectorsPrimary = useMemo(
    () => equitySectorsForDisplay(portfolio.sectors),
    [portfolio.sectors],
  );
  const equitySectorsCompare = useMemo(
    () => equitySectorsForDisplay(comparePortfolio?.sectors ?? {}),
    [comparePortfolio?.sectors],
  );

  const sectorBarChartData = useMemo(() => {
    const th = portfolio.bucketTopHoldings?.sectors ?? {};
    const thCmp = comparePortfolio?.bucketTopHoldings?.sectors ?? {};
    if (!showDistributionCompare) {
      return portfolioSectorBarRows(equitySectorsPrimary).map((r) => ({
        ...r,
        topHoldings: th[r.bucketKey] ?? [],
      }));
    }
    return portfolioSectorBarRowsDual(
      equitySectorsPrimary,
      equitySectorsCompare,
    ).map((r) => ({
      ...r,
      topHoldingsPrimary: th[r.bucketKey] ?? [],
      topHoldingsCompare: thCmp[r.bucketKey] ?? [],
    }));
  }, [
    equitySectorsPrimary,
    equitySectorsCompare,
    portfolio.bucketTopHoldings?.sectors,
    comparePortfolio?.bucketTopHoldings?.sectors,
    showDistributionCompare,
  ]);

  const countryBarChartData = useMemo(() => {
    const th = portfolio.bucketTopHoldings?.countries ?? {};
    const thCmp = comparePortfolio?.bucketTopHoldings?.countries ?? {};
    if (!showDistributionCompare) {
      return allCountriesChartData(portfolio.countries).map((r) => ({
        ...r,
        topHoldings: th[r.bucketKey] ?? [],
      }));
    }
    return allCountriesChartDataDual(
      portfolio.countries,
      comparePortfolio?.countries ?? {},
    ).map((r) => ({
      ...r,
      topHoldingsPrimary: th[r.bucketKey] ?? [],
      topHoldingsCompare: thCmp[r.bucketKey] ?? [],
    }));
  }, [
    portfolio.countries,
    portfolio.bucketTopHoldings?.countries,
    comparePortfolio?.countries,
    comparePortfolio?.bucketTopHoldings?.countries,
    showDistributionCompare,
  ]);

  const regionYAxis = useMemo(
    () =>
      distributionBarYAxisFromMax(
        maxDistributionBarChartValue(
          regionBarChartData,
          showDistributionCompare,
        ),
        distributionBarYAxisTickCount,
      ),
    [
      regionBarChartData,
      showDistributionCompare,
      distributionBarYAxisTickCount,
    ],
  );

  const sectorYAxis = useMemo(
    () =>
      distributionBarYAxisFromMax(
        maxDistributionBarChartValue(
          sectorBarChartData,
          showDistributionCompare,
        ),
        distributionBarYAxisTickCount,
      ),
    [
      sectorBarChartData,
      showDistributionCompare,
      distributionBarYAxisTickCount,
    ],
  );

  const countryYAxis = useMemo(
    () =>
      distributionBarYAxisFromMax(
        maxDistributionBarChartValue(
          countryBarChartData,
          showDistributionCompare,
        ),
        distributionBarYAxisTickCount,
      ),
    [
      countryBarChartData,
      showDistributionCompare,
      distributionBarYAxisTickCount,
    ],
  );

  const assetMixPieData = useMemo(() => {
    const aa = portfolio.assetAllocation;
    const principalEur = aa.equitiesEur + aa.bondsEur;
    const bondW = bondPrincipalShareFromMergedSectors(portfolio.sectors);
    const bondsEur = principalEur * bondW;
    const equitiesEur = principalEur * (1 - bondW);
    return [
      {
        name: "Equities",
        value: equitiesEur,
        fill: ASSET_MIX_COLORS.equities,
      },
      {
        name: "Bonds (total)",
        value: bondsEur,
        fill: ASSET_MIX_COLORS.bonds,
      },
      {
        name: "Cash (in funds)",
        value: aa.cashInFundsEur,
        fill: ASSET_MIX_COLORS.cashInFunds,
      },
      {
        name: "Cash (in accounts - excluding emergency fund)",
        value: aa.cashExcessEur,
        fill: ASSET_MIX_COLORS.cashExcess,
      },
    ].filter((d) => d.value > 1e-9);
  }, [portfolio.assetAllocation, portfolio.sectors]);

  const assetMixPieTotalEur = useMemo(
    () => assetMixPieData.reduce((s, d) => s + d.value, 0),
    [assetMixPieData],
  );

  const bondMixPieData = useMemo(() => {
    const mix = bondMixForDisplay(portfolio.sectors);
    return Object.entries(mix)
      .filter(([, v]) => v > 1e-9)
      .sort((a, b) => b[1] - a[1])
      .map(([id, value]) => ({
        name:
          DISTRIBUTION_SECTOR_TITLES[
            id as keyof typeof DISTRIBUTION_SECTOR_TITLES
          ] ?? id,
        value,
        fill: BOND_MIX_PIE_COLORS[id] ?? ASSET_MIX_COLORS.bonds,
      }));
  }, [portfolio.sectors]);

  return (
    <section className="page-section w-full min-w-0">
      <div className="min-w-0">
        <h2 className="mb-0">Distributions</h2>
        <p className="text-slate-600">
          Total estimated portfolio value:{" "}
          <span className="font-semibold">
            <span className="tabular-nums">
              {(
                portfolio.totalValueEur -
                portfolio.assetAllocation.emergencyFundSliceEur
              ).toFixed(0)}
            </span>{" "}
            EUR
          </span>{" "}
          (plus{" "}
          <span className="tabular-nums">
            {portfolio.assetAllocation.emergencyFundSliceEur.toFixed(0)}
          </span>{" "}
          EUR emergency fund)
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
            className={`w-full min-w-0 grid gap-4 justify-items-start ${bondMixPieData.length > 0 ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "max-w-xl"}`}
          >
            <div className="min-w-0 subsection-stack w-full">
              <h3>Asset mix</h3>
              <div className="flex w-full min-w-0 flex-row items-center justify-start gap-4">
                <div className="h-48 w-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        cx="50%"
                        cy="50%"
                        outerRadius="100%"
                        data={assetMixPieData}
                        dataKey="value"
                        nameKey="name"
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
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <PieSideLegend items={assetMixPieData} />
              </div>
            </div>
            {bondMixPieData.length > 0 ? (
              <div className="min-w-0 subsection-stack w-full">
                <h3>Bond mix</h3>
                <div className="flex w-full min-w-0 flex-row items-center justify-start gap-4">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          cx="50%"
                          cy="50%"
                          outerRadius="100%"
                          data={bondMixPieData}
                          dataKey="value"
                          nameKey="name"
                          allowReorder="yes"
                          minAngle={5}
                        >
                          {bondMixPieData.map((d) => (
                            <Cell key={d.name} fill={d.fill} stroke="#fff" />
                          ))}
                        </Pie>
                        <Tooltip
                          separator=": "
                          formatter={(v: number) =>
                            formatToPercentage(v, { decimalPlaces: 1 })
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <PieSideLegend items={bondMixPieData} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="min-w-0 subsection-stack">
            <h3 className="shrink-0">Regions</h3>
            <div className="w-full h-[540px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regionBarChartData} margin={barChartMargin()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={72}
                    tick={chartAxisTickStyle}
                    tickMargin={4}
                  />
                  <YAxis
                    tick={chartAxisTickStyle}
                    width={8}
                    domain={regionYAxis.domain}
                    ticks={regionYAxis.ticks}
                    tickFormatter={chartYAxisPercentTick}
                  />
                  <DistributionBarChartTooltip
                    content={distributionTooltipContent}
                  />
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
          <div className="min-w-0 subsection-stack">
            <h3 className="shrink-0">Sectors (equities)</h3>
            <div className="w-full h-[540px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorBarChartData} margin={barChartMargin()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    angle={-35}
                    textAnchor="end"
                    height={72}
                    tick={chartAxisTickStyle}
                    tickMargin={4}
                  />
                  <YAxis
                    tick={chartAxisTickStyle}
                    width={8}
                    domain={sectorYAxis.domain}
                    ticks={sectorYAxis.ticks}
                    tickFormatter={chartYAxisPercentTick}
                  />
                  <DistributionBarChartTooltip
                    content={distributionTooltipContent}
                  />
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
        <div className="min-w-0 subsection-stack">
          <h3 className="shrink-0">Countries</h3>
          <div className="w-full h-[540px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryBarChartData} margin={barChartMargin()}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  height={1}
                  tick={chartAxisTickStyle}
                  tickMargin={4}
                />
                <YAxis
                  tick={chartAxisTickStyle}
                  width={8}
                  domain={countryYAxis.domain}
                  ticks={countryYAxis.ticks}
                  tickFormatter={chartYAxisPercentTick}
                />
                <DistributionBarChartTooltip
                  content={distributionTooltipContent}
                />
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
      </div>
    </section>
  );
}

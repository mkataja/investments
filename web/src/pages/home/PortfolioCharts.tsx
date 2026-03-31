import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  secondLargestMainPortfolioBarValue,
} from "../../lib/distributionBarChartAxis";
import {
  equitySectorsForDisplay,
  portfolioRegionBarRows,
  portfolioRegionBarRowsDual,
  portfolioSectorBarRows,
  portfolioSectorBarRowsDual,
  topCountriesChartData,
  topCountriesChartDataDual,
} from "../../lib/distributionDisplay";
import { formatToPercentage } from "../../lib/numberFormat";
import {
  PORTFOLIO_ASSET_MIX_COLORS,
  PORTFOLIO_BOND_MIX_PIE_COLORS,
  PORTFOLIO_DISTRIBUTION_BAR_COLORS,
} from "../../lib/portfolioChartPalette";
import { DISTRIBUTION_SECTOR_TITLES } from "../../lib/sectorTitles";
import type { PortfolioDistributions } from "./types";

const chartAxisTickStyle = { fontSize: "0.9rem" };
const chartLegendStyle = { fontSize: "0.8rem" };
const distributionBarChartGridStroke = "#e2e8f0";

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

function CountryChartZoomActiveIcon() {
  return (
    <svg
      className="h-8 w-8"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function barChartMargin() {
  return {
    top: 6,
    right: 6,
    left: 36,
    bottom: 48,
  } as const;
}

/** Target horizontal space per country bar (matches resize-driven row cap). */
const COUNTRY_BAR_CHART_PX_PER_ENTRY = 36;
/** Before the first `ResizeObserver` callback, approximate bar count for SSR/first paint. */
const COUNTRY_BAR_CHART_WIDTH_FALLBACK_PX = 800;

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

  const countryChartContainerRef = useRef<HTMLDivElement>(null);
  const [countryChartWidthPx, setCountryChartWidthPx] = useState(0);

  useLayoutEffect(() => {
    const el = countryChartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (typeof w === "number" && Number.isFinite(w)) {
        setCountryChartWidthPx(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const countryChartEntryCount = useMemo(() => {
    const w =
      countryChartWidthPx > 0
        ? countryChartWidthPx
        : COUNTRY_BAR_CHART_WIDTH_FALLBACK_PX;
    return Math.max(1, Math.floor(w / COUNTRY_BAR_CHART_PX_PER_ENTRY));
  }, [countryChartWidthPx]);

  const countryBarChartData = useMemo(() => {
    const th = portfolio.bucketTopHoldings?.countries ?? {};
    const thCmp = comparePortfolio?.bucketTopHoldings?.countries ?? {};
    if (!showDistributionCompare) {
      return topCountriesChartData(
        portfolio.countries,
        countryChartEntryCount,
      ).map((r) => ({
        ...r,
        topHoldings: th[r.bucketKey] ?? [],
      }));
    }
    return topCountriesChartDataDual(
      portfolio.countries,
      comparePortfolio?.countries ?? {},
      countryChartEntryCount,
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
    countryChartEntryCount,
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

  const [countryChartYZoomed, setCountryChartYZoomed] = useState(false);

  const countryYAxis = useMemo(() => {
    const maxData01 = maxDistributionBarChartValue(
      countryBarChartData,
      showDistributionCompare,
    );
    const base = distributionBarYAxisFromMax(
      maxData01,
      distributionBarYAxisTickCount,
    );
    if (!countryChartYZoomed) return base;
    const secondMax = secondLargestMainPortfolioBarValue(
      countryBarChartData,
      showDistributionCompare,
    );
    if (secondMax !== undefined && secondMax > 0) {
      return distributionBarYAxisFromMax(
        secondMax,
        distributionBarYAxisTickCount,
      );
    }
    return distributionBarYAxisFromMax(
      base.domain[1] / 2,
      distributionBarYAxisTickCount,
    );
  }, [
    countryBarChartData,
    showDistributionCompare,
    distributionBarYAxisTickCount,
    countryChartYZoomed,
  ]);

  const assetMixPieDataRaw = useMemo(() => {
    const m = portfolio.assetMix;
    return [
      {
        name: "Equities",
        value: m.equitiesEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.equities,
      },
      {
        name: "Bonds (total)",
        value: m.bondsTotalEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.bonds,
      },
      {
        name: "Cash (in funds)",
        value: m.cashInFundsEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.cashInFunds,
      },
      {
        name: "Cash (in accounts - excluding emergency fund)",
        value: m.cashExcessEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.cashExcess,
      },
    ];
  }, [portfolio.assetMix]);

  const assetMixPieTotalEur = useMemo(
    () => assetMixPieDataRaw.reduce((s, d) => s + d.value, 0),
    [assetMixPieDataRaw],
  );

  const assetMixPieData = useMemo(() => {
    const t = assetMixPieTotalEur;
    if (!(t > 0)) {
      return [];
    }
    return assetMixPieDataRaw.filter(
      (d) => d.value / t >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
    );
  }, [assetMixPieDataRaw, assetMixPieTotalEur]);

  const bondMixPieData = useMemo(
    () =>
      portfolio.bondMix.map((s) => ({
        name:
          DISTRIBUTION_SECTOR_TITLES[
            s.sectorId as keyof typeof DISTRIBUTION_SECTOR_TITLES
          ] ?? s.sectorId,
        value: s.weight,
        fill:
          PORTFOLIO_BOND_MIX_PIE_COLORS[s.sectorId] ??
          PORTFOLIO_ASSET_MIX_COLORS.bonds,
      })),
    [portfolio.bondMix],
  );

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
          (plus{" "}
          <span className="tabular-nums">
            {portfolio.emergencyFundSliceEur.toFixed(0)}
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
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={distributionBarChartGridStroke}
                  />
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
                        fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary}
                        name={selectedPortfolioLabel}
                      />
                      <Bar
                        dataKey="compare"
                        fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionCompare}
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
                      fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary}
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
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={distributionBarChartGridStroke}
                  />
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
                        fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorPrimary}
                        name={selectedPortfolioLabel}
                      />
                      <Bar
                        dataKey="compare"
                        fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorCompare}
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
                      fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorPrimary}
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
          <div
            ref={countryChartContainerRef}
            className={`relative w-full h-[540px] ${countryChartYZoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          >
            {countryChartYZoomed ? (
              <div
                className="pointer-events-none absolute right-2 top-2 z-10 text-slate-500"
                aria-hidden
              >
                <CountryChartZoomActiveIcon />
              </div>
            ) : null}
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={countryBarChartData}
                margin={barChartMargin()}
                onClick={() => setCountryChartYZoomed((z) => !z)}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={distributionBarChartGridStroke}
                />
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
                  allowDataOverflow={countryChartYZoomed}
                />
                <DistributionBarChartTooltip
                  content={distributionTooltipContent}
                />
                {showDistributionCompare ? (
                  <>
                    <Bar
                      dataKey="primary"
                      fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary}
                      name={selectedPortfolioLabel}
                    />
                    <Bar
                      dataKey="compare"
                      fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryCompare}
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
                    fill={PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary}
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

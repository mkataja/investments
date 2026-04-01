import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib";
import type { ChartOptions } from "chart.js";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bar, Pie } from "react-chartjs-2";
import {
  type DistributionBarChartRow,
  distributionBarChartTooltipPlugin,
} from "../../components/PortfolioChartTooltips";
import "../../lib/chart/registerChartJs";
import { CHART_TOOLTIP_BASE } from "../../lib/chart/chartTooltipTheme";
import { pieChartLeftAlignPlugin } from "../../lib/chart/pieChartLeftAlignPlugin";
import { adjustPieValuesForMinAngleDegrees } from "../../lib/chart/pieMinAngle";
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

const distributionBarChartGridStroke = "#e2e8f0";

/** Minimum arc per non-zero pie slice (Chart.js has no built-in; see {@link adjustPieValuesForMinAngleDegrees}). */
const PIE_MIN_SLICE_DEGREES = 6;

/** Inset between canvas edge and pie arc (right is set by {@link pieChartLeftAlignPlugin}). */
const pieChartLayoutPadding = {
  top: 10,
  right: 0,
  bottom: 10,
  left: 0,
} as const;

/** Native Chart.js legend beside the pie (same point style as distribution bar charts). */
const pieChartLegendOptions: NonNullable<
  ChartOptions<"pie">["plugins"]
>["legend"] = {
  display: true,
  position: "right",
  labels: {
    boxWidth: 12,
    boxHeight: 12,
    padding: 10,
    font: { size: 14 },
    usePointStyle: true,
    pointStyle: "rectRounded",
  },
};

/** Target horizontal space per country bar (matches resize-driven row cap). */
const COUNTRY_BAR_CHART_PX_PER_ENTRY = 42;
/** Before the first `ResizeObserver` callback, approximate bar count for SSR/first paint. */
const COUNTRY_BAR_CHART_WIDTH_FALLBACK_PX = 800;

function yStepFromAxis(axis: { domain: [number, number]; ticks: number[] }) {
  const t0 = axis.ticks[0];
  const t1 = axis.ticks[1];
  if (typeof t0 === "number" && typeof t1 === "number") {
    return t1 - t0;
  }
  return axis.domain[1];
}

function distributionBarOptions(args: {
  rows: DistributionBarChartRow[];
  yAxis: { domain: [number, number]; ticks: number[] };
  tooltip: {
    showCompare: boolean;
    primaryLabel: string;
    compareLabel: string;
  };
  xLabels: "slanted" | "compact";
  showLegend: boolean;
  onClick?: ChartOptions<"bar">["onClick"];
}): ChartOptions<"bar"> {
  const step = yStepFromAxis(args.yAxis);
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 420 },
    onClick: args.onClick,
    datasets: {
      bar: {
        borderRadius: 2,
        borderSkipped: false,
      },
    },
    plugins: {
      legend: {
        display: args.showLegend,
        position: "top",
        align: "end",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 14,
          font: { size: 14 },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      ...distributionBarChartTooltipPlugin(args.rows, args.tooltip),
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 14 },
          color: "#475569",
          maxRotation: args.xLabels === "slanted" ? 40 : 0,
          minRotation: args.xLabels === "slanted" ? 32 : 0,
          autoSkip: true,
        },
      },
      y: {
        min: 0,
        max: args.yAxis.domain[1],
        ticks: {
          stepSize: step,
          callback: (tickValue) =>
            formatToPercentage(
              typeof tickValue === "number" ? tickValue : Number(tickValue),
              { decimalPlaces: 0 },
            ),
        },
        grid: {
          color: distributionBarChartGridStroke,
          lineWidth: 1,
          drawTicks: false,
        },
        border: { display: false },
      },
    },
  };
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
  const tooltipMeta = useMemo(
    () => ({
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
        name: DISTRIBUTION_SECTOR_TITLES.commodity_gold,
        value: m.commodityGoldEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.commodityGold,
      },
      {
        name: DISTRIBUTION_SECTOR_TITLES.commodity_silver,
        value: m.commoditySilverEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.commoditySilver,
      },
      {
        name: DISTRIBUTION_SECTOR_TITLES.commodity_other,
        value: m.commodityOtherEur,
        fill: PORTFOLIO_ASSET_MIX_COLORS.commodityOther,
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

  const regionBarData = useMemo(() => {
    const labels = regionBarChartData.map((r) => r.name);
    if (showDistributionCompare) {
      const rows = regionBarChartData as Array<{
        name: string;
        primary: number;
        compare: number;
      }>;
      return {
        labels,
        datasets: [
          {
            label: selectedPortfolioLabel,
            data: rows.map((r) => r.primary ?? 0),
            backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary,
          },
          {
            label: comparePortfolioLabel,
            data: rows.map((r) => r.compare ?? 0),
            backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionCompare,
          },
        ],
      };
    }
    const rows = regionBarChartData as Array<{ name: string; value: number }>;
    return {
      labels,
      datasets: [
        {
          label: "Weight",
          data: rows.map((r) => r.value ?? 0),
          backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary,
        },
      ],
    };
  }, [
    regionBarChartData,
    showDistributionCompare,
    selectedPortfolioLabel,
    comparePortfolioLabel,
  ]);

  const sectorBarData = useMemo(() => {
    const labels = sectorBarChartData.map((r) => r.name);
    if (showDistributionCompare) {
      const rows = sectorBarChartData as Array<{
        name: string;
        primary: number;
        compare: number;
      }>;
      return {
        labels,
        datasets: [
          {
            label: selectedPortfolioLabel,
            data: rows.map((r) => r.primary ?? 0),
            backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorPrimary,
          },
          {
            label: comparePortfolioLabel,
            data: rows.map((r) => r.compare ?? 0),
            backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorCompare,
          },
        ],
      };
    }
    const rows = sectorBarChartData as Array<{ name: string; value: number }>;
    return {
      labels,
      datasets: [
        {
          label: "Weight",
          data: rows.map((r) => r.value ?? 0),
          backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorPrimary,
        },
      ],
    };
  }, [
    sectorBarChartData,
    showDistributionCompare,
    selectedPortfolioLabel,
    comparePortfolioLabel,
  ]);

  const countryBarData = useMemo(() => {
    const labels = countryBarChartData.map((r) => r.name);
    if (showDistributionCompare) {
      const rows = countryBarChartData as Array<{
        name: string;
        primary: number;
        compare: number;
      }>;
      return {
        labels,
        datasets: [
          {
            label: selectedPortfolioLabel,
            data: rows.map((r) => r.primary ?? 0),
            backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary,
          },
          {
            label: comparePortfolioLabel,
            data: rows.map((r) => r.compare ?? 0),
            backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryCompare,
          },
        ],
      };
    }
    const rows = countryBarChartData as Array<{ name: string; value: number }>;
    return {
      labels,
      datasets: [
        {
          label: "Weight",
          data: rows.map((r) => r.value ?? 0),
          backgroundColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary,
        },
      ],
    };
  }, [
    countryBarChartData,
    showDistributionCompare,
    selectedPortfolioLabel,
    comparePortfolioLabel,
  ]);

  const regionBarOptions = useMemo(
    () =>
      distributionBarOptions({
        rows: regionBarChartData,
        yAxis: regionYAxis,
        tooltip: tooltipMeta,
        xLabels: "slanted",
        showLegend: showDistributionCompare,
      }),
    [regionBarChartData, regionYAxis, tooltipMeta, showDistributionCompare],
  );

  const sectorBarOptions = useMemo(
    () =>
      distributionBarOptions({
        rows: sectorBarChartData,
        yAxis: sectorYAxis,
        tooltip: tooltipMeta,
        xLabels: "slanted",
        showLegend: showDistributionCompare,
      }),
    [sectorBarChartData, sectorYAxis, tooltipMeta, showDistributionCompare],
  );

  const countryBarOptions = useMemo(
    () =>
      distributionBarOptions({
        rows: countryBarChartData,
        yAxis: countryYAxis,
        tooltip: tooltipMeta,
        xLabels: "compact",
        showLegend: showDistributionCompare,
        onClick: () => setCountryChartYZoomed((z) => !z),
      }),
    [countryBarChartData, countryYAxis, tooltipMeta, showDistributionCompare],
  );

  const assetMixPieChartData = useMemo(() => {
    const raw = assetMixPieData.map((d) => d.value);
    const { display, original } = adjustPieValuesForMinAngleDegrees(
      raw,
      PIE_MIN_SLICE_DEGREES,
    );
    return {
      labels: assetMixPieData.map((d) => d.name),
      datasets: [
        {
          data: display,
          originalData: original,
          backgroundColor: assetMixPieData.map((d) => d.fill),
          borderColor: "#ffffff",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };
  }, [assetMixPieData]);

  const assetMixPieOptions = useMemo(
    (): ChartOptions<"pie"> => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 420 },
      layout: { padding: pieChartLayoutPadding },
      plugins: {
        legend: pieChartLegendOptions,
        investmentsPieTooltip: {
          kind: "assetMix",
          totalPortfolioEur: assetMixPieTotalEur,
        },
        tooltip: {
          ...CHART_TOOLTIP_BASE,
        },
      },
    }),
    [assetMixPieTotalEur],
  );

  const bondPieChartData = useMemo(() => {
    const raw = bondMixPieData.map((d) => d.value);
    const { display, original } = adjustPieValuesForMinAngleDegrees(
      raw,
      PIE_MIN_SLICE_DEGREES,
    );
    return {
      labels: bondMixPieData.map((d) => d.name),
      datasets: [
        {
          data: display,
          originalData: original,
          backgroundColor: bondMixPieData.map((d) => d.fill),
          borderColor: "#ffffff",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };
  }, [bondMixPieData]);

  const bondPieOptions = useMemo(
    (): ChartOptions<"pie"> => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 420 },
      layout: { padding: pieChartLayoutPadding },
      plugins: {
        legend: pieChartLegendOptions,
        investmentsPieTooltip: {
          kind: "bondMix",
        },
        tooltip: {
          ...CHART_TOOLTIP_BASE,
        },
      },
    }),
    [],
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
            className={`w-full min-w-0 grid gap-4 justify-items-start ${bondMixPieData.length > 0 ? "grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "max-w-xl"}`}
          >
            <div className="min-w-0 subsection-stack w-full">
              <h3>Asset mix</h3>
              <div className="h-48 w-full min-w-0">
                <Pie
                  data={assetMixPieChartData}
                  options={assetMixPieOptions}
                  plugins={[pieChartLeftAlignPlugin]}
                />
              </div>
            </div>
            {bondMixPieData.length > 0 ? (
              <div className="min-w-0 subsection-stack w-full">
                <h3>Bond mix</h3>
                <div className="h-48 w-full min-w-0">
                  <Pie
                    data={bondPieChartData}
                    options={bondPieOptions}
                    plugins={[pieChartLeftAlignPlugin]}
                  />
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

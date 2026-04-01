import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib";
import type { ChartOptions } from "chart.js";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bar, Doughnut, Pie } from "react-chartjs-2";
import {
  type DistributionBarChartRow,
  distributionBarChartTooltipPlugin,
} from "../../components/PortfolioChartTooltips";
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
  countryBarChartRestTailKeys,
  countryBarChartRestTailKeysDual,
  equitySectorsForDisplay,
  mergeRestCountryTopHoldings,
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

function assetMixPieRowsFromAssetMix(
  assetMix: PortfolioDistributions["assetMix"],
) {
  const m = assetMix;
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
}

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

const COMPARE_DOUGHNUT_CUTOUT = "40%";

const BOND_MIX_NO_BONDS_SECTOR_ID = "_no_bonds";
const BOND_MIX_NO_BONDS_LABEL = "No bonds";
/** slate-500 — synthetic slice when a portfolio has no bond sleeve (compare mode). */
const BOND_MIX_NO_BONDS_FILL = "#64748b";

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
      const tailKeys = countryBarChartRestTailKeys(
        portfolio.countries,
        countryChartEntryCount,
      );
      return topCountriesChartData(
        portfolio.countries,
        countryChartEntryCount,
      ).map((r) => ({
        ...r,
        topHoldings:
          r.bucketKey === "rest"
            ? mergeRestCountryTopHoldings(tailKeys, th, portfolio.countries)
            : (th[r.bucketKey] ?? []),
      }));
    }
    const tailKeysDual = countryBarChartRestTailKeysDual(
      portfolio.countries,
      comparePortfolio?.countries ?? {},
      countryChartEntryCount,
    );
    return topCountriesChartDataDual(
      portfolio.countries,
      comparePortfolio?.countries ?? {},
      countryChartEntryCount,
    ).map((r) => ({
      ...r,
      topHoldingsPrimary:
        r.bucketKey === "rest"
          ? mergeRestCountryTopHoldings(tailKeysDual, th, portfolio.countries)
          : (th[r.bucketKey] ?? []),
      topHoldingsCompare:
        r.bucketKey === "rest"
          ? mergeRestCountryTopHoldings(
              tailKeysDual,
              thCmp,
              comparePortfolio?.countries ?? {},
            )
          : (thCmp[r.bucketKey] ?? []),
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

  const assetMixPieDataRaw = useMemo(
    () => assetMixPieRowsFromAssetMix(portfolio.assetMix),
    [portfolio.assetMix],
  );

  const compareAssetMixPieTotalEur = useMemo(() => {
    if (!comparePortfolio) return 0;
    return assetMixPieRowsFromAssetMix(comparePortfolio.assetMix).reduce(
      (s, d) => s + d.value,
      0,
    );
  }, [comparePortfolio]);

  const assetMixPieTotalEur = useMemo(
    () => assetMixPieDataRaw.reduce((s, d) => s + d.value, 0),
    [assetMixPieDataRaw],
  );

  const assetMixPieData = useMemo(() => {
    const primaryRaw = assetMixPieDataRaw;
    const tp = assetMixPieTotalEur;

    if (!showDistributionCompare || !comparePortfolio) {
      if (!(tp > 0)) {
        return [];
      }
      return primaryRaw.filter(
        (d) => d.value / tp >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
      );
    }

    const compareRaw = assetMixPieRowsFromAssetMix(comparePortfolio.assetMix);
    const tc = compareRaw.reduce((s, d) => s + d.value, 0);
    if (!(tp > 0) && !(tc > 0)) {
      return [];
    }

    return primaryRaw.filter((d, i) => {
      const pv = d.value;
      const cv = compareRaw[i]?.value ?? 0;
      return (
        (tp > 0 && pv / tp >= MIN_PORTFOLIO_ALLOCATION_FRACTION) ||
        (tc > 0 && cv / tc >= MIN_PORTFOLIO_ALLOCATION_FRACTION)
      );
    });
  }, [
    assetMixPieDataRaw,
    assetMixPieTotalEur,
    showDistributionCompare,
    comparePortfolio,
  ]);

  const showBondMixSection = useMemo(() => {
    if (!showDistributionCompare || !comparePortfolio) {
      return portfolio.bondMix.length > 0;
    }
    return (
      portfolio.bondMix.length > 0 ||
      (comparePortfolio.bondMix?.length ?? 0) > 0
    );
  }, [
    showDistributionCompare,
    comparePortfolio,
    portfolio.bondMix,
    comparePortfolio?.bondMix,
  ]);

  const bondMixPieData = useMemo(() => {
    const mapSlice = (s: { sectorId: string; weight: number }) => ({
      sectorId: s.sectorId,
      name:
        DISTRIBUTION_SECTOR_TITLES[
          s.sectorId as keyof typeof DISTRIBUTION_SECTOR_TITLES
        ] ?? s.sectorId,
      value: s.weight,
      fill:
        PORTFOLIO_BOND_MIX_PIE_COLORS[s.sectorId] ??
        PORTFOLIO_ASSET_MIX_COLORS.bonds,
    });

    if (!showDistributionCompare || !comparePortfolio) {
      return portfolio.bondMix.map(mapSlice);
    }

    const pList = portfolio.bondMix;
    const cList = comparePortfolio.bondMix ?? [];
    const pHas = pList.length > 0;
    const cHas = cList.length > 0;
    const pMap = new Map(pList.map((s) => [s.sectorId, s.weight]));
    const cMap = new Map(cList.map((s) => [s.sectorId, s.weight]));

    const sectorTitle = (sectorId: string) =>
      DISTRIBUTION_SECTOR_TITLES[
        sectorId as keyof typeof DISTRIBUTION_SECTOR_TITLES
      ] ?? sectorId;

    const sectorFill = (sectorId: string) =>
      PORTFOLIO_BOND_MIX_PIE_COLORS[sectorId] ??
      PORTFOLIO_ASSET_MIX_COLORS.bonds;

    const noBondsRow = (primaryWeight: number) => ({
      sectorId: BOND_MIX_NO_BONDS_SECTOR_ID,
      name: BOND_MIX_NO_BONDS_LABEL,
      value: primaryWeight,
      fill: BOND_MIX_NO_BONDS_FILL,
    });

    if (pHas && cHas) {
      const sectorIds = [...new Set([...pMap.keys(), ...cMap.keys()])].filter(
        (id) =>
          (pMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION ||
          (cMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
      );
      sectorIds.sort((a, b) => {
        const ma = Math.max(pMap.get(a) ?? 0, cMap.get(a) ?? 0);
        const mb = Math.max(pMap.get(b) ?? 0, cMap.get(b) ?? 0);
        return mb - ma;
      });
      return sectorIds.map((sectorId) => ({
        sectorId,
        name: sectorTitle(sectorId),
        value: pMap.get(sectorId) ?? 0,
        fill: sectorFill(sectorId),
      }));
    }

    if (pHas && !cHas) {
      const sectorIds = [...pMap.keys()].filter(
        (id) => (pMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
      );
      sectorIds.sort((a, b) => (pMap.get(b) ?? 0) - (pMap.get(a) ?? 0));
      return [
        ...sectorIds.map((sectorId) => ({
          sectorId,
          name: sectorTitle(sectorId),
          value: pMap.get(sectorId) ?? 0,
          fill: sectorFill(sectorId),
        })),
        noBondsRow(0),
      ];
    }

    if (!pHas && cHas) {
      const sectorIds = [...cMap.keys()].filter(
        (id) => (cMap.get(id) ?? 0) >= MIN_PORTFOLIO_ALLOCATION_FRACTION,
      );
      sectorIds.sort((a, b) => (cMap.get(b) ?? 0) - (cMap.get(a) ?? 0));
      return [
        ...sectorIds.map((sectorId) => ({
          sectorId,
          name: sectorTitle(sectorId),
          value: 0,
          fill: sectorFill(sectorId),
        })),
        noBondsRow(1),
      ];
    }

    return [];
  }, [portfolio.bondMix, showDistributionCompare, comparePortfolio]);

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
    const buildDataset = (raw: number[]) => {
      const { display, original } = adjustPieValuesForMinAngleDegrees(
        raw,
        PIE_MIN_SLICE_DEGREES,
      );
      return { display, original };
    };

    if (showDistributionCompare && comparePortfolio) {
      const compareByName = new Map(
        assetMixPieRowsFromAssetMix(comparePortfolio.assetMix).map((d) => [
          d.name,
          d,
        ]),
      );
      const primaryRaw = assetMixPieData.map((d) => d.value);
      const compareRaw = assetMixPieData.map(
        (d) => compareByName.get(d.name)?.value ?? 0,
      );
      const outer = buildDataset(primaryRaw);
      const inner = buildDataset(compareRaw);
      return {
        labels: assetMixPieData.map((d) => d.name),
        datasets: [
          {
            label: selectedPortfolioLabel,
            data: outer.display,
            originalData: outer.original,
            backgroundColor: assetMixPieData.map((d) => d.fill),
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 6,
          },
          {
            label: comparePortfolioLabel,
            data: inner.display,
            originalData: inner.original,
            backgroundColor: assetMixPieData.map((d) => d.fill),
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      };
    }

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
  }, [
    assetMixPieData,
    showDistributionCompare,
    comparePortfolio,
    selectedPortfolioLabel,
    comparePortfolioLabel,
  ]);

  const assetMixPieOptions = useMemo((): ChartOptions<"pie" | "doughnut"> => {
    const base: ChartOptions<"pie" | "doughnut"> = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 420 },
      layout: { padding: pieChartLayoutPadding },
      plugins: {
        legend: pieChartLegendOptions,
        investmentsPieTooltip: {
          kind: "assetMix",
          totalPortfolioEur: assetMixPieTotalEur,
          ...(showDistributionCompare && comparePortfolio
            ? { compareTotalPortfolioEur: compareAssetMixPieTotalEur }
            : {}),
        },
        tooltip: {
          ...CHART_TOOLTIP_BASE,
        },
      },
    };
    if (showDistributionCompare && comparePortfolio) {
      base.cutout = COMPARE_DOUGHNUT_CUTOUT;
    }
    return base;
  }, [
    assetMixPieTotalEur,
    compareAssetMixPieTotalEur,
    showDistributionCompare,
    comparePortfolio,
  ]);

  const bondPieChartData = useMemo(() => {
    const buildDataset = (raw: number[]) => {
      const { display, original } = adjustPieValuesForMinAngleDegrees(
        raw,
        PIE_MIN_SLICE_DEGREES,
      );
      return { display, original };
    };

    if (showDistributionCompare && comparePortfolio) {
      const primaryRaw = bondMixPieData.map((d) => d.value);
      const compareRaw = bondMixPieData.map((d) => {
        if (d.sectorId === BOND_MIX_NO_BONDS_SECTOR_ID) {
          return (comparePortfolio.bondMix?.length ?? 0) === 0 ? 1 : 0;
        }
        return (
          comparePortfolio.bondMix?.find((s) => s.sectorId === d.sectorId)
            ?.weight ?? 0
        );
      });
      const outer = buildDataset(primaryRaw);
      const inner = buildDataset(compareRaw);
      return {
        labels: bondMixPieData.map((d) => d.name),
        datasets: [
          {
            label: selectedPortfolioLabel,
            data: outer.display,
            originalData: outer.original,
            backgroundColor: bondMixPieData.map((d) => d.fill),
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 6,
            weight: 1.15,
          },
          {
            label: comparePortfolioLabel,
            data: inner.display,
            originalData: inner.original,
            backgroundColor: bondMixPieData.map((d) => d.fill),
            borderColor: "#ffffff",
            borderWidth: 2,
            hoverOffset: 6,
            weight: 1,
          },
        ],
      };
    }

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
  }, [
    bondMixPieData,
    showDistributionCompare,
    comparePortfolio,
    selectedPortfolioLabel,
    comparePortfolioLabel,
  ]);

  const bondPieOptions = useMemo((): ChartOptions<"pie" | "doughnut"> => {
    const base: ChartOptions<"pie" | "doughnut"> = {
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
    };
    if (showDistributionCompare && comparePortfolio) {
      base.cutout = COMPARE_DOUGHNUT_CUTOUT;
    }
    return base;
  }, [showDistributionCompare, comparePortfolio]);

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

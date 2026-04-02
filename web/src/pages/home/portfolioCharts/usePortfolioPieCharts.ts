import { MIN_PORTFOLIO_ALLOCATION_FRACTION } from "@investments/lib/minPortfolioAllocationFraction";
import type { ChartOptions } from "chart.js";
import { useMemo } from "react";
import { CHART_TOOLTIP_BASE } from "../../../lib/chart/chartTooltipTheme";
import { adjustPieValuesForMinAngleDegrees } from "../../../lib/chart/pieMinAngle";
import { assetMixPieRowsFromAssetMix } from "./assetMixPieRows";
import {
  BOND_MIX_NO_BONDS_SECTOR_ID,
  computeBondMixPieData,
} from "./bondMixPieData";
import type { PortfolioChartsProps } from "./portfolioChartsTypes";
import {
  PORTFOLIO_COMPARE_DOUGHNUT_CUTOUT,
  PORTFOLIO_PIE_MIN_SLICE_DEGREES,
  portfolioPieChartLegendOptions,
} from "./portfolioPieChartStyle";

export function usePortfolioPieCharts({
  portfolio,
  comparePortfolio,
  showDistributionCompare,
  selectedPortfolioLabel,
  comparePortfolioLabel,
}: PortfolioChartsProps) {
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

  const bondMixPieData = useMemo(
    () =>
      computeBondMixPieData({
        portfolio,
        comparePortfolio,
        showDistributionCompare,
      }),
    [portfolio, comparePortfolio, showDistributionCompare],
  );

  const assetMixPieChartData = useMemo(() => {
    const buildDataset = (raw: number[]) => {
      const { display, original } = adjustPieValuesForMinAngleDegrees(
        raw,
        PORTFOLIO_PIE_MIN_SLICE_DEGREES,
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
      PORTFOLIO_PIE_MIN_SLICE_DEGREES,
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
      animation: { duration: 320 },
      plugins: {
        legend: portfolioPieChartLegendOptions,
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
      base.cutout = PORTFOLIO_COMPARE_DOUGHNUT_CUTOUT;
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
        PORTFOLIO_PIE_MIN_SLICE_DEGREES,
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
      PORTFOLIO_PIE_MIN_SLICE_DEGREES,
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
      animation: { duration: 320 },
      plugins: {
        legend: portfolioPieChartLegendOptions,
        investmentsPieTooltip: {
          kind: "bondMix",
        },
        tooltip: {
          ...CHART_TOOLTIP_BASE,
        },
      },
    };
    if (showDistributionCompare && comparePortfolio) {
      base.cutout = PORTFOLIO_COMPARE_DOUGHNUT_CUTOUT;
    }
    return base;
  }, [showDistributionCompare, comparePortfolio]);

  return {
    assetMixPieData,
    showBondMixSection,
    assetMixPieChartData,
    assetMixPieOptions,
    bondPieChartData,
    bondPieOptions,
  };
}

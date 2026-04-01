import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_DISTRIBUTION_BAR_Y_AXIS_TICK_COUNT,
  distributionBarYAxisFromMax,
  maxDistributionBarChartValue,
  secondLargestMainPortfolioBarValue,
} from "../../../lib/distributionBarChartAxis";
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
} from "../../../lib/distributionDisplay";
import { PORTFOLIO_DISTRIBUTION_BAR_COLORS } from "../../../lib/portfolioChartPalette";
import { buildDistributionBarChartData } from "./distributionBarChartData";
import { distributionBarOptions } from "./distributionBarChartOptions";
import type { PortfolioChartsProps } from "./portfolioChartsTypes";

/** Target horizontal space per country bar (matches resize-driven row cap). */
const COUNTRY_BAR_CHART_PX_PER_ENTRY = 42;
/** Before the first ResizeObserver callback, approximate bar count for SSR/first paint. */
const COUNTRY_BAR_CHART_WIDTH_FALLBACK_PX = 800;

export function usePortfolioDistributionBarCharts({
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

  const regionBarData = useMemo(
    () =>
      buildDistributionBarChartData(regionBarChartData, {
        showCompare: showDistributionCompare,
        selectedPortfolioLabel,
        comparePortfolioLabel,
        singleSeriesColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary,
        comparePrimaryColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionPrimary,
        compareSecondaryColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.regionCompare,
      }),
    [
      regionBarChartData,
      showDistributionCompare,
      selectedPortfolioLabel,
      comparePortfolioLabel,
    ],
  );

  const sectorBarData = useMemo(
    () =>
      buildDistributionBarChartData(sectorBarChartData, {
        showCompare: showDistributionCompare,
        selectedPortfolioLabel,
        comparePortfolioLabel,
        singleSeriesColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorPrimary,
        comparePrimaryColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorPrimary,
        compareSecondaryColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.sectorCompare,
      }),
    [
      sectorBarChartData,
      showDistributionCompare,
      selectedPortfolioLabel,
      comparePortfolioLabel,
    ],
  );

  const countryBarData = useMemo(
    () =>
      buildDistributionBarChartData(countryBarChartData, {
        showCompare: showDistributionCompare,
        selectedPortfolioLabel,
        comparePortfolioLabel,
        singleSeriesColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary,
        comparePrimaryColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryPrimary,
        compareSecondaryColor: PORTFOLIO_DISTRIBUTION_BAR_COLORS.countryCompare,
      }),
    [
      countryBarChartData,
      showDistributionCompare,
      selectedPortfolioLabel,
      comparePortfolioLabel,
    ],
  );

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

  return {
    countryChartContainerRef,
    countryChartYZoomed,
    regionBarData,
    regionBarOptions,
    sectorBarData,
    sectorBarOptions,
    countryBarData,
    countryBarOptions,
  };
}

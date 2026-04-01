import type { ChartData } from "chart.js";

type DistributionBarChartJsRow =
  | { name: string; value: number }
  | { name: string; primary: number; compare: number };

export function buildDistributionBarChartData(
  chartRows: DistributionBarChartJsRow[],
  args: {
    showCompare: boolean;
    selectedPortfolioLabel: string;
    comparePortfolioLabel: string;
    singleSeriesColor: string;
    comparePrimaryColor: string;
    compareSecondaryColor: string;
  },
): ChartData<"bar"> {
  const labels = chartRows.map((r) => r.name);
  if (args.showCompare) {
    const rows = chartRows as Array<{
      name: string;
      primary: number;
      compare: number;
    }>;
    return {
      labels,
      datasets: [
        {
          label: args.selectedPortfolioLabel,
          data: rows.map((r) => r.primary ?? 0),
          backgroundColor: args.comparePrimaryColor,
        },
        {
          label: args.comparePortfolioLabel,
          data: rows.map((r) => r.compare ?? 0),
          backgroundColor: args.compareSecondaryColor,
        },
      ],
    };
  }
  const rows = chartRows as Array<{ name: string; value: number }>;
  return {
    labels,
    datasets: [
      {
        label: "Weight",
        data: rows.map((r) => r.value ?? 0),
        backgroundColor: args.singleSeriesColor,
      },
    ],
  };
}

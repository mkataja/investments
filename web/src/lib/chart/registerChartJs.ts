import type { Plugin } from "chart.js";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import {
  ChoroplethController,
  ColorLogarithmicScale,
  ColorScale,
  GeoFeature,
  ProjectionScale,
} from "chartjs-chart-geo";

/** Carries options read by `distributionChartTooltipPropsFromChart`. */
const investmentsDistributionTooltipPlugin = {
  id: "investmentsDistributionTooltip",
} satisfies Plugin;

/** Carries options read by `portfolioPieTooltipPropsFromChart`. */
const investmentsPieTooltipPlugin = {
  id: "investmentsPieTooltip",
} satisfies Plugin;

Tooltip.positioners.followCursor = (items, eventPosition) => {
  if (!items.length || !eventPosition) return false;
  const x = eventPosition.x;
  const y = eventPosition.y;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return false;
  }
  return { x, y };
};

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Legend,
  Tooltip,
  ChoroplethController,
  GeoFeature,
  ColorScale,
  ColorLogarithmicScale,
  ProjectionScale,
  investmentsDistributionTooltipPlugin,
  investmentsPieTooltipPlugin,
);

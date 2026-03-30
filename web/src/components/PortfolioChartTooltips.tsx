import { formatPercentWidth4From01 } from "../lib/distributionDisplay";

/** Use as `<Tooltip formatter={portfolioDistributionBarTooltipFormatter} />` — Recharts only detects direct `Tooltip` children, not wrapper components. */
export function portfolioDistributionBarTooltipFormatter(v: number) {
  return formatPercentWidth4From01(v);
}

export function assetMixPieTooltipFormatter(totalEur: number) {
  return (v: number) =>
    `${v.toFixed(2)} EUR (${((v / totalEur) * 100).toFixed(1)}%)`;
}

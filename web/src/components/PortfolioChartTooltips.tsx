import type { ComponentProps } from "react";
import { Tooltip } from "recharts";
import { formatPercentWidth4From01 } from "../lib/distributionDisplay";

export function portfolioDistributionBarTooltipFormatter(v: number) {
  return formatPercentWidth4From01(v);
}

type DistributionBarChartTooltipProps = ComponentProps<typeof Tooltip>;

/**
 * Regions / sectors / countries bar charts. Must set `displayName` so Recharts
 * `findChildByType(..., Tooltip)` matches; props from `cloneElement` must be forwarded.
 */
export function DistributionBarChartTooltip(
  props: DistributionBarChartTooltipProps,
) {
  const formatter =
    props.formatter ??
    (portfolioDistributionBarTooltipFormatter as NonNullable<
      DistributionBarChartTooltipProps["formatter"]
    >);
  return <Tooltip {...props} formatter={formatter} />;
}
DistributionBarChartTooltip.displayName = "Tooltip";

export function assetMixPieTooltipFormatter(totalEur: number) {
  return (v: number) =>
    `${v.toFixed(2)} EUR (${((v / totalEur) * 100).toFixed(1)}%)`;
}

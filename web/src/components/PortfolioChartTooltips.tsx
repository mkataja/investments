/**
 * Recharts tooltips (why this file looks odd):
 *
 * - The chart finds the tooltip child with `child.type.displayName === "Tooltip"`,
 *   then `cloneElement`s `payload`, `active`, `coordinate`, `viewBox`, etc. onto it.
 * - `DistributionBarChartTooltip` is therefore a thin alias of `Tooltip` with
 *   `displayName = "Tooltip"` and must forward all props to `<Tooltip />`.
 *
 * Changing **layout** of the distribution *bar* charts:
 *
 * 1. **DefaultTooltipContent styling** (easiest): edit
 *    `DISTRIBUTION_BAR_CHART_TOOLTIP_LAYOUT` below — `contentStyle` is the outer
 *    box, `itemStyle` / `labelStyle` are rows and the axis label. You can also
 *    pass the same props from `HomePage` into `<DistributionBarChartTooltip />`.
 *
 * 2. **Custom inner UI**: pass `content` — a component or render function. Recharts
 *    calls it with the full tooltip props (`payload`, `label`, `formatter`, …).
 *    Example: `<DistributionBarChartTooltip content={MyTooltipBody} />` and render
 *    your own markup from `props.payload`.
 *
 * 3. **Only the numbers**: `formatter` on each series (we default to % via
 *    `portfolioDistributionBarTooltipFormatter`). `labelFormatter` shapes the
 *    X/category line when present.
 *
 * Asset mix pie uses the plain `<Tooltip formatter={…} />` in `HomePage` — same
 * layout levers; no `DistributionBarChartTooltip` wrapper there.
 */
import type { CSSProperties, ComponentProps } from "react";
import { Tooltip } from "recharts";
import { formatPercentWidth4From01 } from "../lib/distributionDisplay";

export function portfolioDistributionBarTooltipFormatter(v: number) {
  return formatPercentWidth4From01(v);
}

type DistributionBarChartTooltipProps = ComponentProps<typeof Tooltip>;

/** Tweak bar-chart tooltip appearance here (merged with props from callers). */
const DISTRIBUTION_BAR_CHART_TOOLTIP_LAYOUT: {
  contentStyle?: CSSProperties;
  itemStyle?: CSSProperties;
  labelStyle?: CSSProperties;
  wrapperStyle?: CSSProperties;
} = {
  contentStyle: {},
  itemStyle: {
    paddingTop: 0,
    paddingBottom: "0.125rem",
  },
  labelStyle: {
    fontWeight: 700,
    fontSize: "1rem",
    marginBottom: "0.5rem",
  },
  wrapperStyle: {},
};

/**
 * Regions / sectors / countries bar charts. Must set `displayName` so Recharts
 * `findChildByType(..., Tooltip)` matches; props from `cloneElement` must be forwarded.
 */
export function DistributionBarChartTooltip(
  props: DistributionBarChartTooltipProps,
) {
  const {
    contentStyle,
    itemStyle,
    labelStyle,
    wrapperStyle,
    formatter: formatterFromProps,
    ...rest
  } = props;

  const formatter =
    formatterFromProps ??
    (portfolioDistributionBarTooltipFormatter as NonNullable<
      DistributionBarChartTooltipProps["formatter"]
    >);

  return (
    <Tooltip
      {...rest}
      formatter={formatter}
      contentStyle={{
        ...DISTRIBUTION_BAR_CHART_TOOLTIP_LAYOUT.contentStyle,
        ...contentStyle,
      }}
      itemStyle={{
        ...DISTRIBUTION_BAR_CHART_TOOLTIP_LAYOUT.itemStyle,
        ...itemStyle,
      }}
      labelStyle={{
        ...DISTRIBUTION_BAR_CHART_TOOLTIP_LAYOUT.labelStyle,
        ...labelStyle,
      }}
      wrapperStyle={{
        ...DISTRIBUTION_BAR_CHART_TOOLTIP_LAYOUT.wrapperStyle,
        ...wrapperStyle,
      }}
    />
  );
}
DistributionBarChartTooltip.displayName = "Tooltip";

export function assetMixPieTooltipFormatter(totalEur: number) {
  return (v: number) =>
    `${v.toFixed(2)} EUR (${((v / totalEur) * 100).toFixed(1)}%)`;
}

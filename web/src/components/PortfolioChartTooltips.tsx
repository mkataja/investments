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
 * 3. **Only the numbers**: `formatter` on each series (default: `formatToPercentage`).
 *    `labelFormatter` shapes the X/category line when present. The default
 *    Recharts name/value separator is `" : "`; we use `": "` so there is no space before the colon.
 *
 * Asset mix pie uses the plain `<Tooltip formatter={…} />` in `HomePage` — same
 * layout levers; no `DistributionBarChartTooltip` wrapper there.
 */
import type { CSSProperties, ComponentProps } from "react";
import { Tooltip, type TooltipProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { formatToPercentage } from "../lib/numberFormat";
import type { BucketTopHolding } from "../pages/home/types";

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
    (formatToPercentage as NonNullable<
      DistributionBarChartTooltipProps["formatter"]
    >);

  return (
    <Tooltip
      {...rest}
      separator=": "
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

type BarChartRowPayload = {
  topHoldings?: BucketTopHolding[];
  topHoldingsPrimary?: BucketTopHolding[];
  topHoldingsCompare?: BucketTopHolding[];
};

/**
 * Custom tooltip body for distribution bar charts: bar values plus top holdings per bucket.
 * Create with {@link createDistributionBarTooltipContent} so compare labels stay in sync.
 */
export function createDistributionBarTooltipContent(options: {
  showCompare: boolean;
  primaryLabel: string;
  compareLabel: string;
}) {
  return function DistributionBarTooltipContent(
    props: TooltipProps<ValueType, NameType>,
  ) {
    const { active, payload, label } = props;
    if (!active || !payload?.length) {
      return null;
    }
    const row = payload[0]?.payload as BarChartRowPayload | undefined;
    const topHoldings = row?.topHoldings;
    const topPrimary = row?.topHoldingsPrimary;
    const topCompare = row?.topHoldingsCompare;

    return (
      <div
        className="rounded border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        style={{ outline: "none" }}
      >
        {label != null && label !== "" ? (
          <p className="font-bold mb-1 text-slate-800">{label}</p>
        ) : null}
        {payload.map((p) => {
          const v =
            typeof p.value === "number"
              ? p.value
              : typeof p.value === "string"
                ? Number(p.value)
                : 0;
          return (
            <div key={String(p.dataKey ?? p.name)} className="text-slate-700">
              {p.name}: {formatToPercentage(Number.isFinite(v) ? v : 0)}
            </div>
          );
        })}
        {!options.showCompare && topHoldings && topHoldings.length > 0 ? (
          <ol className="mt-2 list-decimal space-y-0.5 border-t border-slate-200 pt-2 pl-4 text-slate-600">
            {topHoldings.map((h) => (
              <li key={h.instrumentId} className="tabular-nums">
                <span className="font-medium text-slate-700">
                  {h.displayName}
                </span>{" "}
                {formatToPercentage(h.pctOfBucket)}
              </li>
            ))}
          </ol>
        ) : null}
        {!options.showCompare && topHoldings && topHoldings.length === 0 ? (
          <p className="mt-2 border-t border-slate-200 pt-2 text-xs font-semibold text-slate-600">
            No contributors in{" "}
            <em>{label != null && label !== "" ? label : "this bucket"}</em>
          </p>
        ) : null}
        {options.showCompare ? (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <p className="text-xs font-semibold text-slate-600 mb-1">
              {(topPrimary?.length ?? 0) > 0 ? (
                <>
                  Top contributors in <em>{options.primaryLabel}</em>:
                </>
              ) : (
                <>
                  No contributors in <em>{options.primaryLabel}</em>
                </>
              )}
            </p>
            {(topPrimary?.length ?? 0) > 0 ? (
              <ol className="list-decimal space-y-0.5 pl-4 text-slate-600">
                {(topPrimary ?? []).map((h) => (
                  <li key={h.instrumentId} className="tabular-nums">
                    <span className="font-medium text-slate-700">
                      {h.displayName}
                    </span>{" "}
                    {formatToPercentage(h.pctOfBucket)}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
        {options.showCompare ? (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <p className="text-xs font-semibold text-slate-600 mb-1">
              {(topCompare?.length ?? 0) > 0 ? (
                <>
                  Top contributors in <em>{options.compareLabel}</em>:
                </>
              ) : (
                <>
                  No contributors in <em>{options.compareLabel}</em>
                </>
              )}
            </p>
            {(topCompare?.length ?? 0) > 0 ? (
              <ol className="list-decimal space-y-0.5 pl-4 text-slate-600">
                {(topCompare ?? []).map((h) => (
                  <li key={h.instrumentId} className="tabular-nums">
                    <span className="font-medium text-slate-700">
                      {h.displayName}
                    </span>{" "}
                    {formatToPercentage(h.pctOfBucket)}
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };
}

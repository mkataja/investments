import { formatIntegerForDisplay, formatToPercentage } from "../numberFormat";
import type { PortfolioPieTooltipProps } from "./portfolioPieTooltipTypes";

function AssetMixRows(
  props: Extract<PortfolioPieTooltipProps, { kind: "assetMix" }>,
) {
  const { maxInnerWidthPx, sliceLabel } = props;
  if ("comparison" in props) {
    const c = props.comparison;
    return (
      <aside
        className="chart-tooltip"
        style={{ maxWidth: maxInnerWidthPx }}
        role="tooltip"
      >
        <h3 className="chart-tooltip__heading">{sliceLabel}</h3>
        <div className="space-y-1">
          <p className="chart-tooltip__pie m-0">
            <span className="font-medium text-slate-800">{c.primaryLabel}</span>
            {": "}
            {formatToPercentage(c.primaryShareOfPortfolio)}
            {" ("}
            <span className="tabular-nums">
              {formatIntegerForDisplay(c.primaryValueEur)} EUR
            </span>
            {")"}
          </p>
          <p className="chart-tooltip__pie m-0">
            <span className="font-medium text-slate-800">{c.compareLabel}</span>
            {": "}
            {formatToPercentage(c.compareShareOfPortfolio)}
            {" ("}
            <span className="tabular-nums">
              {formatIntegerForDisplay(c.compareValueEur)} EUR
            </span>
            {")"}
          </p>
        </div>
      </aside>
    );
  }
  const { valueEur, shareOfPortfolio } = props;
  return (
    <aside
      className="chart-tooltip"
      style={{ maxWidth: maxInnerWidthPx }}
      role="tooltip"
    >
      <h3 className="chart-tooltip__heading">{sliceLabel}</h3>
      <p className="chart-tooltip__pie">
        {formatToPercentage(shareOfPortfolio)}
        {" ("}
        <span className="tabular-nums">
          {formatIntegerForDisplay(valueEur)} EUR
        </span>
        {")"}
      </p>
    </aside>
  );
}

function BondMixRows(
  props: Extract<PortfolioPieTooltipProps, { kind: "bondMix" }>,
) {
  const { maxInnerWidthPx, sliceLabel } = props;
  if ("comparison" in props) {
    const c = props.comparison;
    return (
      <aside
        className="chart-tooltip"
        style={{ maxWidth: maxInnerWidthPx }}
        role="tooltip"
      >
        <h3 className="chart-tooltip__heading">{sliceLabel}</h3>
        <div className="space-y-1">
          <p className="chart-tooltip__pie m-0">
            <span className="font-medium text-slate-800">{c.primaryLabel}</span>
            {": "}
            <span className="tabular-nums">
              {formatToPercentage(c.primaryWeight, { decimalPlaces: 1 })}
            </span>
          </p>
          <p className="chart-tooltip__pie m-0">
            <span className="font-medium text-slate-800">{c.compareLabel}</span>
            {": "}
            <span className="tabular-nums">
              {formatToPercentage(c.compareWeight, { decimalPlaces: 1 })}
            </span>
          </p>
        </div>
      </aside>
    );
  }
  const { weight } = props;
  return (
    <aside
      className="chart-tooltip"
      style={{ maxWidth: maxInnerWidthPx }}
      role="tooltip"
    >
      <h3 className="chart-tooltip__heading">{sliceLabel}</h3>
      <p className="chart-tooltip__pie">
        {formatToPercentage(weight, { decimalPlaces: 1 })}
      </p>
    </aside>
  );
}

export function PortfolioPieTooltip(props: PortfolioPieTooltipProps) {
  if (props.kind === "assetMix") {
    return <AssetMixRows {...props} />;
  }
  return <BondMixRows {...props} />;
}

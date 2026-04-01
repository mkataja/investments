import { formatToPercentage } from "../numberFormat";
import type { PortfolioPieTooltipProps } from "./portfolioPieTooltipTypes";

/**
 * Tooltip for asset–mix and bond–mix pie slices (HTML + styles in `index.css`).
 */
export function PortfolioPieTooltip(props: PortfolioPieTooltipProps) {
  const { maxInnerWidthPx } = props;

  if (props.kind === "assetMix") {
    const { sliceLabel, valueEur, shareOfPortfolio } = props;
    return (
      <aside
        className="chart-tooltip"
        style={{ maxWidth: maxInnerWidthPx }}
        role="tooltip"
      >
        <h3 className="chart-tooltip__heading">{sliceLabel}</h3>
        <p className="chart-tooltip__pie">
          <span className="tabular-nums">{valueEur.toFixed(0)} EUR</span>
          {" ("}
          {formatToPercentage(shareOfPortfolio)}
          {")"}
        </p>
      </aside>
    );
  }

  const { sliceLabel, weight } = props;
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

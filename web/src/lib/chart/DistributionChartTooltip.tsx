import type { BucketTopHolding } from "../../pages/home/types";
import { formatToPercentage } from "../numberFormat";
import type {
  DistributionChartTooltipProps,
  DistributionChartWeightRow,
} from "./distributionChartTooltipTypes";

function holdingLabel(h: BucketTopHolding): string {
  const t = h.tickerSymbol?.trim();
  if (t != null && t.length > 0 && t !== "-") {
    return `${h.displayName} (${t})`;
  }
  return h.displayName;
}

function WeightRow({
  label,
  value,
  backgroundColor,
  borderColor,
}: DistributionChartWeightRow) {
  return (
    <li className="chart-tooltip__weight">
      <span
        className="chart-tooltip__swatch"
        style={{ backgroundColor, borderColor }}
      />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        {": "}
        <span className="tabular-nums">{formatToPercentage(value)}</span>
      </span>
    </li>
  );
}

function HoldingsList({ holdings }: { holdings: BucketTopHolding[] }) {
  return (
    <ol className="chart-tooltip__holdings">
      {holdings.map((h) => (
        <li key={h.instrumentId}>
          {holdingLabel(h)}{" "}
          <span className="tabular-nums">
            {formatToPercentage(h.pctOfBucket)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function DistributionChartTooltip(props: DistributionChartTooltipProps) {
  const {
    heading,
    weights,
    row,
    showCompare,
    primaryLabel,
    compareLabel,
    maxInnerWidthPx,
  } = props;

  const primaryHoldings = row.topHoldingsPrimary ?? [];
  const compareHoldings = row.topHoldingsCompare ?? [];

  return (
    <aside
      className="chart-tooltip"
      style={{ maxWidth: maxInnerWidthPx }}
      role="tooltip"
    >
      {heading !== "" ? (
        <h3 className="chart-tooltip__heading">{heading}</h3>
      ) : null}

      <ul className="chart-tooltip__weights">
        {weights.map((w, idx) => (
          <WeightRow key={`${w.label}-${idx}`} {...w} />
        ))}
      </ul>

      {!showCompare && row.topHoldings && row.topHoldings.length > 0 ? (
        <section className="chart-tooltip__section">
          <HoldingsList holdings={row.topHoldings} />
        </section>
      ) : null}

      {showCompare ? (
        <>
          <section className="chart-tooltip__section">
            <div className="chart-tooltip__section-title">
              {primaryHoldings.length > 0 ? (
                <h4>
                  Top contributors in <em>{primaryLabel}</em>:
                </h4>
              ) : (
                <h4>
                  No contributors in <em>{primaryLabel}</em>
                </h4>
              )}
            </div>
            {primaryHoldings.length > 0 ? (
              <HoldingsList holdings={primaryHoldings} />
            ) : null}
            <div className="chart-tooltip__section-title">
              {compareHoldings.length > 0 ? (
                <h4>
                  Top contributors in <em>{compareLabel}</em>:
                </h4>
              ) : (
                <h4>
                  No contributors in <em>{compareLabel}</em>
                </h4>
              )}
            </div>
            {compareHoldings.length > 0 ? (
              <HoldingsList holdings={compareHoldings} />
            ) : null}
          </section>
        </>
      ) : null}
    </aside>
  );
}

import { useMemo, useState } from "react";
import {
  HoldingDistributionTooltipLayer,
  type HoldingDistributionTooltipState,
} from "../../components/HoldingDistributionTooltip";
import { formatPercentWidth4From01 } from "../../lib/distributionDisplay";
import {
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "../../lib/numberFormat";
import { instrumentTickerCell } from "./instrumentTickerCell";
import type { HomeInstrument, PortfolioDistributions } from "./types";

type HoldingsTableProps = {
  portfolio: PortfolioDistributions;
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
};

export function HoldingsTable({
  portfolio,
  instrumentById,
  instrumentTickerById,
}: HoldingsTableProps) {
  const [holdingTooltip, setHoldingTooltip] =
    useState<HoldingDistributionTooltipState | null>(null);

  const holdingsSortedByWeight = useMemo(() => {
    return [...portfolio.positions].sort((a, b) => b.weight - a.weight);
  }, [portfolio.positions]);

  return (
    <>
      <h2 className="text-xl font-medium text-slate-800 mb-2">Holdings</h2>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="min-w-full">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-left p-2 font-medium">Ticker</th>
              <th className="text-right p-2 font-medium">Qty</th>
              <th className="text-right p-2 font-medium">Unit EUR</th>
              <th className="text-right p-2 font-medium">Value EUR</th>
              <th className="text-right p-2 font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {holdingsSortedByWeight.map((p) => {
              const ticker = instrumentTickerCell(
                p.instrumentId,
                instrumentById,
                instrumentTickerById,
              );
              return (
                <tr
                  key={p.instrumentId}
                  className="border-t border-slate-100"
                  onMouseEnter={(e) => {
                    setHoldingTooltip({
                      instrumentId: p.instrumentId,
                      displayName: p.displayName,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoldingTooltip((t) =>
                      t?.instrumentId === p.instrumentId ? null : t,
                    );
                  }}
                >
                  <td className="p-2 text-left min-w-[12rem] font-medium text-slate-900">
                    {p.displayName}
                  </td>
                  <td className="p-2 text-left tabular-nums text-slate-700">
                    {ticker}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {roundQuantityForDisplay(String(p.quantity))}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {p.unitPriceEur == null
                      ? "-"
                      : formatUnitPriceForDisplay(String(p.unitPriceEur))}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {p.valueEur.toFixed(2)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatPercentWidth4From01(p.weight)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <HoldingDistributionTooltipLayer
        tooltip={holdingTooltip}
        setTooltip={setHoldingTooltip}
        resolveInstrument={(id) => instrumentById.get(id)}
      />
    </>
  );
}

import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import {
  HoldingDistributionTooltipLayer,
  type HoldingDistributionTooltipState,
} from "../../components/HoldingDistributionTooltip";
import { formatPercentWidth4From01 } from "../../lib/distributionDisplay";
import {
  formatDecimalForDisplay,
  formatIntegerForDisplay,
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "../../lib/numberFormat";
import { instrumentTickerCell } from "./instrumentTickerCell";
import type { HomeInstrument, PortfolioDistributions } from "./types";

type HoldingsTableProps = {
  portfolio: PortfolioDistributions;
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
  /** Static/backtest portfolios use synthetic notionals; hide quantity and unit price columns. */
  hideQtyAndUnitEur?: boolean;
  /** When true, omit the section h2 (e.g. when a parent tab bar labels the view). */
  hideSectionTitle?: boolean;
};

type PortfolioPosition = PortfolioDistributions["positions"][number];

function sortByValueDesc(rows: PortfolioPosition[]): PortfolioPosition[] {
  return [...rows].sort((a, b) => b.valueEur - a.valueEur);
}

function HoldingsSubtable({
  title,
  rows,
  instrumentById,
  instrumentTickerById,
  setHoldingTooltip,
  hideQtyAndUnitEur,
}: {
  title: string;
  rows: PortfolioPosition[];
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
  setHoldingTooltip: Dispatch<
    SetStateAction<HoldingDistributionTooltipState | null>
  >;
  hideQtyAndUnitEur?: boolean;
}) {
  if (rows.length === 0) {
    return null;
  }

  const sectionValueEur = rows.reduce((s, p) => s + p.valueEur, 0);

  return (
    <div className="subsection-stack">
      <h3>{title}</h3>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="min-w-full">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-left p-2 font-medium">Ticker</th>
              {hideQtyAndUnitEur ? null : (
                <>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-right p-2 font-medium">Unit EUR</th>
                </>
              )}
              <th className="text-right p-2 font-medium">Value EUR</th>
              <th className="text-right p-2 font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const ticker = instrumentTickerCell(
                p.instrumentId,
                instrumentById,
                instrumentTickerById,
              );
              const weightWithinSection =
                sectionValueEur > 0 ? p.valueEur / sectionValueEur : 0;
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
                  {hideQtyAndUnitEur ? null : (
                    <>
                      <td className="p-2 text-right tabular-nums">
                        {formatIntegerForDisplay(
                          roundQuantityForDisplay(String(p.quantity)),
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {p.unitPriceEur == null
                          ? "-"
                          : formatUnitPriceForDisplay(String(p.unitPriceEur))}
                      </td>
                    </>
                  )}
                  <td className="p-2 text-right tabular-nums">
                    {formatDecimalForDisplay(p.valueEur, { decimalPlaces: 2 })}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatPercentWidth4From01(weightWithinSection)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HoldingsTable({
  portfolio,
  instrumentById,
  instrumentTickerById,
  hideQtyAndUnitEur = false,
  hideSectionTitle = false,
}: HoldingsTableProps) {
  const [holdingTooltip, setHoldingTooltip] =
    useState<HoldingDistributionTooltipState | null>(null);

  const { equities, bonds, commodities, cashAccounts } = useMemo(() => {
    const eq: PortfolioPosition[] = [];
    const bd: PortfolioPosition[] = [];
    const cm: PortfolioPosition[] = [];
    const cash: PortfolioPosition[] = [];
    for (const p of portfolio.positions) {
      if (p.assetClass === "cash_account") {
        cash.push(p);
      } else if (p.assetClass === "bond") {
        bd.push(p);
      } else if (p.assetClass === "commodity") {
        cm.push(p);
      } else {
        eq.push(p);
      }
    }
    return {
      equities: sortByValueDesc(eq),
      bonds: sortByValueDesc(bd),
      commodities: sortByValueDesc(cm),
      cashAccounts: sortByValueDesc(cash),
    };
  }, [portfolio.positions]);

  return (
    <section className="page-section">
      {hideSectionTitle ? null : <h2>Holdings</h2>}
      <HoldingsSubtable
        title="Cash accounts"
        rows={cashAccounts}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
      />
      <HoldingsSubtable
        title="Equities"
        rows={equities}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
      />
      <HoldingsSubtable
        title="Commodities"
        rows={commodities}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
      />
      <HoldingsSubtable
        title="Bonds"
        rows={bonds}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
      />
      <HoldingDistributionTooltipLayer
        tooltip={holdingTooltip}
        setTooltip={setHoldingTooltip}
        resolveInstrument={(id) => instrumentById.get(id)}
      />
    </section>
  );
}

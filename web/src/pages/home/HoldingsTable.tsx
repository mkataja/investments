import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { Button } from "../../components/Button";
import {
  HoldingDistributionTooltipLayer,
  type HoldingDistributionTooltipState,
} from "../../components/HoldingDistributionTooltip";
import { formatPercentWidth4From01 } from "../../lib/distributionDisplay";
import {
  formatDecimalForDisplay,
  formatQuantityForDisplay,
  formatUnitPriceForDisplay,
} from "../../lib/numberFormat";
import { ExportHoldingsModal } from "./ExportHoldingsModal";
import { HoldingBucketCell } from "./HoldingBucketCell";
import { instrumentTickerCell } from "./instrumentTickerCell";
import type {
  HoldingBucketOption,
  HomeInstrument,
  PortfolioDistributions,
} from "./types";

type HoldingsTableProps = {
  portfolio: PortfolioDistributions;
  portfolioId: number;
  holdingBuckets: HoldingBucketOption[];
  removedBucketNameHints: string[];
  registerRemovedBucketNames: (names: string[]) => void;
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
  load: () => void | Promise<void>;
  setError: (message: string | null) => void;
  /** Static/backtest portfolios use synthetic notionals; hide quantity and unit price columns. */
  hideQtyAndUnitEur?: boolean;
  /** When true, omit the section h2 (e.g. when a parent tab bar labels the view). */
  hideSectionTitle?: boolean;
};

type PortfolioPosition = PortfolioDistributions["positions"][number];

function sortByValueDesc(rows: PortfolioPosition[]): PortfolioPosition[] {
  return [...rows].sort((a, b) => b.valueEur - a.valueEur);
}

function HoldingsColGroup({
  hideQtyAndUnitEur,
}: {
  hideQtyAndUnitEur: boolean;
}) {
  return (
    <colgroup>
      <col />
      <col className="holdings-col-ticker" />
      <col className="holdings-col-bucket" />
      {hideQtyAndUnitEur ? null : (
        <>
          <col className="holdings-col-qty" />
          <col className="holdings-col-unit" />
        </>
      )}
      <col className="holdings-col-value" />
      <col className="holdings-col-pct" />
      <col className="holdings-col-pct" />
    </colgroup>
  );
}

function HoldingsSubtable({
  title,
  rows,
  sectionWeightHeader,
  totalPortfolioValueEur,
  instrumentById,
  instrumentTickerById,
  setHoldingTooltip,
  hideQtyAndUnitEur,
  portfolioId,
  holdingBuckets,
  removedBucketNameHints,
  registerRemovedBucketNames,
  load,
  setError,
}: {
  title: string;
  rows: PortfolioPosition[];
  sectionWeightHeader: string;
  totalPortfolioValueEur: number;
  instrumentById: Map<number, HomeInstrument>;
  instrumentTickerById: Map<number, string | null>;
  setHoldingTooltip: Dispatch<
    SetStateAction<HoldingDistributionTooltipState | null>
  >;
  hideQtyAndUnitEur?: boolean;
  portfolioId: number;
  holdingBuckets: HoldingBucketOption[];
  removedBucketNameHints: string[];
  registerRemovedBucketNames: (names: string[]) => void;
  load: () => void | Promise<void>;
  setError: (message: string | null) => void;
}) {
  if (rows.length === 0) {
    return null;
  }

  const sectionValueEur = rows.reduce((s, p) => s + p.valueEur, 0);

  return (
    <div className="subsection-stack">
      <h3>{title}</h3>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="holdings-table min-w-full">
          <HoldingsColGroup hideQtyAndUnitEur={!!hideQtyAndUnitEur} />
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-left p-2 font-medium">Ticker</th>
              <th className="text-left p-2 font-medium">Bucket</th>
              {hideQtyAndUnitEur ? null : (
                <>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-right p-2 font-medium">Unit EUR</th>
                </>
              )}
              <th className="text-right p-2 font-medium">Value EUR</th>
              <th className="table-col-compact-pct-th">
                {sectionWeightHeader}
              </th>
              <th className="table-col-compact-pct-th table-col-compact-pct-trailing">
                Weight (total)
              </th>
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
              const weightOfTotal =
                totalPortfolioValueEur > 0
                  ? p.valueEur / totalPortfolioValueEur
                  : 0;
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
                  <td className="p-2 text-left min-w-0 font-medium text-slate-900">
                    {p.displayName}
                  </td>
                  <td className="p-2 text-left tabular-nums text-slate-700">
                    {ticker}
                  </td>
                  <td className="p-1 align-middle min-w-0">
                    <HoldingBucketCell
                      portfolioId={portfolioId}
                      instrumentId={p.instrumentId}
                      customBucketName={p.customBucketName}
                      buckets={holdingBuckets}
                      removedBucketNameHints={removedBucketNameHints}
                      onUpdated={load}
                      onRemovedBucketNames={registerRemovedBucketNames}
                      onError={setError}
                    />
                  </td>
                  {hideQtyAndUnitEur ? null : (
                    <>
                      <td className="p-2 text-right tabular-nums">
                        {formatQuantityForDisplay(String(p.quantity))}
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
                  <td className="table-col-compact-pct">
                    {formatPercentWidth4From01(weightWithinSection)}
                  </td>
                  <td className="table-col-compact-pct table-col-compact-pct-trailing">
                    {formatPercentWidth4From01(weightOfTotal)}
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
  portfolioId,
  holdingBuckets,
  removedBucketNameHints,
  registerRemovedBucketNames,
  instrumentById,
  instrumentTickerById,
  load,
  setError,
  hideQtyAndUnitEur = false,
  hideSectionTitle = false,
}: HoldingsTableProps) {
  const [holdingTooltip, setHoldingTooltip] =
    useState<HoldingDistributionTooltipState | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const { equities, bonds, commodities, cashAccounts, totalPortfolioValueEur } =
    useMemo(() => {
      const eq: PortfolioPosition[] = [];
      const bd: PortfolioPosition[] = [];
      const cm: PortfolioPosition[] = [];
      const cash: PortfolioPosition[] = [];
      let totalPortfolioValueEur = 0;
      for (const p of portfolio.positions) {
        totalPortfolioValueEur += p.valueEur;
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
        totalPortfolioValueEur,
      };
    }, [portfolio.positions]);

  return (
    <section className="page-section">
      <div className="flex flex-wrap items-baseline justify-start gap-3 mb-3">
        <Button type="button" onClick={() => setExportOpen(true)}>
          Export holdings
        </Button>
        {hideSectionTitle ? null : <h2>Holdings</h2>}
      </div>
      <ExportHoldingsModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        positions={portfolio.positions}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
      />
      <HoldingsSubtable
        title="Cash accounts"
        rows={cashAccounts}
        sectionWeightHeader="Weight (cash)"
        totalPortfolioValueEur={totalPortfolioValueEur}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
        portfolioId={portfolioId}
        holdingBuckets={holdingBuckets}
        removedBucketNameHints={removedBucketNameHints}
        registerRemovedBucketNames={registerRemovedBucketNames}
        load={load}
        setError={setError}
      />
      <HoldingsSubtable
        title="Equities"
        rows={equities}
        sectionWeightHeader="Weight (equities)"
        totalPortfolioValueEur={totalPortfolioValueEur}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
        portfolioId={portfolioId}
        holdingBuckets={holdingBuckets}
        removedBucketNameHints={removedBucketNameHints}
        registerRemovedBucketNames={registerRemovedBucketNames}
        load={load}
        setError={setError}
      />
      <HoldingsSubtable
        title="Commodities"
        rows={commodities}
        sectionWeightHeader="Weight (commodities)"
        totalPortfolioValueEur={totalPortfolioValueEur}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
        portfolioId={portfolioId}
        holdingBuckets={holdingBuckets}
        removedBucketNameHints={removedBucketNameHints}
        registerRemovedBucketNames={registerRemovedBucketNames}
        load={load}
        setError={setError}
      />
      <HoldingsSubtable
        title="Bonds"
        rows={bonds}
        sectionWeightHeader="Weight"
        totalPortfolioValueEur={totalPortfolioValueEur}
        instrumentById={instrumentById}
        instrumentTickerById={instrumentTickerById}
        setHoldingTooltip={setHoldingTooltip}
        hideQtyAndUnitEur={hideQtyAndUnitEur}
        portfolioId={portfolioId}
        holdingBuckets={holdingBuckets}
        removedBucketNameHints={removedBucketNameHints}
        registerRemovedBucketNames={registerRemovedBucketNames}
        load={load}
        setError={setError}
      />
      <HoldingDistributionTooltipLayer
        tooltip={holdingTooltip}
        setTooltip={setHoldingTooltip}
        resolveInstrument={(id) => instrumentById.get(id)}
      />
    </section>
  );
}

import { sortByTransactionInstrumentSelectLabel } from "@investments/lib/instrumentSelectLabel";
import { useEffect, useMemo, useState } from "react";
import { apiDelete } from "../../api/client";
import { formatInstantForDisplay } from "../../lib/dateTimeFormat";
import { instrumentSelectUiLabel } from "../../lib/instrumentSelectUiLabel";
import {
  formatIntegerForDisplay,
  formatQuantityForDisplay,
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
} from "../../lib/numberFormat";
import { instrumentTickerCell } from "./instrumentTickerCell";
import { positionValueAfterLabelByTransactionId } from "./transactionsPositionValueAfter";
import type { HomeInstrument, HomeTransaction } from "./types";

function transactionSideLabel(side: string, instrumentKind?: string): string {
  if (instrumentKind === "cash_account") {
    if (side === "buy") return "Deposit";
    if (side === "sell") return "Withdrawal";
  }
  if (side === "buy") return "Buy";
  if (side === "sell") return "Sell";
  return side;
}

function sideAccentClass(side: string): string | undefined {
  if (side === "buy") return "txn-side-buy";
  if (side === "sell") return "txn-side-sell";
  return undefined;
}

type TransactionsTableProps = {
  transactions: HomeTransaction[];
  brokerNameById: Map<number, string>;
  instrumentById: Map<number, HomeInstrument>;
  instrumentNameById: Map<number, string>;
  instrumentTickerById: Map<number, string | null>;
  onEdit: (t: HomeTransaction) => void;
  onDeleted: () => void | Promise<void>;
  onError: (message: string | null) => void;
  readOnly?: boolean;
  /** When true, omit the section h2 (e.g. when a parent tab bar labels the view). */
  hideSectionTitle?: boolean;
};

export function TransactionsTable({
  transactions,
  brokerNameById,
  instrumentById,
  instrumentNameById,
  instrumentTickerById,
  onEdit,
  onDeleted,
  onError,
  readOnly = false,
  hideSectionTitle = false,
}: TransactionsTableProps) {
  const [filterInstrumentId, setFilterInstrumentId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    if (filterInstrumentId == null) {
      return;
    }
    if (!transactions.some((t) => t.instrumentId === filterInstrumentId)) {
      setFilterInstrumentId(null);
    }
  }, [transactions, filterInstrumentId]);

  const valueAfterByTxnId = useMemo(
    () => positionValueAfterLabelByTransactionId(transactions, instrumentById),
    [transactions, instrumentById],
  );

  const instrumentFilterOptions = useMemo(() => {
    const ids = [...new Set(transactions.map((t) => t.instrumentId))];
    const known = ids
      .map((id) => instrumentById.get(id))
      .filter((i): i is HomeInstrument => i != null);
    const sortedKnownIds = sortByTransactionInstrumentSelectLabel(known).map(
      (i) => i.id,
    );
    const unknownIds = ids
      .filter((id) => instrumentById.get(id) == null)
      .sort((a, b) => a - b);
    return [...sortedKnownIds, ...unknownIds];
  }, [transactions, instrumentById]);

  const visibleTransactions = useMemo(() => {
    if (filterInstrumentId == null) {
      return transactions;
    }
    return transactions.filter((t) => t.instrumentId === filterInstrumentId);
  }, [transactions, filterInstrumentId]);

  return (
    <section className="page-section">
      {hideSectionTitle ? null : <h2>Transactions</h2>}
      {transactions.length > 0 ? (
        <label className="flex flex-wrap items-baseline gap-2 text-sm text-slate-700 mb-2">
          <span className="whitespace-nowrap">Instrument</span>
          <select
            className="border border-slate-300 rounded px-2 py-1 text-sm bg-white min-w-[12rem] max-w-full"
            value={filterInstrumentId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setFilterInstrumentId(null);
                return;
              }
              const id = Number.parseInt(v, 10);
              setFilterInstrumentId(Number.isFinite(id) ? id : null);
            }}
          >
            <option value="">All</option>
            {instrumentFilterOptions.map((id) => {
              const inst = instrumentById.get(id);
              return (
                <option key={id} value={id}>
                  {inst != null ? instrumentSelectUiLabel(inst) : `#${id}`}
                </option>
              );
            })}
          </select>
        </label>
      ) : null}
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="min-w-full">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Date/time</th>
              <th className="text-left p-2 font-medium">Side</th>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-left p-2 font-medium">Ticker</th>
              <th className="text-left p-2 font-medium">Broker</th>
              <th className="text-right p-2 font-medium">Qty</th>
              <th className="text-right p-2 font-medium">Price</th>
              <th className="text-right p-2 font-medium">Value</th>
              <th className="text-right p-2 font-medium">Value after</th>
              {readOnly ? null : (
                <th className="text-right p-2 font-medium w-30">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleTransactions.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="p-2">{formatInstantForDisplay(t.tradeDate)}</td>
                <td className="p-2">
                  <span className={sideAccentClass(t.side)}>
                    {transactionSideLabel(
                      t.side,
                      instrumentById.get(t.instrumentId)?.kind,
                    )}
                  </span>
                </td>
                <td className="p-2 text-left min-w-[12rem] font-medium text-slate-900">
                  {instrumentNameById.get(t.instrumentId) ??
                    `#${t.instrumentId}`}
                </td>
                <td className="p-2 text-left tabular-nums text-slate-700">
                  {instrumentTickerCell(
                    t.instrumentId,
                    instrumentById,
                    instrumentTickerById,
                  )}
                </td>
                <td className="p-2 text-left min-w-[8rem]">
                  {brokerNameById.get(t.brokerId) ?? `#${t.brokerId}`}
                </td>
                <td className="p-2 text-right">
                  {instrumentById.get(t.instrumentId)?.kind === "cash_account"
                    ? "-"
                    : formatQuantityForDisplay(t.quantity)}
                </td>
                <td className="p-2 text-right">
                  {instrumentById.get(t.instrumentId)?.kind ===
                  "cash_account" ? (
                    "-"
                  ) : (
                    <span className={sideAccentClass(t.side)}>
                      {formatTransactionUnitPriceForDisplay(
                        t.side,
                        t.unitPrice,
                      )}{" "}
                      {t.currency}
                    </span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  <span className={sideAccentClass(t.side)}>
                    {formatTransactionTotalValueForDisplay(
                      t.side,
                      t.quantity,
                      t.unitPrice,
                      t.currency,
                      instrumentById.get(t.instrumentId)?.kind,
                    )}
                  </span>
                </td>
                <td className="p-2 text-right tabular-nums text-slate-800">
                  {valueAfterByTxnId.get(t.id) ?? "-"}
                </td>
                {readOnly ? null : (
                  <td className="text-right p-2 space-x-3 whitespace-nowrap">
                    <button
                      type="button"
                      className="action-primary"
                      onClick={() => onEdit(t)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action-delete"
                      onClick={() => {
                        if (
                          !window.confirm(
                            "Delete this transaction? This cannot be undone.",
                          )
                        ) {
                          return;
                        }
                        onError(null);
                        void (async () => {
                          try {
                            await apiDelete(`/transactions/${t.id}`);
                            await onDeleted();
                          } catch (err) {
                            onError(String(err));
                          }
                        })();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibleTransactions.length > 0 ? (
        <p className="text-sm text-slate-600 tabular-nums">
          {formatIntegerForDisplay(visibleTransactions.length)}{" "}
          {visibleTransactions.length === 1 ? "transaction" : "transactions"}
        </p>
      ) : null}
    </section>
  );
}

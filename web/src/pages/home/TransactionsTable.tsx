import { apiDelete } from "../../api";
import { formatInstantForDisplay } from "../../lib/dateTimeFormat";
import {
  formatTransactionTotalValueForDisplay,
  formatTransactionUnitPriceForDisplay,
  formatUnitPriceForDisplay,
  roundQuantityForDisplay,
} from "../../lib/numberFormat";
import { instrumentTickerCell } from "./instrumentTickerCell";
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

type TransactionsTableProps = {
  transactions: HomeTransaction[];
  instrumentById: Map<number, HomeInstrument>;
  instrumentNameById: Map<number, string>;
  instrumentTickerById: Map<number, string | null>;
  onEdit: (t: HomeTransaction) => void;
  onDeleted: () => void | Promise<void>;
  onError: (message: string | null) => void;
};

export function TransactionsTable({
  transactions,
  instrumentById,
  instrumentNameById,
  instrumentTickerById,
  onEdit,
  onDeleted,
  onError,
}: TransactionsTableProps) {
  return (
    <section className="page-section">
      <h2>Transactions</h2>
      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm text-sm">
        <table className="min-w-full">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">Date/time</th>
              <th className="text-left p-2 font-medium">Side</th>
              <th className="text-left p-2 font-medium">Instrument</th>
              <th className="text-left p-2 font-medium">Ticker</th>
              <th className="text-right p-2 font-medium">Qty</th>
              <th className="text-right p-2 font-medium">Price</th>
              <th className="text-right p-2 font-medium">Value</th>
              <th className="text-right p-2 font-medium w-30">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="p-2">{formatInstantForDisplay(t.tradeDate)}</td>
                <td className="p-2">
                  {transactionSideLabel(
                    t.side,
                    instrumentById.get(t.instrumentId)?.kind,
                  )}
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
                <td className="p-2 text-right">
                  {instrumentById.get(t.instrumentId)?.kind === "cash_account"
                    ? formatUnitPriceForDisplay(t.quantity)
                    : roundQuantityForDisplay(t.quantity)}
                </td>
                <td className="p-2 text-right">
                  {instrumentById.get(t.instrumentId)?.kind ===
                  "cash_account" ? (
                    "-"
                  ) : (
                    <>
                      {formatTransactionUnitPriceForDisplay(
                        t.side,
                        t.unitPrice,
                      )}{" "}
                      {t.currency}
                    </>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatTransactionTotalValueForDisplay(
                    t.side,
                    t.quantity,
                    t.unitPrice,
                    t.currency,
                    instrumentById.get(t.instrumentId)?.kind,
                  )}
                </td>
                <td className="text-right p-2 space-x-3 whitespace-nowrap">
                  <button
                    type="button"
                    className="text-action-edit underline text-sm"
                    onClick={() => onEdit(t)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-action-delete underline text-sm"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {transactions.length > 0 ? (
        <p className="text-sm text-slate-600 tabular-nums">
          {transactions.length}{" "}
          {transactions.length === 1 ? "transaction" : "transactions"}
        </p>
      ) : null}
    </section>
  );
}

import {
  instrumentKindColumnLabel,
  instrumentTickerDisplay,
} from "@investments/lib/instrumentKind";
import { Link } from "react-router-dom";
import {
  CashAccountDistributionSummary,
  DistributionSummary,
} from "../../components/InstrumentDistributionSummary";
import { classNames } from "../../lib/css";
import { formatInstantForDisplay } from "../../lib/dateTimeFormat";
import type { InstrumentListItem } from "./types";

function RowRefreshSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 animate-spin ${className ?? ""}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

type InstrumentsTableProps = {
  sortedRows: InstrumentListItem[];
  error: string | null;
  refreshingIds: ReadonlySet<number>;
  refreshingAll: boolean;
  /** Row currently receiving refresh-all distribution fetch (`null` when not running or between rows). */
  refreshingInstrumentId: number | null;
  backfillingAll: boolean;
  /** Row currently receiving Yahoo chart backfill (`null` when not backfilling or between rows). */
  backfillingInstrumentId: number | null;
  deletingId: number | null;
  onRefreshRow: (i: InstrumentListItem) => void;
  onDelete: (i: InstrumentListItem) => void;
};

export function InstrumentsTable({
  sortedRows,
  error,
  refreshingIds,
  refreshingAll,
  refreshingInstrumentId,
  backfillingAll,
  backfillingInstrumentId,
  deletingId,
  onRefreshRow,
  onDelete,
}: InstrumentsTableProps) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="text-left p-2 font-medium">Kind</th>
            <th className="text-left p-2 font-medium">Ticker</th>
            <th className="text-left p-2 font-medium whitespace-nowrap">
              ISIN
            </th>
            <th className="text-left p-2 font-medium">Name</th>
            <th className="text-left p-2 font-medium w-[460px]">
              Distribution
            </th>
            <th className="text-left p-2 font-medium whitespace-nowrap">
              Last updated
            </th>
            <th className="text-right p-2 font-medium w-40">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((i) => {
            const rowRefreshing =
              refreshingIds.has(i.id) || refreshingInstrumentId === i.id;
            const rowBackfilling = backfillingInstrumentId === i.id;
            const ticker = instrumentTickerDisplay(i);
            return (
              <tr key={i.id} className="border-t border-slate-100 align-top">
                <td className="p-2 text-slate-800">
                  {instrumentKindColumnLabel(i)}
                </td>
                <td className="p-2 text-slate-700">{ticker ?? "-"}</td>
                <td className="p-2 text-slate-700 tabular-nums whitespace-nowrap">
                  {i.isin ?? "-"}
                </td>
                <td className="p-2 font-medium text-slate-900">
                  {i.displayName}
                </td>
                <td className="p-2 min-w-[14rem] max-w-xl align-top font-mono">
                  {i.kind === "cash_account" ? (
                    <CashAccountDistributionSummary
                      cashGeoKey={i.cashGeoKey ?? ""}
                    />
                  ) : i.distribution ? (
                    <DistributionSummary payload={i.distribution.payload} />
                  ) : (
                    <span className="text-slate-400 font-sans">
                      No cache yet
                    </span>
                  )}
                </td>
                <td className="p-2 align-top text-left min-w-[10rem] max-w-xs">
                  {i.kind === "cash_account" ? (
                    <span className="text-slate-400 font-sans">-</span>
                  ) : i.distribution ? (
                    i.distribution.fetchedAt !== "" ? (
                      <span className="text-[11px] text-slate-600 tabular-nums font-sans">
                        {formatInstantForDisplay(i.distribution.fetchedAt)}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-sans">-</span>
                    )
                  ) : (
                    <span className="text-slate-400 font-sans">-</span>
                  )}
                </td>
                <td className="p-2 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex flex-wrap justify-end gap-3">
                      {(i.kind === "cash_account" ||
                        i.kind === "etf" ||
                        i.kind === "stock" ||
                        i.kind === "commodity") && (
                        <Link
                          to={`/instruments/${i.id}/edit`}
                          className="action-primary"
                        >
                          Edit
                        </Link>
                      )}
                      <button
                        type="button"
                        disabled={
                          deletingId === i.id ||
                          refreshingIds.has(i.id) ||
                          refreshingAll ||
                          backfillingAll
                        }
                        onClick={() => void onDelete(i)}
                        className="action-delete"
                      >
                        {deletingId === i.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                    {i.kind !== "cash_account" && (
                      <button
                        type="button"
                        disabled={
                          refreshingIds.has(i.id) ||
                          deletingId === i.id ||
                          refreshingAll ||
                          backfillingAll
                        }
                        onClick={() => void onRefreshRow(i)}
                        aria-busy={rowRefreshing || rowBackfilling}
                        className={classNames(
                          "action-primary inline-flex items-center gap-1.5 whitespace-nowrap",
                          (rowRefreshing || rowBackfilling) && "no-underline",
                        )}
                      >
                        {rowBackfilling ? (
                          <>
                            <RowRefreshSpinner />
                            <span>Backfilling...</span>
                          </>
                        ) : rowRefreshing ? (
                          <>
                            <RowRefreshSpinner />
                            <span>Refreshing...</span>
                          </>
                        ) : (
                          "Refresh"
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sortedRows.length === 0 && !error && (
        <p className="p-6 text-slate-500 text-sm">No instruments yet.</p>
      )}
    </div>
  );
}

import {
  type DistributionPayload,
  instrumentKindColumnLabel,
  instrumentTickerDisplay,
} from "@investments/lib";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPost } from "../api";
import { Button, ButtonLink } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import {
  CashAccountDistributionSummary,
  DistributionSummary,
} from "../components/InstrumentDistributionSummary";
import { InstrumentsTableSkeleton } from "../components/listPageSkeletons";
import { formatInstantForDisplay } from "../lib/dateTimeFormat";

type SeligsonFundSummary = {
  id: number;
  fid: number;
  name: string;
};

type InstrumentListItem = {
  id: number;
  kind: string;
  displayName: string;
  yahooSymbol: string | null;
  isin: string | null;
  seligsonFundId: number | null;
  brokerId: number | null;
  broker: {
    id: number;
    name: string;
    brokerType: string;
  } | null;
  cashGeoKey: string | null;
  cashCurrency: string | null;
  cashInterestType: string | null;
  createdAt: string;
  netQuantity: number;
  distribution: {
    fetchedAt: string;
    source: string;
    payload: DistributionPayload;
    yahooFinance?: { raw: unknown } | null;
    seligsonDistribution?: {
      holdingsHtml: string | null;
      allocationHtml: string | null;
      countryHtml: string | null;
    } | null;
  } | null;
  seligsonFund: SeligsonFundSummary | null;
};

type RefreshResponse =
  | { ok: true; instrument: InstrumentListItem }
  | { skipped: true; reason: string };

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

export function InstrumentsPage() {
  const [rows, setRows] = useState<InstrumentListItem[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      const data = await apiGet<InstrumentListItem[]>("/instruments");
      setRows(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setInitialLoad(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshDistribution(i: InstrumentListItem) {
    if (i.kind === "cash_account") {
      return;
    }
    setError(null);
    setNotice(null);
    setRefreshingId(i.id);
    try {
      const res = await apiPost<RefreshResponse>(
        `/instruments/${i.id}/refresh-distribution`,
      );
      if ("skipped" in res) {
        if (res.reason === "manual") {
          setError(
            "This instrument uses a manual distribution cache; automatic refresh is skipped.",
          );
        } else {
          setError(`Refresh skipped (${res.reason}).`);
        }
        return;
      }
      if ("instrument" in res && res.instrument) {
        setRows((prev) =>
          prev.map((r) => (r.id === i.id ? { ...r, ...res.instrument } : r)),
        );
      } else {
        await load();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshingId(null);
    }
  }

  async function refreshAllDistributions() {
    const targets = rows.filter((r) => r.kind !== "cash_account");
    if (targets.length === 0) {
      return;
    }
    setError(null);
    setNotice(null);
    setRefreshingAll(true);
    let ok = 0;
    let skippedManual = 0;
    let skippedOther = 0;
    let failed = 0;
    let firstFailure: string | null = null;
    try {
      for (const i of targets) {
        try {
          const res = await apiPost<RefreshResponse>(
            `/instruments/${i.id}/refresh-distribution`,
          );
          if ("skipped" in res) {
            if (res.reason === "manual") {
              skippedManual += 1;
            } else {
              skippedOther += 1;
            }
          } else {
            ok += 1;
          }
        } catch (e) {
          failed += 1;
          if (firstFailure == null) {
            firstFailure = e instanceof Error ? e.message : String(e);
          }
        }
      }
      await load();
      const parts: string[] = [];
      if (ok > 0) {
        parts.push(
          `${ok} ${ok === 1 ? "instrument" : "instruments"} refreshed`,
        );
      }
      if (skippedManual > 0) {
        parts.push(`${skippedManual} skipped (manual cache)`);
      }
      if (skippedOther > 0) {
        parts.push(`${skippedOther} skipped`);
      }
      if (failed > 0) {
        parts.push(
          `${failed} failed${firstFailure ? ` (${firstFailure.length > 120 ? `${firstFailure.slice(0, 117)}…` : firstFailure})` : ""}`,
        );
      }
      if (parts.length > 0) {
        setNotice(parts.join(" · "));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshingAll(false);
    }
  }

  async function removeInstrument(i: InstrumentListItem) {
    if (
      !window.confirm(
        `Remove “${i.displayName}”? All transactions and cached distributions for this instrument will be deleted. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    setDeletingId(i.id);
    try {
      await apiDelete(`/instruments/${i.id}`);
      setRows((prev) => prev.filter((r) => r.id !== i.id));
    } catch (e) {
      setError(String(e));
    } finally {
      setDeletingId(null);
    }
  }

  const refreshableCount = rows.filter((r) => r.kind !== "cash_account").length;

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const ta = instrumentTickerDisplay(a);
        const tb = instrumentTickerDisplay(b);
        const aEmpty = ta == null || ta === "";
        const bEmpty = tb == null || tb === "";
        if (aEmpty !== bEmpty) {
          return aEmpty ? 1 : -1;
        }
        const byTicker = (ta ?? "").localeCompare(tb ?? "", undefined, {
          numeric: true,
          sensitivity: "base",
        });
        if (byTicker !== 0) {
          return byTicker;
        }
        return a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
        });
      }),
    [rows],
  );

  return (
    <div className="w-full min-w-0 page-stack">
      <header className="flex flex-wrap items-center justify-between gap-3 page-header-sticky">
        <h1>Instruments</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
              initialLoad ||
              refreshableCount === 0 ||
              refreshingAll ||
              refreshingId !== null ||
              deletingId !== null
            }
            onClick={() => void refreshAllDistributions()}
          >
            {refreshingAll ? "Refreshing all…" : "Refresh all"}
          </Button>
          <ButtonLink to="/instruments/new">New instrument</ButtonLink>
        </div>
      </header>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      {notice && <p className="banner-notice">{notice}</p>}

      {initialLoad ? (
        <InstrumentsTableSkeleton />
      ) : (
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
                const rowRefreshing = refreshingId === i.id || refreshingAll;
                const ticker = instrumentTickerDisplay(i);
                return (
                  <tr
                    key={i.id}
                    className="border-t border-slate-100 align-top"
                  >
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
                      <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-3">
                        {i.kind !== "cash_account" && (
                          <button
                            type="button"
                            disabled={
                              refreshingId === i.id ||
                              deletingId === i.id ||
                              refreshingAll
                            }
                            onClick={() => void refreshDistribution(i)}
                            aria-busy={rowRefreshing}
                            className="action-primary"
                          >
                            {rowRefreshing ? (
                              <>
                                <RowRefreshSpinner />
                                <span>Refreshing…</span>
                              </>
                            ) : (
                              "Refresh"
                            )}
                          </button>
                        )}
                        {(i.kind === "cash_account" ||
                          i.kind === "etf" ||
                          i.kind === "stock") && (
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
                            refreshingId === i.id ||
                            refreshingAll
                          }
                          onClick={() => void removeInstrument(i)}
                          className="action-delete"
                        >
                          {deletingId === i.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && !error && (
            <p className="p-6 text-slate-500 text-sm">No instruments yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

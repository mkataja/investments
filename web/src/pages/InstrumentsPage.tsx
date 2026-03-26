import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { Button, ButtonLink } from "../components/Button";
import {
  aggregateRegionsToBuckets,
  formatDistributionTooltip,
  geoBucketDisplayLabel,
  geoSegmentsForDisplay,
  sortedSectorsForDisplay,
} from "../lib/distributionDisplay";

type DistributionPayload = {
  regions: Record<string, number>;
  sectors: Record<string, number>;
};

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
  cashGeoKey: string | null;
  cashCurrency: string | null;
  cashInterestType: string | null;
  markPriceEur: string | null;
  createdAt: string;
  netQuantity: number;
  distribution: {
    fetchedAt: string;
    source: string;
    payload: DistributionPayload;
    /** Yahoo quoteSummary JSON or Seligson HTML; absent for manual/legacy cache. */
    rawPayload?: unknown;
  } | null;
  seligsonFund: SeligsonFundSummary | null;
};

function DistributionSummary({
  payload,
  source,
  fetchedAt,
}: {
  payload: DistributionPayload;
  source: string;
  fetchedAt: string;
}) {
  const geoSegs = geoSegmentsForDisplay(
    aggregateRegionsToBuckets(payload.regions),
  );
  const sectorRows = sortedSectorsForDisplay(payload.sectors);
  const tooltip = formatDistributionTooltip(payload.regions, payload.sectors);
  return (
    <div className="space-y-1" title={tooltip}>
      <div className="text-xs text-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 min-w-0">
          {geoSegs.length > 0 ? (
            geoSegs.map((s) => (
              <span
                key={s.bucket}
                className="inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
              >
                {s.bucket === "finland" ||
                s.bucket === "europe" ||
                s.bucket === "north_america" ||
                s.bucket === "china" ||
                s.bucket === "unknown" ? (
                  <span
                    className="text-2xl leading-none select-none"
                    title={
                      s.bucket === "finland"
                        ? "Finland"
                        : s.bucket === "europe"
                          ? "Europe (excl. Finland)"
                          : s.bucket === "north_america"
                            ? "North America"
                            : s.bucket === "china"
                              ? "China (incl. HK/MO)"
                              : "Unmapped country label (add to countryIso)"
                    }
                    aria-hidden
                  >
                    {geoBucketDisplayLabel(s.bucket)}
                  </span>
                ) : (
                  <span className="font-mono">
                    {geoBucketDisplayLabel(s.bucket)}
                  </span>
                )}
                <span className="font-mono tabular-nums">{s.pctLabel}</span>
              </span>
            ))
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
      <div className="text-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 min-w-0">
          {sectorRows.length > 0 ? (
            sectorRows.map((s) => (
              <span
                key={s.name}
                title={s.name}
                className="inline-flex items-center gap-0.5 shrink-0"
              >
                <span className="text-2xl leading-none select-none" aria-hidden>
                  {s.icon}
                </span>
                <span className="text-xs font-mono tabular-nums">
                  {s.pctLabel}
                </span>
              </span>
            ))
          ) : (
            <span className="text-xs py-0.5">—</span>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 leading-snug">
        <span className="font-medium text-emerald-900">{source}</span>
        <span className="text-slate-400"> · </span>
        {new Date(fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}

type RefreshResponse = { ok: true } | { skipped: true; reason: string };

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
      await load();
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
    try {
      for (const i of targets) {
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

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Instruments</h1>
          <p className="text-slate-600 text-sm mt-1 max-w-xl">
            Each row is one registered instrument. Distributions are cached
            geographic and sector weights from Yahoo or Seligson for that
            symbol—nothing here is aggregated from your transactions or
            positions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={
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

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {notice && (
        <p className="text-emerald-900 text-sm bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="text-left p-2 font-medium">ID</th>
              <th className="text-left p-2 font-medium">Kind</th>
              <th className="text-left p-2 font-medium">Name</th>
              <th className="text-left p-2 font-medium">Distribution</th>
              <th className="text-right p-2 font-medium w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const rowRefreshing = refreshingId === i.id || refreshingAll;
              return (
                <tr key={i.id} className="border-t border-slate-100 align-top">
                  <td className="p-2 font-mono text-slate-600">{i.id}</td>
                  <td className="p-2 text-slate-800">{i.kind}</td>
                  <td className="p-2 font-medium text-slate-900">
                    {i.displayName}
                  </td>
                  <td className="p-2 min-w-[14rem] max-w-xl align-top">
                    {i.distribution ? (
                      <DistributionSummary
                        payload={i.distribution.payload}
                        source={i.distribution.source}
                        fetchedAt={i.distribution.fetchedAt}
                      />
                    ) : (
                      <span className="text-slate-400">No cache yet</span>
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
                          className="text-sm text-emerald-800 hover:underline disabled:opacity-50 inline-flex items-center justify-end gap-1.5"
                        >
                          {rowRefreshing ? (
                            <>
                              <RowRefreshSpinner className="text-emerald-800" />
                              <span>Refreshing…</span>
                            </>
                          ) : (
                            "Refresh"
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={
                          deletingId === i.id ||
                          refreshingId === i.id ||
                          refreshingAll
                        }
                        onClick={() => void removeInstrument(i)}
                        className="text-sm text-red-700 hover:underline disabled:opacity-50"
                      >
                        {deletingId === i.id ? "Removing…" : "Remove"}
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
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPost } from "../api";
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
      <div className="overflow-x-auto text-xs text-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
          {geoSegs.length > 0 ? (
            geoSegs.map((s) => (
              <span
                key={s.bucket}
                className="inline-flex items-center gap-0.5 whitespace-nowrap"
              >
                {s.bucket === "EU" || s.bucket === "NA" ? (
                  <span
                    className="text-2xl leading-none select-none"
                    title={
                      s.bucket === "EU" ? "European Union" : "North America"
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
      <div className="overflow-x-auto text-slate-800">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5">
          {sectorRows.length > 0 ? (
            sectorRows.map((s) => (
              <span
                key={s.name}
                title={s.name}
                className="inline-flex items-center gap-0.5"
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

export function InstrumentsPage() {
  const [rows, setRows] = useState<InstrumentListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
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
    setRefreshingId(i.id);
    try {
      type RefreshResponse = { ok: true } | { skipped: true; reason: string };
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

  async function removeInstrument(i: InstrumentListItem) {
    if (
      !window.confirm(
        `Remove “${i.displayName}”? All transactions and cached distributions for this instrument will be deleted. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
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
        <Link
          to="/instruments/new"
          className="text-sm font-medium text-emerald-800 hover:underline"
        >
          New instrument
        </Link>
      </header>

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
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
            {rows.map((i) => (
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
                        disabled={refreshingId === i.id || deletingId === i.id}
                        onClick={() => void refreshDistribution(i)}
                        className="text-sm text-emerald-800 hover:underline disabled:opacity-50"
                      >
                        {refreshingId === i.id ? "Refreshing…" : "Refresh"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === i.id || refreshingId === i.id}
                      onClick={() => void removeInstrument(i)}
                      className="text-sm text-red-700 hover:underline disabled:opacity-50"
                    >
                      {deletingId === i.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error && (
          <p className="p-6 text-slate-500 text-sm">No instruments yet.</p>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet, apiPost } from "../api";

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

function formatWeights(rec: Record<string, number>, limit = 8) {
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => ({ name: k, pct: v * 100 }));
}

function identifierLine(i: InstrumentListItem): string {
  if (i.kind === "cash_account") {
    const parts = [i.cashCurrency, i.cashGeoKey].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }
  if (i.kind === "seligson_fund" && i.seligsonFund) {
    return `FID ${i.seligsonFund.fid} · ${i.seligsonFund.name}`;
  }
  const bits = [i.yahooSymbol, i.isin].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "—";
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
          <p className="text-slate-600 text-sm mt-1">
            All registered instruments, cached region/sector weights, and net
            quantity from transactions.
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
              <th className="text-left p-2 font-medium">Identifiers</th>
              <th className="text-right p-2 font-medium">Net qty</th>
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
                <td className="p-2 text-slate-600 max-w-xs break-words">
                  {identifierLine(i)}
                </td>
                <td className="p-2 text-right font-mono text-slate-800">
                  {i.netQuantity === 0 ? "0" : i.netQuantity.toFixed(6)}
                </td>
                <td className="p-2 min-w-[12rem]">
                  {i.distribution ? (
                    <details className="group">
                      <summary className="cursor-pointer text-emerald-900 hover:underline">
                        <span className="font-medium">
                          {i.distribution.source}
                        </span>
                        <span className="text-slate-500 font-normal">
                          {" "}
                          ·{" "}
                          {new Date(i.distribution.fetchedAt).toLocaleString()}
                        </span>
                      </summary>
                      <div className="mt-2 pl-1 space-y-2 text-xs text-slate-700">
                        <div>
                          <div className="font-medium text-slate-800 mb-1">
                            Regions
                          </div>
                          <ul className="space-y-0.5">
                            {formatWeights(i.distribution.payload.regions).map(
                              (r) => (
                                <li
                                  key={r.name}
                                  className="flex justify-between gap-4"
                                >
                                  <span>{r.name}</span>
                                  <span className="font-mono">
                                    {r.pct.toFixed(1)}%
                                  </span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 mb-1">
                            Sectors
                          </div>
                          <ul className="space-y-0.5">
                            {formatWeights(i.distribution.payload.sectors).map(
                              (s) => (
                                <li
                                  key={s.name}
                                  className="flex justify-between gap-4"
                                >
                                  <span>{s.name}</span>
                                  <span className="font-mono">
                                    {s.pct.toFixed(1)}%
                                  </span>
                                </li>
                              ),
                            )}
                          </ul>
                        </div>
                      </div>
                    </details>
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

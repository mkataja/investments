import { instrumentTickerDisplay } from "@investments/lib";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../api/client";
import {
  bucketRefreshBatchResult,
  interpretRefreshDistributionResponse,
  userMessageForSkippedRefresh,
} from "../../api/instrumentRefreshDistribution";
import type { InstrumentListItem, RefreshDistributionResponse } from "./types";

export function useInstrumentsList() {
  const [rows, setRows] = useState<InstrumentListItem[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshingIds, setRefreshingIds] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
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

  const refreshDistribution = useCallback(
    async (i: InstrumentListItem) => {
      if (i.kind === "cash_account") {
        return;
      }
      setError(null);
      setNotice(null);
      setRefreshingIds((prev) => new Set(prev).add(i.id));
      try {
        const res = await apiPost<RefreshDistributionResponse>(
          `/instruments/${i.id}/refresh-distribution`,
        );
        const interpreted = interpretRefreshDistributionResponse(res);
        if (interpreted.kind === "skipped") {
          setError(userMessageForSkippedRefresh(interpreted.reason));
          return;
        }
        if (interpreted.kind === "merge") {
          setRows((prev) =>
            prev.map((r) =>
              r.id === i.id ? { ...r, ...interpreted.instrument } : r,
            ),
          );
        } else {
          await load();
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setRefreshingIds((prev) => {
          const next = new Set(prev);
          next.delete(i.id);
          return next;
        });
      }
    },
    [load],
  );

  const refreshAllDistributions = useCallback(async () => {
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
          const res = await apiPost<RefreshDistributionResponse>(
            `/instruments/${i.id}/refresh-distribution`,
          );
          const bucket = bucketRefreshBatchResult(res);
          if (bucket === "ok") {
            ok += 1;
          } else if (bucket === "skipped_manual") {
            skippedManual += 1;
          } else {
            skippedOther += 1;
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
          `${failed} failed${firstFailure ? ` (${firstFailure.length > 120 ? `${firstFailure.slice(0, 117)}...` : firstFailure})` : ""}`,
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
  }, [rows, load]);

  const removeInstrument = useCallback(async (i: InstrumentListItem) => {
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
  }, []);

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

  return {
    initialLoad,
    error,
    notice,
    sortedRows,
    refreshingIds,
    refreshingAll,
    deletingId,
    refreshableCount,
    refreshDistribution,
    refreshAllDistributions,
    removeInstrument,
  };
}

import type { IbkrFlexSyncStatus } from "@investments/lib/ibkrFlexSync";
import { type FormEvent, useEffect, useState } from "react";
import { apiDelete, apiPost, apiPutJson } from "../../api/client";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { formatInstantForDisplay } from "../../lib/dateTimeFormat";
import { useIbkrFlexSyncStatus } from "../../lib/ibkrFlexSyncStatus";
import type { HomeBroker, PortfolioEntity } from "../home/types";
import { IbkrImportErrorDetails } from "./IbkrImportErrorDetails";
import { ImportSuccessMessage } from "./ImportBrokerSection";
import type { DegiroOk } from "./types";

type ImportIbkrFlexSectionProps = {
  exchangeBrokers: HomeBroker[];
  livePortfolios: PortfolioEntity[];
  defaultBrokerId: number | null;
  defaultPortfolioId: number | null;
};

type SyncRunResponse = {
  status: IbkrFlexSyncStatus;
  counts: Omit<DegiroOk, "ok"> | null;
};

function parseQueryIds(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function ImportIbkrFlexSection({
  exchangeBrokers,
  livePortfolios,
  defaultBrokerId,
  defaultPortfolioId,
}: ImportIbkrFlexSectionProps) {
  const { status, setStatus, reload } = useIbkrFlexSyncStatus();
  const configured = status?.configured === true;

  const [token, setToken] = useState("");
  const [queryIdsText, setQueryIdsText] = useState("");
  const [brokerId, setBrokerId] = useState<number | null>(null);
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DegiroOk | null>(null);

  const savedQueryIds = status?.queryIds.join(", ") ?? "";
  useEffect(() => {
    setQueryIdsText(savedQueryIds);
  }, [savedQueryIds]);

  const savedBrokerId = status?.brokerId ?? null;
  useEffect(() => {
    setBrokerId(savedBrokerId ?? defaultBrokerId);
  }, [savedBrokerId, defaultBrokerId]);

  const savedPortfolioId = status?.portfolioId ?? null;
  useEffect(() => {
    setPortfolioId(savedPortfolioId ?? defaultPortfolioId);
  }, [savedPortfolioId, defaultPortfolioId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const next = await apiPutJson<IbkrFlexSyncStatus>("/import/ibkr/flex", {
        token,
        queryIds: parseQueryIds(queryIdsText),
        brokerId,
        portfolioId,
      });
      setStatus(next);
      setToken("");
    });
  }

  async function onSyncNow() {
    setSyncing(true);
    await run(async () => {
      const res = await apiPost<SyncRunResponse>("/import/ibkr/flex/sync");
      setStatus(res.status);
      if (res.counts != null) {
        setResult({ ok: true, ...res.counts });
      }
    });
    setSyncing(false);
  }

  async function onRemove() {
    await run(async () => {
      await apiDelete("/import/ibkr/flex");
      await reload();
      setToken("");
    });
  }

  const canSave =
    (configured || token.trim() !== "") &&
    parseQueryIds(queryIdsText).length > 0 &&
    brokerId != null &&
    portfolioId != null;

  const lastError = status?.lastError ?? null;

  return (
    <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2>Interactive Brokers automatic sync</h2>
      <div className="space-y-2 text-sm text-slate-600">
        <p>
          Runs the Flex Queries above through the IBKR{" "}
          <strong className="font-medium">Flex Web Service</strong> on API
          startup and then hourly. Enable the service and create a token in the
          client portal under <em>Performance & Reports</em> →{" "}
          <em>Flex Queries</em> → <em>Flex Web Service Configuration</em>. The
          queries must use CSV format.
        </p>
      </div>
      <form className="form-stack" onSubmit={(e) => void onSave(e)}>
        <label className="block text-sm text-slate-700">
          Token
          <input
            type="password"
            className="form-control max-w-md"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={configured ? "Saved - leave empty to keep" : ""}
            autoComplete="off"
          />
        </label>
        <label className="block text-sm text-slate-700">
          Query IDs
          <input
            className="form-control max-w-md"
            value={queryIdsText}
            onChange={(e) => setQueryIdsText(e.target.value)}
            placeholder="e.g. 1234567, 2345678"
          />
        </label>
        <label className="block text-sm text-slate-700">
          Import into broker
          <select
            className="form-control max-w-md"
            value={brokerId ?? ""}
            onChange={(e) => setBrokerId(Number.parseInt(e.target.value, 10))}
          >
            {exchangeBrokers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          Import into portfolio
          <select
            className="form-control max-w-md"
            value={portfolioId ?? ""}
            onChange={(e) =>
              setPortfolioId(Number.parseInt(e.target.value, 10))
            }
          >
            {livePortfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !canSave}>
            Save
          </Button>
          {configured ? (
            <>
              <Button
                disabled={busy || status?.running === true}
                onClick={() => void onSyncNow()}
              >
                {syncing || status?.running === true
                  ? "Syncing..."
                  : "Sync now"}
              </Button>
              <button
                type="button"
                className="action-delete"
                disabled={busy}
                onClick={() => void onRemove()}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      </form>
      {configured && status?.lastSuccessAt != null ? (
        <p className="text-sm text-slate-600">
          Last successful sync: {formatInstantForDisplay(status.lastSuccessAt)}
        </p>
      ) : null}
      {error !== null ? (
        <ErrorAlert>
          <div className="whitespace-pre-wrap break-words">{error}</div>
        </ErrorAlert>
      ) : null}
      {error === null && lastError !== null ? (
        <ErrorAlert>
          <div className="whitespace-pre-wrap break-words">
            {status?.lastRunAt != null
              ? `Sync at ${formatInstantForDisplay(status.lastRunAt)} failed`
              : "Sync failed"}
            {lastError.queryId != null ? ` (query ${lastError.queryId})` : ""}:{" "}
            {lastError.message}
          </div>
          {lastError.errors != null ? (
            <div className="mt-1 whitespace-pre-wrap break-words">
              {lastError.errors.join("\n")}
            </div>
          ) : null}
          <IbkrImportErrorDetails
            missingIsins={lastError.missingIsins}
            ambiguousIsins={lastError.ambiguousIsins}
            missingSymbols={lastError.missingSymbols}
            ambiguousSymbols={lastError.ambiguousSymbols}
          />
        </ErrorAlert>
      ) : null}
      {result !== null ? <ImportSuccessMessage result={result} /> : null}
    </section>
  );
}

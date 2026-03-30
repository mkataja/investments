import { type FormEvent, useState } from "react";
import { apiPostFormData } from "../api";
import { Button } from "../components/Button";

type DegiroOk = { ok: true; processed: number };

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DegiroOk | null>(null);

  async function onSubmitDegiro(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiPostFormData<DegiroOk>("/import/degiro", form);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          Import transactions
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload broker exports to add or refresh transactions idempotently.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Degiro</h2>
        <p className="mt-1 text-sm text-slate-600">
          Export <strong className="font-medium">Transactions</strong> from
          Degiro (CSV). Each ISIN must match exactly one instrument (etf, stock,
          or Seligson fund). Only EUR trades are imported.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={onSubmitDegiro}
        >
          <div className="min-w-0 flex-1">
            <label htmlFor="degiro-csv" className="sr-only">
              Degiro CSV file
            </label>
            <input
              id="degiro-csv"
              name="file"
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-100"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                setFile(f ?? null);
                setResult(null);
                setError(null);
              }}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </form>
        {error !== null ? (
          <pre className="mt-3 whitespace-pre-wrap break-words rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            {error}
          </pre>
        ) : null}
        {result !== null ? (
          <p className="mt-3 text-sm text-emerald-800">
            Imported {result.processed} transaction
            {result.processed === 1 ? "" : "s"} (upserted idempotently).
          </p>
        ) : null}
      </section>
    </div>
  );
}

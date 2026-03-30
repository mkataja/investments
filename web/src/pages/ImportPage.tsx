import { type FormEvent, useEffect, useState } from "react";
import { apiPostFormData } from "../api";
import { Button } from "../components/Button";

type DegiroOk = { ok: true; processed: number };

type DegiroProposalOk = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  yahooSymbol: string;
  displayName: string;
  kind: "etf" | "stock";
  quoteType: string | null;
};

type DegiroProposalErr = {
  isin: string;
  product: string;
  referenceExchange: string;
  venue: string;
  error: string;
};

type DegiroProposal = DegiroProposalOk | DegiroProposalErr;

type DegiroNeedsInstruments = {
  ok: false;
  needsInstruments: true;
  proposals: DegiroProposal[];
};

function isProposalOk(p: DegiroProposal): p is DegiroProposalOk {
  return "yahooSymbol" in p;
}

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DegiroOk | null>(null);
  const [pending, setPending] = useState<DegiroNeedsInstruments | null>(null);
  const [selectedIsin, setSelectedIsin] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (pending === null) {
      return;
    }
    const next: Record<string, boolean> = {};
    for (const p of pending.proposals) {
      if (isProposalOk(p)) {
        next[p.isin] = true;
      }
    }
    setSelectedIsin(next);
  }, [pending]);

  async function onSubmitDegiro(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPending(null);
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await apiPostFormData<
        DegiroOk | DegiroNeedsInstruments | { message?: string }
      >("/import/degiro", form);
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === false &&
        "needsInstruments" in data &&
        data.needsInstruments === true &&
        "proposals" in data
      ) {
        setPending(data as DegiroNeedsInstruments);
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === true &&
        "processed" in data
      ) {
        setResult(data as DegiroOk);
        return;
      }
      setError("Unexpected response from server.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmAddAndImport(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file || pending === null) {
      setError("Missing file or proposals.");
      return;
    }
    const toCreate = pending.proposals.filter(
      (p): p is DegiroProposalOk =>
        isProposalOk(p) && selectedIsin[p.isin] === true,
    );
    if (toCreate.length === 0) {
      setError(
        "Select at least one instrument to add, or add instruments manually.",
      );
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append(
        "createInstruments",
        JSON.stringify(
          toCreate.map((p) => ({
            isin: p.isin,
            yahooSymbol: p.yahooSymbol,
            kind: p.kind,
          })),
        ),
      );
      const data = await apiPostFormData<DegiroOk | DegiroNeedsInstruments>(
        "/import/degiro",
        form,
      );
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === false &&
        "needsInstruments" in data &&
        data.needsInstruments === true
      ) {
        setPending(data as DegiroNeedsInstruments);
        return;
      }
      if (
        data &&
        typeof data === "object" &&
        "ok" in data &&
        data.ok === true &&
        "processed" in data
      ) {
        setPending(null);
        setResult(data as DegiroOk);
        return;
      }
      setError("Import did not complete. Check the API response.");
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
          Degiro (CSV). Each row must resolve to exactly one instrument (etf,
          stock, or Seligson fund): by{" "}
          <strong className="font-medium">ISIN</strong> in the database, or—if
          ISIN is missing on the instrument—via OpenFIGI to your{" "}
          <strong className="font-medium">Yahoo symbol</strong>. If the CSV
          contains unknown ISINs, we fetch Yahoo details and you can add them in
          one step. Only EUR trades are imported.
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
                setPending(null);
                setError(null);
              }}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : "Import"}
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

        {pending !== null ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
            <h3 className="text-sm font-semibold text-amber-950">
              Add missing instruments
            </h3>
            <p className="mt-1 text-sm text-amber-950/90">
              These ISINs are not in your portfolio yet. We matched them to
              Yahoo Finance. Select which to create, then import the same CSV
              again with those instruments.
            </p>
            <ul className="mt-3 space-y-3">
              {pending.proposals.map((p) => (
                <li
                  key={p.isin}
                  className="rounded border border-amber-200/80 bg-white p-3 text-sm"
                >
                  {isProposalOk(p) ? (
                    <label className="flex cursor-pointer gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                        checked={selectedIsin[p.isin] === true}
                        onChange={(ev) => {
                          setSelectedIsin((prev) => ({
                            ...prev,
                            [p.isin]: ev.target.checked,
                          }));
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-slate-600">
                          {p.isin}
                        </span>
                        <span className="mt-0.5 block font-medium text-slate-900">
                          {p.displayName}
                        </span>
                        <span className="mt-1 block text-xs text-slate-600">
                          Yahoo: {p.yahooSymbol} · {p.kind}
                          {p.quoteType ? ` · ${p.quoteType}` : ""}
                        </span>
                        {p.product ? (
                          <span className="mt-1 block text-xs text-slate-500">
                            Degiro: {p.product}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ) : (
                    <div>
                      <span className="font-mono text-xs text-slate-600">
                        {p.isin}
                      </span>
                      <p className="mt-1 text-sm text-red-800">{p.error}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={onConfirmAddAndImport} className="mt-4">
              <Button type="submit" disabled={busy}>
                {busy ? "Working…" : "Add selected and import"}
              </Button>
            </form>
          </div>
        ) : null}
      </section>
    </div>
  );
}

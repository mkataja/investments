import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { FileBrowseButton } from "../../components/FileBrowseButton";
import {
  type DegiroNeedsInstruments,
  type DegiroOk,
  type DegiroProposal,
  isProposalOk,
} from "./types";

type ImportDegiroSectionProps = {
  busy: boolean;
  error: string | null;
  result: DegiroOk | null;
  pending: DegiroNeedsInstruments | null;
  degiroFile: File | null;
  setDegiroFile: (f: File | null) => void;
  selectedIsin: Record<string, boolean>;
  setSelectedIsin: Dispatch<SetStateAction<Record<string, boolean>>>;
  onSubmitDegiro: (e: FormEvent) => void | Promise<void>;
  onConfirmAddAndImport: (e: FormEvent) => void | Promise<void>;
  onDegiroFileChange: () => void;
};

export function ImportDegiroSection({
  busy,
  error,
  result,
  pending,
  degiroFile,
  setDegiroFile,
  selectedIsin,
  setSelectedIsin,
  onSubmitDegiro,
  onConfirmAddAndImport,
  onDegiroFileChange,
}: ImportDegiroSectionProps) {
  return (
    <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2>Degiro</h2>
      <div className="space-y-2 text-sm text-slate-600">
        <p>
          Export <strong className="font-medium">Transactions</strong> from
          Degiro (CSV). Each row must resolve to exactly one instrument (etf,
          stock, or Seligson fund): by{" "}
          <strong className="font-medium">ISIN</strong> in the database, or - if
          ISIN is missing on the instrument - via OpenFIGI to your{" "}
          <strong className="font-medium">Yahoo symbol</strong>. If the CSV
          contains unknown ISINs, we fetch Yahoo details and you can add them in
          one step. Only EUR trades are imported.
        </p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={onSubmitDegiro}
      >
        <div className="min-w-0 flex-1">
          <FileBrowseButton
            id="degiro-csv"
            ariaLabel="Degiro CSV file"
            accept=".csv,text/csv"
            file={degiroFile}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setDegiroFile(f ?? null);
              onDegiroFileChange();
            }}
          />
        </div>
        {degiroFile !== null ? (
          <Button type="submit" disabled={busy}>
            {busy ? "Working..." : "Import"}
          </Button>
        ) : null}
      </form>
      {error !== null ? (
        <ErrorAlert>
          <div className="whitespace-pre-wrap break-words">{error}</div>
        </ErrorAlert>
      ) : null}
      {result !== null ? (
        <p className="copy-success">
          Processed {result.processed} transaction
          {result.processed === 1 ? "" : "s"}: {result.changed} written to the
          database
          {result.unchanged > 0
            ? `, ${result.unchanged} already up to date`
            : ""}
          .
        </p>
      ) : null}

      {pending !== null ? (
        <div className="page-section rounded-lg border border-amber-200 bg-amber-50/80 p-4 [&_h3]:font-semibold [&_h3]:text-amber-950">
          <h3>Add missing instruments</h3>
          <p className="text-sm text-amber-950/90">
            These ISINs are not in your portfolio yet. We matched them to Yahoo
            Finance. Select which to create, then import the same CSV again with
            those instruments.
          </p>
          <ul className="list-stack">
            {pending.proposals.map((p: DegiroProposal) => (
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
                      <span className="text-xs text-slate-600">{p.isin}</span>
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
                    <span className="text-xs text-slate-600">{p.isin}</span>
                    <p className="field-error">{p.error}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={onConfirmAddAndImport}>
            <Button type="submit" disabled={busy}>
              {busy ? "Working..." : "Add selected and import"}
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

import type { FormEvent } from "react";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { FileBrowseButton } from "../../components/FileBrowseButton";
import type { DegiroOk } from "./types";

type ImportIbkrSectionProps = {
  busy: boolean;
  ibkrError: string | null;
  ibkrResult: DegiroOk | null;
  ibkrFile: File | null;
  setIbkrFile: (f: File | null) => void;
  ibkrMissingSymbols: string[] | null;
  ibkrAmbiguousSymbols: string[] | null;
  ibkrAmbiguousIsins: string[] | null;
  ibkrMissingIsins: string[] | null;
  onSubmitIbkr: (e: FormEvent) => void | Promise<void>;
  onIbkrFileChange: () => void;
};

export function ImportIbkrSection({
  busy,
  ibkrError,
  ibkrResult,
  ibkrFile,
  setIbkrFile,
  ibkrMissingSymbols,
  ibkrAmbiguousSymbols,
  ibkrAmbiguousIsins,
  ibkrMissingIsins,
  onSubmitIbkr,
  onIbkrFileChange,
}: ImportIbkrSectionProps) {
  return (
    <section className="page-section rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2>Interactive Brokers</h2>
      <div className="space-y-3 text-sm text-slate-600">
        <p>
          Upload a CSV from an IBKR{" "}
          <strong className="font-medium">Flex Query</strong> (web client portal
          → <em>Performance & Reports</em> → <em>Flex Queries</em>). A plain
          transaction history CSV is not supported.
        </p>
        <div>
          <p className="font-medium text-slate-800">Active Flex Query</p>
          <p className="mt-1">
            Use for importing all <strong className="font-medium">past</strong>{" "}
            trades; does not include same-day fills. Includes max 365 days per
            export — you can import multiple exports to cover longer periods.
            Required columns:{" "}
            <code>
              ClientAccountID, DateTime, Symbol, ISIN, Exchange,
              TransactionType, Quantity, TradePrice, CurrencyPrimary
            </code>
            .
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-800">
            Trade Confirmation Flex Query
          </p>
          <p className="mt-1">
            Same-day fills only. Use to update{" "}
            <strong className="font-medium">today&apos;s</strong> trades not yet
            included in the above Active Flex Query. Required columns:{" "}
            <code>
              ClientAccountID, Date/Time, Symbol, ISIN, Exchange, Buy/Sell,
              Quantity, Price, CurrencyPrimary
            </code>
            .
          </p>
        </div>
        <p>
          Broker name must be <strong className="font-medium">IBKR</strong>.
          Instruments are matched by ISIN when present in the DB, otherwise
          looked up by Yahoo symbol.
        </p>
      </div>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={onSubmitIbkr}
      >
        <div className="min-w-0 flex-1">
          <FileBrowseButton
            id="ibkr-csv"
            ariaLabel="IBKR CSV file"
            accept=".csv,text/csv"
            file={ibkrFile}
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setIbkrFile(f ?? null);
              onIbkrFileChange();
            }}
          />
        </div>
        {ibkrFile !== null ? (
          <Button type="submit" disabled={busy}>
            {busy ? "Working..." : "Import"}
          </Button>
        ) : null}
      </form>
      {ibkrError !== null ? (
        <ErrorAlert>
          <div className="whitespace-pre-wrap break-words">{ibkrError}</div>
          {ibkrMissingIsins !== null && ibkrMissingIsins.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {ibkrMissingIsins.map((isin) => (
                <li key={isin} className="break-words font-mono text-sm">
                  {isin}
                </li>
              ))}
            </ul>
          ) : null}
          {ibkrAmbiguousIsins !== null && ibkrAmbiguousIsins.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {ibkrAmbiguousIsins.map((isin) => (
                <li key={isin} className="break-words font-mono text-sm">
                  {isin}
                </li>
              ))}
            </ul>
          ) : null}
          {ibkrMissingSymbols !== null && ibkrMissingSymbols.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {ibkrMissingSymbols.map((sym) => (
                <li key={sym} className="break-words font-mono text-sm">
                  {sym}
                </li>
              ))}
            </ul>
          ) : null}
          {ibkrAmbiguousSymbols !== null && ibkrAmbiguousSymbols.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {ibkrAmbiguousSymbols.map((sym) => (
                <li key={sym} className="break-words font-mono text-sm">
                  {sym}
                </li>
              ))}
            </ul>
          ) : null}
        </ErrorAlert>
      ) : null}
      {ibkrResult !== null ? (
        <p className="copy-success">
          Processed {ibkrResult.processed} transaction
          {ibkrResult.processed === 1 ? "" : "s"}: {ibkrResult.changed} written
          to the database
          {ibkrResult.unchanged > 0
            ? `, ${ibkrResult.unchanged} already up to date`
            : ""}
          .
        </p>
      ) : null}
    </section>
  );
}
